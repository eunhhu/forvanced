use forvanced_build::{BuildOptions, BuildTarget, Builder};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

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

    // Check if already building
    {
        let is_building = state.is_building.read().await;
        if *is_building {
            return Err("A build is already in progress".to_string());
        }
    }

    // Set building state
    {
        *state.is_building.write().await = true;
        *state.build_cancelled.write().await = false;
    }

    emit_build_state(&app, true, "initializing", 0);
    emit_build_log(&app, "Starting build process...", "info");

    // Use a helper to ensure cleanup on any exit path
    let result = do_build(&app, &state, config).await;

    // Cleanup
    {
        *state.is_building.write().await = false;
        state.build_child_pid.store(0, Ordering::SeqCst);
    }

    if result.is_err() {
        emit_build_state(&app, false, "error", 0);
    }

    result
}

async fn do_build(
    app: &AppHandle,
    state: &State<'_, AppState>,
    config: BuildConfig,
) -> Result<BuildResult, String> {
    let project_guard = state.current_project.read().await;
    let project = project_guard
        .as_ref()
        .ok_or_else(|| "No project loaded".to_string())?;

    let target = BuildTarget::from_str(&config.target)
        .ok_or_else(|| format!("Invalid build target: {}", config.target))?;

    // Try to find runtime path from app context
    let runtime_path = find_runtime_path_from_app(app);
    if let Some(ref path) = runtime_path {
        info!("Using runtime path: {}", path.display());
        emit_build_log(app, &format!("Runtime template: {}", path.display()), "debug");
    }

    // Resolve output directory relative to project path
    let resolved_output_dir = resolve_output_dir(&config.output_dir, config.project_path.as_deref());
    info!("Resolved output directory: {}", resolved_output_dir.display());
    emit_build_log(app, &format!("Output directory: {}", resolved_output_dir.display()), "info");

    let options = BuildOptions {
        output_dir: resolved_output_dir.clone(),
        target,
        release: config.release,
        bundle_frida: config.bundle_frida,
        runtime_path: runtime_path.clone(),
    };

    // Try to find runtime path from app context first
    let builder = if let Some(ref path) = runtime_path {
        Builder::with_runtime_path(path.clone()).map_err(|e| e.to_string())?
    } else {
        Builder::new().map_err(|e| e.to_string())?
    };

    // Check for cancellation
    if *state.build_cancelled.read().await {
        return Err("Build cancelled".to_string());
    }

    // Generate project first
    emit_build_state(app, true, "generating", 10);
    emit_build_log(app, "Generating project files...", "info");
    emit_build_log(app, &format!("Runtime template: {}", runtime_path.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "auto-detect".to_string())), "debug");
    emit_build_log(app, &format!("Output directory: {}", resolved_output_dir.display()), "debug");

    // Drop the project guard before the long async operation
    let project_clone = project.clone();
    drop(project_guard);

    emit_build_log(app, "Starting project generation (this may take a moment)...", "info");
    let project_dir = builder
        .generate_project(&project_clone, &resolved_output_dir)
        .await
        .map_err(|e| {
            emit_build_log(app, &format!("Generation failed: {}", e), "error");
            e.to_string()
        })?;

    emit_build_log(app, &format!("Project generated at: {}", project_dir.display()), "info");

    // Check for cancellation
    if *state.build_cancelled.read().await {
        return Err("Build cancelled".to_string());
    }

    emit_build_state(app, true, "installing_deps", 20);

    // Install dependencies with bun (preferred) or fall back to npm
    emit_build_log(app, "Installing frontend dependencies...", "info");

    // Try bun first, fall back to npm if not available
    let (install_cmd, install_args): (&str, Vec<&str>) = if which::which("bun").is_ok() {
        ("bun", vec!["install"])
    } else if which::which("npm").is_ok() {
        ("npm", vec!["install"])
    } else {
        emit_build_log(app, "Warning: Neither bun nor npm found, skipping frontend dependencies", "warn");
        ("", vec![])
    };

    if !install_cmd.is_empty() {
        run_command_with_cancellation(
            app,
            &state.build_cancelled,
            &state.build_child_pid,
            install_cmd,
            &install_args,
            &project_dir,
        ).await.map_err(|e| {
            emit_build_log(app, &format!("Failed to install dependencies: {}", e), "error");
            format!("{} install failed: {}", install_cmd, e)
        })?;
    }

    // Check for cancellation
    if *state.build_cancelled.read().await {
        return Err("Build cancelled".to_string());
    }

    // Build frontend with bun/vite
    emit_build_state(app, true, "building_frontend", 30);
    emit_build_log(app, "Building frontend...", "info");

    let (build_cmd, build_args): (&str, Vec<&str>) = if which::which("bun").is_ok() {
        ("bun", vec!["run", "build"])
    } else if which::which("npm").is_ok() {
        ("npm", vec!["run", "build"])
    } else {
        return Err("Neither bun nor npm found. Please install bun.".to_string());
    };

    run_command_with_cancellation(
        app,
        &state.build_cancelled,
        &state.build_child_pid,
        build_cmd,
        &build_args,
        &project_dir,
    ).await.map_err(|e| {
        emit_build_log(app, &format!("Failed to build frontend: {}", e), "error");
        format!("Frontend build failed: {}", e)
    })?;

    // Check for cancellation
    if *state.build_cancelled.read().await {
        return Err("Build cancelled".to_string());
    }

    // Build Tauri/Rust backend directly with cargo
    emit_build_state(app, true, "building", 50);
    emit_build_log(app, "Building Tauri application...", "info");

    let tauri_src_dir = project_dir.join("src-tauri");

    let mut cargo_args = vec!["build"];
    if options.release {
        cargo_args.push("--release");
    }

    let target_str = options.target.tauri_target();
    if !target_str.is_empty() {
        cargo_args.push("--target");
        cargo_args.push(target_str);
    }

    if options.bundle_frida {
        cargo_args.push("--features");
        cargo_args.push("real");
    }

    run_command_with_cancellation(
        app,
        &state.build_cancelled,
        &state.build_child_pid,
        "cargo",
        &cargo_args,
        &tauri_src_dir,
    ).await.map_err(|e| {
        emit_build_log(app, &format!("Build failed: {}", e), "error");
        format!("Cargo build failed: {}", e)
    })?;

    // Find built executables
    emit_build_state(app, true, "finalizing", 90);
    emit_build_log(app, "Finding built executables...", "info");

    let executables = find_executables(&project_dir, options.release);

    emit_build_state(app, false, "complete", 100);
    emit_build_log(app, "Build completed successfully!", "info");

    Ok(BuildResult {
        project_dir: project_dir.to_string_lossy().to_string(),
        executables: executables
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        target: format!("{:?}", options.target),
    })
}

