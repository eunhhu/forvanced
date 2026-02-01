use forvanced_build::{BuildOptions, BuildTarget, Builder};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};
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

/// Resolve output directory relative to project file path
fn resolve_output_dir(output_dir: &str, project_path: Option<&str>) -> PathBuf {
    let output_path = PathBuf::from(output_dir);

    // If output_dir is absolute, use as-is
    if output_path.is_absolute() {
        return output_path;
    }

    // If we have a project path, resolve relative to it
    if let Some(project_file) = project_path {
        let project_dir = PathBuf::from(project_file)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        let resolved = project_dir.join(&output_path);
        debug!(
            "Resolved output dir: {} (relative to {})",
            resolved.display(),
            project_dir.display()
        );
        return resolved;
    }

    // Fall back to current working directory
    if let Ok(cwd) = std::env::current_dir() {
        return cwd.join(output_path);
    }

    output_path
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildConfig {
    pub output_dir: String,
    pub target: String,
    pub release: bool,
    pub bundle_frida: bool,
    /// Optional project file path for relative path resolution
    pub project_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BuildResult {
    pub project_dir: String,
    pub executables: Vec<String>,
    pub target: String,
}

/// Build log event emitted during build process
#[derive(Debug, Clone, Serialize)]
pub struct BuildLogEvent {
    pub message: String,
    pub level: String, // "info", "warn", "error", "debug"
    pub timestamp: u64,
}

/// Build state for tracking build progress
#[derive(Debug, Clone, Serialize)]
pub struct BuildState {
    pub is_building: bool,
    pub phase: String,
    pub progress: u8, // 0-100
}

#[tauri::command]
pub async fn generate_project(
    app: AppHandle,
    state: State<'_, AppState>,
    output_dir: String,
    project_path: Option<String>,
) -> Result<String, String> {
    info!("generate_project called, output: {}", output_dir);

    // Emit build started
    emit_build_log(&app, "Starting project generation...", "info");

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    // Resolve output directory relative to project path
    let resolved_output_dir = resolve_output_dir(&output_dir, project_path.as_deref());
    info!("Resolved output directory: {}", resolved_output_dir.display());
    emit_build_log(&app, &format!("Output directory: {}", resolved_output_dir.display()), "info");

    // Try to find runtime path from app context first
    let builder = if let Some(runtime_path) = find_runtime_path_from_app(&app) {
        info!("Using runtime path from app: {}", runtime_path.display());
        emit_build_log(&app, &format!("Runtime template: {}", runtime_path.display()), "debug");
        Builder::with_runtime_path(runtime_path).map_err(|e| e.to_string())?
    } else {
        // Fall back to auto-detection
        emit_build_log(&app, "Using auto-detected runtime path", "debug");
        Builder::new().map_err(|e| e.to_string())?
    };

    emit_build_log(&app, "Generating project files...", "info");

    let project_dir = builder
        .generate_project(project, &resolved_output_dir)
        .await
        .map_err(|e| {
            emit_build_log(&app, &format!("Generation failed: {}", e), "error");
            e.to_string()
        })?;

    emit_build_log(&app, &format!("Project generated at: {}", project_dir.display()), "info");

    Ok(project_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn build_project(
    app: AppHandle,
    state: State<'_, AppState>,
    config: BuildConfig,
) -> Result<BuildResult, String> {
    info!("build_project called with config: {:?}", config);

    // Set building state
    emit_build_state(&app, true, "initializing", 0);
    emit_build_log(&app, "Starting build process...", "info");

    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| {
            emit_build_state(&app, false, "error", 0);
            "No project loaded".to_string()
        })?;

    let target = BuildTarget::from_str(&config.target)
        .ok_or_else(|| {
            emit_build_state(&app, false, "error", 0);
            format!("Invalid build target: {}", config.target)
        })?;

    // Try to find runtime path from app context
    let runtime_path = find_runtime_path_from_app(&app);
    if let Some(ref path) = runtime_path {
        info!("Using runtime path: {}", path.display());
        emit_build_log(&app, &format!("Runtime template: {}", path.display()), "debug");
    }

    // Resolve output directory relative to project path
    let resolved_output_dir = resolve_output_dir(&config.output_dir, config.project_path.as_deref());
    info!("Resolved output directory: {}", resolved_output_dir.display());
    emit_build_log(&app, &format!("Output directory: {}", resolved_output_dir.display()), "info");

    let options = BuildOptions {
        output_dir: resolved_output_dir.clone(),
        target,
        release: config.release,
        bundle_frida: config.bundle_frida,
        runtime_path: runtime_path.clone(),
    };

    // Try to find runtime path from app context first
    let builder = if let Some(path) = runtime_path {
        Builder::with_runtime_path(path).map_err(|e| {
            emit_build_state(&app, false, "error", 0);
            e.to_string()
        })?
    } else {
        // Fall back to auto-detection
        Builder::new().map_err(|e| {
            emit_build_state(&app, false, "error", 0);
            e.to_string()
        })?
    };

    // Generate project first
    emit_build_state(&app, true, "generating", 10);
    emit_build_log(&app, "Generating project files...", "info");

    let project_dir = builder
        .generate_project(project, &resolved_output_dir)
        .await
        .map_err(|e| {
            emit_build_state(&app, false, "error", 0);
            emit_build_log(&app, &format!("Generation failed: {}", e), "error");
            e.to_string()
        })?;

    emit_build_log(&app, &format!("Project generated at: {}", project_dir.display()), "info");
    emit_build_state(&app, true, "installing_deps", 20);

    // Install dependencies with streaming output
    emit_build_log(&app, "Installing dependencies...", "info");
    let install_cmd = if which::which("pnpm").is_ok() {
        "pnpm"
    } else if which::which("bun").is_ok() {
        "bun"
    } else {
        "npm"
    };

    let install_result = run_command_with_streaming(
        &app,
        install_cmd,
        &["install"],
        &project_dir,
    ).await;

    if let Err(e) = install_result {
        emit_build_state(&app, false, "error", 0);
        emit_build_log(&app, &format!("Failed to install dependencies: {}", e), "error");
        return Err(format!("{} install failed: {}", install_cmd, e));
    }

    // Build with Tauri
    emit_build_state(&app, true, "building", 40);
    emit_build_log(&app, "Building with Tauri...", "info");

    let mut args = vec!["tauri", "build"];
    if !options.release {
        args.push("--debug");
    }

    let target_str = options.target.tauri_target();
    if !target_str.is_empty() {
        args.push("--target");
        args.push(target_str);
    }

    if options.bundle_frida {
        args.push("--features");
        args.push("real");
    }

    let build_result = run_command_with_streaming(
        &app,
        "cargo",
        &args,
        &project_dir,
    ).await;

    if let Err(e) = build_result {
        emit_build_state(&app, false, "error", 0);
        emit_build_log(&app, &format!("Build failed: {}", e), "error");
        return Err(format!("tauri build failed: {}", e));
    }

    // Find built executables
    emit_build_state(&app, true, "finalizing", 90);
    emit_build_log(&app, "Finding built executables...", "info");

    let executables = find_executables(&project_dir, options.release);

    emit_build_state(&app, false, "complete", 100);
    emit_build_log(&app, "Build completed successfully!", "info");

    Ok(BuildResult {
        project_dir: project_dir.to_string_lossy().to_string(),
        executables: executables
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        target: format!("{:?}", options.target),
    })
}

/// Run a command with streaming output to frontend
async fn run_command_with_streaming(
    app: &AppHandle,
    cmd: &str,
    args: &[&str],
    cwd: &std::path::Path,
) -> Result<(), String> {
    let mut command = Command::new(cmd);
    command
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                emit_build_log(&app_clone, &line, "info");
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                // Determine if it's a warning or error
                let level = if line.to_lowercase().contains("error") {
                    "error"
                } else if line.to_lowercase().contains("warn") {
                    "warn"
                } else {
                    "info"
                };
                emit_build_log(&app_clone, &line, level);
            }
        });
    }

    // Wait for completion
    let status = child.wait().map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!("Command exited with status: {}", status));
    }

    Ok(())
}

