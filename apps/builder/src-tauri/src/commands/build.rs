use forvanced_build::{BuildOptions, BuildTarget, Builder};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tracing::info;

use crate::AppState;

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
pub async fn generate_trainer_project(
    state: State<'_, AppState>,
    output_dir: String,
) -> Result<String, String> {
    info!("generate_trainer_project called, output: {}", output_dir);

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    let builder = Builder::new().map_err(|e| e.to_string())?;
    let project_dir = builder
        .generate_project(project, &PathBuf::from(&output_dir))
        .await
        .map_err(|e| e.to_string())?;

    Ok(project_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn build_trainer(
    state: State<'_, AppState>,
    config: BuildConfig,
) -> Result<BuildResult, String> {
    info!("build_trainer called with config: {:?}", config);

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    let target = BuildTarget::from_str(&config.target)
        .ok_or_else(|| format!("Invalid build target: {}", config.target))?;

    let options = BuildOptions {
        output_dir: PathBuf::from(&config.output_dir),
        target,
        release: config.release,
        bundle_frida: config.bundle_frida,
        skip_npm_install: false,
    };

    let builder = Builder::new().map_err(|e| e.to_string())?;
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