/// Run a command with streaming output and cancellation support
async fn run_command_with_cancellation(
    app: &AppHandle,
    cancelled: &Arc<RwLock<bool>>,
    child_pid: &std::sync::atomic::AtomicU32,
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

    // Store the child PID for cancellation
    let pid = child.id();
    child_pid.store(pid, Ordering::SeqCst);
    info!("Started process {} with PID {}", cmd, pid);

    // Stream stdout in background thread
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                emit_build_log(&app_clone, &line, "info");
            }
        });
    }

    // Stream stderr in background thread
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

    // Poll for completion or cancellation
    loop {
        // Check if cancelled
        if *cancelled.read().await {
            warn!("Build cancelled, killing process {}", pid);
            emit_build_log(app, "Build cancelled by user", "warn");
            kill_process_tree(pid);
            child_pid.store(0, Ordering::SeqCst);
            return Err("Build cancelled".to_string());
        }

        // Check if process finished
        match child.try_wait() {
            Ok(Some(status)) => {
                child_pid.store(0, Ordering::SeqCst);
                if !status.success() {
                    return Err(format!("Command exited with status: {}", status));
                }
                return Ok(());
            }
            Ok(None) => {
                // Still running, wait a bit
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
            Err(e) => {
                child_pid.store(0, Ordering::SeqCst);
                return Err(format!("Failed to wait for process: {}", e));
            }
        }
    }
}

/// Kill a process and its children
fn kill_process_tree(pid: u32) {
    #[cfg(unix)]
    {
        use std::process::Command;
        // Kill process group (negative PID kills the group)
        let _ = Command::new("kill")
            .args(["-TERM", "--", &format!("-{}", pid)])
            .status();
        // Also try killing just the process
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        // Use taskkill to kill process tree
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .status();
    }
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

/// Cancel the current build
#[tauri::command]
pub async fn cancel_build(state: State<'_, AppState>) -> Result<(), String> {
    info!("Cancel build requested");

    // Set cancel flag
    *state.build_cancelled.write().await = true;

    // Also try to kill the current child process immediately
    let pid = state.build_child_pid.load(Ordering::SeqCst);
    if pid != 0 {
        info!("Killing build process with PID {}", pid);
        kill_process_tree(pid);
    }

    Ok(())
}