/// Emit a build log event to the frontend
fn emit_build_log(app: &AppHandle, message: &str, level: &str) {
    let event = BuildLogEvent {
        message: message.to_string(),
        level: level.to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };
    let _ = app.emit("build-log", event);
}

/// Emit build state to the frontend
fn emit_build_state(app: &AppHandle, is_building: bool, phase: &str, progress: u8) {
    let state = BuildState {
        is_building,
        phase: phase.to_string(),
        progress,
    };
    let _ = app.emit("build-state", state);
}

fn find_executables(project_dir: &std::path::Path, release: bool) -> Vec<PathBuf> {
    let target_dir = project_dir.join("src-tauri/target");
    let profile = if release { "release" } else { "debug" };

    let mut executables = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let exe_dir = target_dir.join(profile);
        if exe_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&exe_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "exe").unwrap_or(false) {
                        executables.push(path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let app_path = target_dir.join(profile).join("bundle/macos");
        if app_path.exists() {
            if let Ok(entries) = std::fs::read_dir(&app_path) {
                for entry in entries.flatten() {
                    if entry
                        .path()
                        .extension()
                        .map(|e| e == "app")
                        .unwrap_or(false)
                    {
                        executables.push(entry.path());
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let deb_path = target_dir.join(profile).join("bundle/deb");
        if deb_path.exists() {
            if let Ok(entries) = std::fs::read_dir(&deb_path) {
                for entry in entries.flatten() {
                    if entry
                        .path()
                        .extension()
                        .map(|e| e == "deb")
                        .unwrap_or(false)
                    {
                        executables.push(entry.path());
                    }
                }
            }
        }
    }

    executables
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

/// Check if a build is currently in progress
#[tauri::command]
pub async fn is_build_in_progress(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.is_building.read().await)
}

/// Cancel the current build (if possible)
#[tauri::command]
pub async fn cancel_build(state: State<'_, AppState>) -> Result<(), String> {
    // Set cancel flag - actual cancellation handled by build process
    *state.build_cancelled.write().await = true;
    Ok(())
}
