use forvanced_build::{BuildOptions, BuildTarget, Builder};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tracing::{debug, info};

use crate::AppState;

/// Find the runtime path relative to the Tauri app
fn find_runtime_path_from_app(app: &AppHandle) -> Option<PathBuf> {
    // Try to get the resource dir from Tauri
    if let Ok(resource_dir) = app.path().resource_dir() {
        debug!("Tauri resource dir: {}", resource_dir.display());

        // In development, resource dir is something like apps/builder/src-tauri
        // Runtime would be at ../runtime or ../../apps/runtime
        let candidates = [
            resource_dir.join("../../../apps/runtime"),
            resource_dir.join("../../runtime"),
            resource_dir.join("../runtime"),
        ];

        for path in &candidates {
            if path.exists() && path.join("src-tauri").exists() {
                if let Ok(canonical) = path.canonicalize() {
                    debug!("Found runtime via resource_dir: {}", canonical.display());
                    return Some(canonical);
                }
            }
        }
    }

    // Try from current exe location
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            debug!("Exe dir: {}", exe_dir.display());

            // Navigate up to find workspace root
            let mut current = exe_dir.to_path_buf();
            for _ in 0..10 {
                let runtime_path = current.join("apps/runtime");
                if runtime_path.exists() && runtime_path.join("src-tauri").exists() {
                    debug!("Found runtime via exe path: {}", runtime_path.display());
                    return Some(runtime_path);
                }
                if !current.pop() {
                    break;
                }
            }
        }
    }

    // Try from current working directory
    if let Ok(cwd) = std::env::current_dir() {
        debug!("Current dir: {}", cwd.display());

        let candidates = [
            cwd.join("apps/runtime"),
            cwd.join("../runtime"),
            cwd.join("../apps/runtime"),
        ];

        for path in &candidates {
            if path.exists() && path.join("src-tauri").exists() {
                if let Ok(canonical) = path.canonicalize() {
                    debug!("Found runtime via cwd: {}", canonical.display());
                    return Some(canonical);
                }
            }
        }
    }

    None
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildConfig {
    pub output_dir: String,
    pub target: String,
    pub release: bool,
    pub bundle_frida: bool,
}

#[derive(Debug, Serialize)]
pub struct BuildResult {
    pub project_dir: String,
    pub executables: Vec<String>,
    pub target: String,
}

#[tauri::command]
pub async fn generate_project(
    app: AppHandle,
    state: State<'_, AppState>,
    output_dir: String,
) -> Result<String, String> {
    info!("generate_project called, output: {}", output_dir);

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    // Try to find runtime path from app context first
    let builder = if let Some(runtime_path) = find_runtime_path_from_app(&app) {
        info!("Using runtime path from app: {}", runtime_path.display());
        Builder::with_runtime_path(runtime_path).map_err(|e| e.to_string())?
    } else {
        // Fall back to auto-detection
        Builder::new().map_err(|e| e.to_string())?
    };

    let project_dir = builder
        .generate_project(project, &PathBuf::from(&output_dir))
        .await
        .map_err(|e| e.to_string())?;

    Ok(project_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn build_project(
    app: AppHandle,
    state: State<'_, AppState>,
    config: BuildConfig,
) -> Result<BuildResult, String> {
    info!("build_project called with config: {:?}", config);

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    let target = BuildTarget::from_str(&config.target)
        .ok_or_else(|| format!("Invalid build target: {}", config.target))?;

    // Try to find runtime path from app context
    let runtime_path = find_runtime_path_from_app(&app);
    if let Some(ref path) = runtime_path {
        info!("Using runtime path: {}", path.display());
    }

    let options = BuildOptions {
        output_dir: PathBuf::from(&config.output_dir),
        target,
        release: config.release,
        bundle_frida: config.bundle_frida,
        runtime_path: runtime_path.clone(),
    };

    // Try to find runtime path from app context first
    let builder = if let Some(path) = runtime_path {
        Builder::with_runtime_path(path).map_err(|e| e.to_string())?
    } else {
        // Fall back to auto-detection
        Builder::new().map_err(|e| e.to_string())?
    };

    let output = builder
        .build(project, &options)
        .await
        .map_err(|e| e.to_string())?;

    Ok(BuildResult {
        project_dir: output.project_dir.to_string_lossy().to_string(),
        executables: output
            .executables
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        target: format!("{:?}", output.target),
    })
}

#[tauri::command]
pub fn get_build_targets() -> Vec<String> {
    vec![
        "current".to_string(),
        "windows-x64".to_string(),
        "macos-arm64".to_string(),
        "macos-x64".to_string(),
        "linux-x64".to_string(),
    ]
}

#[tauri::command]
pub async fn preview_generated_code(state: State<'_, AppState>) -> Result<PreviewCode, String> {
    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    let ui_code = forvanced_build::codegen::generate_ui_code(project);
    let frida_script = forvanced_build::codegen::generate_frida_script(project);

    Ok(PreviewCode {
        ui_code,
        frida_script,
    })
}

#[derive(Debug, Serialize)]
pub struct PreviewCode {
    pub ui_code: String,
    pub frida_script: String,
}
