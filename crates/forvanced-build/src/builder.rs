//! Build system for generating standalone project applications
//!
//! Uses apps/runtime as the template and embeds project configuration.

use crate::error::{BuildError, InstallInstruction, MissingTool, MissingToolsInfo};
use forvanced_core::Project;
use std::path::{Path, PathBuf};
use std::process::Command;
use tokio::fs;
use tracing::{debug, info};

/// Build target platform
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildTarget {
    /// Current platform
    Current,
    /// Windows (x86_64)
    WindowsX64,
    /// macOS (x86_64)
    MacOsX64,
    /// macOS (ARM64)
    MacOsArm64,
    /// Linux (x86_64)
    LinuxX64,
    /// Android
    Android,
    /// iOS
    Ios,
}

impl BuildTarget {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "current" => Some(Self::Current),
            "windows" | "windows-x64" | "win64" => Some(Self::WindowsX64),
            "macos-x64" | "macos-intel" => Some(Self::MacOsX64),
            "macos-arm64" | "macos-silicon" | "macos" => Some(Self::MacOsArm64),
            "linux" | "linux-x64" => Some(Self::LinuxX64),
            "android" => Some(Self::Android),
            "ios" => Some(Self::Ios),
            _ => None,
        }
    }

    pub fn tauri_target(&self) -> &'static str {
        match self {
            Self::Current => "",
            Self::WindowsX64 => "x86_64-pc-windows-msvc",
            Self::MacOsX64 => "x86_64-apple-darwin",
            Self::MacOsArm64 => "aarch64-apple-darwin",
            Self::LinuxX64 => "x86_64-unknown-linux-gnu",
            Self::Android => "aarch64-linux-android",
            Self::Ios => "aarch64-apple-ios",
        }
    }
}

/// Build options
#[derive(Debug, Clone)]
pub struct BuildOptions {
    /// Output directory for the build
    pub output_dir: PathBuf,
    /// Target platform
    pub target: BuildTarget,
    /// Build in release mode
    pub release: bool,
    /// Bundle Frida runtime
    pub bundle_frida: bool,
    /// Path to runtime template (apps/runtime)
    pub runtime_path: Option<PathBuf>,
}

impl Default for BuildOptions {
    fn default() -> Self {
        Self {
            output_dir: PathBuf::from("./dist"),
            target: BuildTarget::Current,
            release: true,
            bundle_frida: true,
            runtime_path: None,
        }
    }
}

/// Build output information
#[derive(Debug, Clone)]
pub struct BuildOutput {
    /// Path to the generated project
    pub project_dir: PathBuf,
    /// Path to the built executable(s)
    pub executables: Vec<PathBuf>,
    /// Target platform
    pub target: BuildTarget,
}

/// Project configuration for runtime (serialized and embedded)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub name: String,
    pub version: String,
    pub target_process: Option<String>,
    pub auto_attach: bool,
    pub components: Vec<serde_json::Value>,
    pub scripts: Vec<serde_json::Value>,
    pub canvas: CanvasConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CanvasConfig {
    pub width: u32,
    pub height: u32,
    pub padding: u32,
    pub gap: u32,
}

impl From<&Project> for ProjectConfig {
    fn from(project: &Project) -> Self {
        Self {
            name: project.name.clone(),
            version: project.version.clone(),
            target_process: project.config.target.process_name.clone(),
            auto_attach: project.config.target.auto_attach,
            components: project
                .ui
                .components
                .iter()
                .map(|c| serde_json::to_value(c).unwrap_or_default())
                .collect(),
            scripts: project
                .scripts
                .iter()
                .map(|s| serde_json::to_value(s).unwrap_or_default())
                .collect(),
            canvas: CanvasConfig {
                width: project.ui.width,
                height: project.ui.height,
                padding: project.ui.padding,
                gap: project.ui.gap,
            },
        }
    }
}

/// Builder for generating project applications
pub struct Builder {
    /// Path to the runtime template
    runtime_path: PathBuf,
}

impl Builder {
    /// Create a new builder with the runtime template path
    pub fn new() -> Result<Self, BuildError> {
        // Try to find runtime path relative to workspace
        let runtime_path = find_runtime_path()?;
        Ok(Self { runtime_path })
    }

    /// Create a builder with a specific runtime path
    pub fn with_runtime_path(runtime_path: PathBuf) -> Result<Self, BuildError> {
        if !runtime_path.exists() {
            return Err(BuildError::RuntimeNotFound(runtime_path));
        }
        Ok(Self { runtime_path })
    }

    /// Generate a project from a Forvanced project
    /// This copies the runtime template and embeds the project config
    pub async fn generate_project(
        &self,
        project: &Project,
        output_dir: &Path,
    ) -> Result<PathBuf, BuildError> {
        info!("Generating project: {}", project.name);
        info!("Runtime path: {}", self.runtime_path.display());
        info!("Output dir: {}", output_dir.display());

        // Validate project
        if project.ui.components.is_empty() {
            return Err(BuildError::EmptyProject);
        }

        // Create output directory
        let project_dir = output_dir.join(&sanitize_name(&project.name));
        info!("Project dir: {}", project_dir.display());

        if project_dir.exists() {
            info!("Removing existing project directory...");
            fs::remove_dir_all(&project_dir).await?;
            info!("Existing directory removed");
        }
        fs::create_dir_all(&project_dir).await?;
        info!("Created project directory");

        // Copy runtime template
        info!("Copying runtime template from {} to {}...", self.runtime_path.display(), project_dir.display());
        copy_dir_recursive(&self.runtime_path, &project_dir).await?;
        info!("Copied runtime template to: {}", project_dir.display());

        // Generate project config
        info!("Generating project config...");
        let config = ProjectConfig::from(project);
        let config_json = serde_json::to_string_pretty(&config)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;

        // Write config to be embedded at build time
        let config_path = project_dir.join("src-tauri/project_config.json");
        fs::write(&config_path, &config_json).await?;
        info!("Written project config: {}", config_path.display());

        // Update tauri.conf.json with project name
        info!("Updating tauri.conf.json...");
        self.update_tauri_config(&project_dir, project).await?;
        info!("Updated tauri.conf.json");

        // Update Cargo.toml with project name
        info!("Updating Cargo.toml...");
        self.update_cargo_toml(&project_dir, project).await?;
        info!("Updated Cargo.toml");

        // Update package.json with project name
        info!("Updating package.json...");
        self.update_package_json(&project_dir, project).await?;
        info!("Updated package.json");

        // Generate lib.rs that loads the embedded config
        info!("Generating lib.rs...");
        self.generate_lib_rs(&project_dir, project).await?;
        info!("Generated lib.rs");

        info!("Project generated at: {}", project_dir.display());
        Ok(project_dir)
    }

    /// Build the generated project
    pub async fn build(
        &self,
        project: &Project,
        options: &BuildOptions,
    ) -> Result<BuildOutput, BuildError> {
        // Check for required tools before starting
        self.check_required_tools()?;

        // First generate the project
        let project_dir = self.generate_project(project, &options.output_dir).await?;

        // Install dependencies
        info!("Installing dependencies...");
        let install_cmd = if which::which("pnpm").is_ok() {
            "pnpm"
        } else if which::which("bun").is_ok() {
            "bun"
        } else {
            "npm"
        };

        let install_status = Command::new(install_cmd)
            .arg("install")
            .current_dir(&project_dir)
            .status()
            .map_err(|e| BuildError::CommandFailed(format!("{} install failed: {}", install_cmd, e)))?;

        if !install_status.success() {
            return Err(BuildError::CommandFailed(format!(
                "{} install failed",
                install_cmd
            )));
        }

        // Build with Tauri
        info!("Building project...");
        let mut tauri_cmd = Command::new("cargo");
        tauri_cmd.arg("tauri").arg("build");

        if !options.release {
            tauri_cmd.arg("--debug");
        }

        let target_str = options.target.tauri_target();
        if !target_str.is_empty() {
            tauri_cmd.arg("--target").arg(target_str);
        }

        // Set feature flags based on options
        if options.bundle_frida {
            tauri_cmd.args(["--features", "real"]);
        }

        tauri_cmd.current_dir(&project_dir);

        let build_status = tauri_cmd
            .status()
            .map_err(|e| BuildError::CommandFailed(format!("tauri build failed: {}", e)))?;

        if !build_status.success() {
            return Err(BuildError::CommandFailed("tauri build failed".to_string()));
        }

        // Find built executables
        let executables = find_executables(&project_dir, options.release)?;

        Ok(BuildOutput {
            project_dir,
            executables,
            target: options.target,
        })
    }

    async fn update_tauri_config(&self, project_dir: &Path, project: &Project) -> Result<(), BuildError> {
        let config_path = project_dir.join("src-tauri/tauri.conf.json");
        let content = fs::read_to_string(&config_path).await?;

        let mut config: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;

        // Update product name and identifier
        if let Some(obj) = config.as_object_mut() {
            obj.insert("productName".to_string(), serde_json::json!(project.name));

            // identifier is at root level in Tauri v2
            let identifier = format!("com.forvanced.{}", sanitize_name(&project.name));
            obj.insert("identifier".to_string(), serde_json::json!(identifier));

            // Update window title and size
            if let Some(app) = obj.get_mut("app").and_then(|a| a.as_object_mut()) {
                if let Some(windows) = app.get_mut("windows").and_then(|w| w.as_array_mut()) {
                    if let Some(window) = windows.first_mut().and_then(|w| w.as_object_mut()) {
                        window.insert("title".to_string(), serde_json::json!(project.name));
                        window.insert("width".to_string(), serde_json::json!(project.ui.width));
                        window.insert("height".to_string(), serde_json::json!(project.ui.height + 60)); // Add header
                    }
                }
            }
        }

        let updated = serde_json::to_string_pretty(&config)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;
        fs::write(&config_path, updated).await?;

        Ok(())
    }

    async fn update_cargo_toml(&self, project_dir: &Path, project: &Project) -> Result<(), BuildError> {
        let cargo_path = project_dir.join("src-tauri/Cargo.toml");

        let sanitized = sanitize_name(&project.name);
        let lib_name = sanitized.replace('-', "_");

        // Generate a standalone Cargo.toml without workspace inheritance
        let cargo_content = format!(
            r#"[package]
name = "{name}"
version = "{version}"
edition = "2021"
authors = ["Forvanced Team"]
license = "MIT"

[features]
default = ["mock"]
mock = []
real = []

[lib]
name = "{lib_name}_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = {{ version = "2", features = [] }}

[dependencies]
tauri = {{ version = "2", features = ["devtools"] }}
serde = {{ version = "1.0", features = ["derive"] }}
serde_json = "1.0"
tokio = {{ version = "1.35", features = ["full"] }}
tracing = "0.1"
tracing-subscriber = {{ version = "0.3", features = ["env-filter"] }}
async-trait = "0.1"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
"#,
            name = sanitized,
            version = project.version,
            lib_name = lib_name,
        );

        fs::write(&cargo_path, cargo_content).await?;
        Ok(())
    }

    async fn update_package_json(&self, project_dir: &Path, project: &Project) -> Result<(), BuildError> {
        let pkg_path = project_dir.join("package.json");
        let content = fs::read_to_string(&pkg_path).await?;

        let mut pkg: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;

        if let Some(obj) = pkg.as_object_mut() {
            obj["name"] = serde_json::json!(sanitize_name(&project.name));
            obj["version"] = serde_json::json!(&project.version);
        }

        let updated = serde_json::to_string_pretty(&pkg)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;
        fs::write(&pkg_path, updated).await?;

        Ok(())
    }

    async fn generate_lib_rs(&self, project_dir: &Path, project: &Project) -> Result<(), BuildError> {
        let lib_path = project_dir.join("src-tauri/src/lib.rs");

        let content = r#"//! Generated standalone project runtime

mod commands;
mod state;

use state::AppState;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Embedded project configuration
const PROJECT_CONFIG: &str = include_str!("../project_config.json");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive(tracing::level_filters::LevelFilter::INFO.into()))
        .init();

    tracing::info!("Starting Generated Project");

    // Load embedded config
    let config: state::ProjectConfig = serde_json::from_str(PROJECT_CONFIG)
        .expect("Failed to parse embedded project config");

    let app_state = AppState::from_config(config);
    let app_state = Arc::new(RwLock::new(app_state));

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_project_config,
            commands::get_component_value,
            commands::set_component_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
"#;

        fs::write(&lib_path, content).await?;

        // Also generate standalone commands.rs, state.rs, and main.rs
        self.generate_commands_rs(project_dir).await?;
        self.generate_state_rs(project_dir).await?;
        self.generate_main_rs(project_dir, project).await?;

        Ok(())
    }

    async fn generate_main_rs(&self, project_dir: &Path, project: &Project) -> Result<(), BuildError> {
        let path = project_dir.join("src-tauri/src/main.rs");
        let lib_name = sanitize_name(&project.name).replace('-', "_");

        let content = format!(
            r#"// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {{
    {lib_name}_lib::run()
}}
"#,
            lib_name = lib_name
        );

        fs::write(&path, content).await?;
        Ok(())
    }

    async fn generate_commands_rs(&self, project_dir: &Path) -> Result<(), BuildError> {
        let path = project_dir.join("src-tauri/src/commands.rs");

        let content = r#"//! Generated Tauri commands

use crate::state::{AppState, ProjectConfig};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Get the project configuration
#[tauri::command]
pub async fn get_project_config(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<ProjectConfig, String> {
    let state = state.read().await;
    Ok(state.config.clone())
}

/// Get a component's current value
#[tauri::command]
pub async fn get_component_value(
    state: State<'_, Arc<RwLock<AppState>>>,
    component_id: String,
) -> Result<serde_json::Value, String> {
    let state = state.read().await;
    Ok(state.component_values.get(&component_id).cloned().unwrap_or(serde_json::Value::Null))
}

/// Set a component's value
#[tauri::command]
pub async fn set_component_value(
    state: State<'_, Arc<RwLock<AppState>>>,
    component_id: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let mut state = state.write().await;
    state.component_values.insert(component_id, value);
    Ok(())
}
"#;

        fs::write(&path, content).await?;
        Ok(())
    }

    async fn generate_state_rs(&self, project_dir: &Path) -> Result<(), BuildError> {
        let path = project_dir.join("src-tauri/src/state.rs");

        let content = r#"//! Generated application state

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Project configuration (embedded at build time)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub name: String,
    pub version: String,
    pub target_process: Option<String>,
    pub auto_attach: bool,
    pub components: Vec<serde_json::Value>,
    pub scripts: Vec<serde_json::Value>,
    pub canvas: CanvasConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasConfig {
    pub width: u32,
    pub height: u32,
    pub padding: u32,
    pub gap: u32,
}

/// Application state
pub struct AppState {
    pub config: ProjectConfig,
    pub component_values: HashMap<String, serde_json::Value>,
}

impl AppState {
    pub fn from_config(config: ProjectConfig) -> Self {
        Self {
            config,
            component_values: HashMap::new(),
        }
    }
}
"#;

        fs::write(&path, content).await?;
        Ok(())
    }

    /// Check if all required build tools are installed
    fn check_required_tools(&self) -> Result<(), BuildError> {
        let mut missing = Vec::new();

        // Check for Node.js package manager (npm/pnpm/bun)
        let has_node_pm = which::which("npm").is_ok()
            || which::which("pnpm").is_ok()
            || which::which("bun").is_ok();

        if !has_node_pm {
            missing.push(MissingTool {
                name: "Node.js",
                description: "JavaScript 런타임 및 패키지 매니저 (npm 포함)",
                install_instructions: vec![
                    InstallInstruction {
                        platform: "Windows",
                        command: "winget install OpenJS.NodeJS.LTS",
                        url: Some("https://nodejs.org"),
                    },
                    InstallInstruction {
                        platform: "macOS",
                        command: "brew install node",
                        url: Some("https://nodejs.org"),
                    },
                    InstallInstruction {
                        platform: "Linux",
                        command: "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs",
                        url: Some("https://nodejs.org"),
                    },
                ],
            });
        }

        // Check for Rust/Cargo
        if which::which("cargo").is_err() {
            missing.push(MissingTool {
                name: "Rust",
                description: "Rust 프로그래밍 언어 및 Cargo 패키지 매니저",
                install_instructions: vec![
                    InstallInstruction {
                        platform: "Windows/macOS/Linux",
                        command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
                        url: Some("https://rustup.rs"),
                    },
                ],
            });
        }

        // Check for Tauri CLI
        let has_tauri = which::which("cargo-tauri").is_ok() || which::which("tauri").is_ok();
        if !has_tauri {
            missing.push(MissingTool {
                name: "Tauri CLI",
                description: "Tauri 앱 빌드 도구",
                install_instructions: vec![
                    InstallInstruction {
                        platform: "모든 플랫폼",
                        command: "cargo install tauri-cli",
                        url: None,
                    },
                ],
            });
        }

        if !missing.is_empty() {
            return Err(BuildError::MissingTools(MissingToolsInfo { missing }));
        }

        Ok(())
    }
}

impl Default for Builder {
    fn default() -> Self {
        Self::new().expect("Failed to create builder")
    }
}

/// Find the runtime template path
fn find_runtime_path() -> Result<PathBuf, BuildError> {
    let cwd = std::env::current_dir().unwrap_or_default();
    debug!("Searching for runtime template from cwd: {}", cwd.display());

    // Try common locations - including when running from apps/builder
    let candidates = [
        PathBuf::from("apps/runtime"),
        PathBuf::from("../runtime"),              // When in apps/builder
        PathBuf::from("../apps/runtime"),
        PathBuf::from("../../apps/runtime"),
        PathBuf::from("../../runtime"),           // When in apps/builder/src-tauri
        cwd.join("apps/runtime"),
        cwd.join("../runtime"),
    ];

    for path in &candidates {
        if path.exists() && path.join("src-tauri").exists() {
            let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
            debug!("Found runtime template at: {}", canonical.display());
            return Ok(canonical);
        }
    }

    // Try from CARGO_MANIFEST_DIR
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let workspace_root = PathBuf::from(&manifest_dir)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf());

        if let Some(root) = workspace_root {
            let runtime_path = root.join("apps/runtime");
            if runtime_path.exists() {
                debug!("Found runtime template via CARGO_MANIFEST_DIR: {}", runtime_path.display());
                return Ok(runtime_path);
            }
        }
    }

    // Try to find workspace root by looking for Cargo.toml with [workspace]
    if let Some(workspace_root) = find_workspace_root(&cwd) {
        let runtime_path = workspace_root.join("apps/runtime");
        if runtime_path.exists() && runtime_path.join("src-tauri").exists() {
            debug!("Found runtime template via workspace root: {}", runtime_path.display());
            return Ok(runtime_path);
        }
    }

    Err(BuildError::RuntimeNotFound(PathBuf::from("apps/runtime")))
}

/// Find the workspace root by searching upward for Cargo.toml with [workspace]
fn find_workspace_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();

    for _ in 0..10 {  // Limit search depth
        let cargo_toml = current.join("Cargo.toml");
        if cargo_toml.exists() {
            // Check if it's a workspace root
            if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
                if content.contains("[workspace]") {
                    return Some(current);
                }
            }
        }

        if !current.pop() {
            break;
        }
    }

    None
}

/// Recursively copy a directory (using blocking I/O for better performance)
async fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), BuildError> {
    let src = src.to_path_buf();
    let dst = dst.to_path_buf();

    tokio::task::spawn_blocking(move || {
        copy_dir_recursive_sync(&src, &dst)
    })
    .await
    .map_err(|e| BuildError::CommandFailed(format!("Copy task failed: {}", e)))??;

    Ok(())
}

/// Synchronous directory copy (faster than async for many small files)
fn copy_dir_recursive_sync(src: &Path, dst: &Path) -> Result<(), BuildError> {
    debug!("copy_dir_recursive_sync: {} -> {}", src.display(), dst.display());
    std::fs::create_dir_all(dst)?;

    let entries = std::fs::read_dir(src)?;
    let mut file_count = 0;
    let mut dir_count = 0;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().unwrap();
        let dst_path = dst.join(file_name);

        // Skip certain directories
        let name = file_name.to_string_lossy();
        if name == "node_modules" || name == "target" || name == "dist" || name == ".git" {
            debug!("Skipping: {}", name);
            continue;
        }

        if path.is_dir() {
            dir_count += 1;
            copy_dir_recursive_sync(&path, &dst_path)?;
        } else {
            file_count += 1;
            std::fs::copy(&path, &dst_path)?;
        }
    }

    debug!("Copied {} files and {} directories from {}", file_count, dir_count, src.display());
    Ok(())
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn find_executables(project_dir: &Path, release: bool) -> Result<Vec<PathBuf>, BuildError> {
    let profile = if release { "release" } else { "debug" };
    
    // Tauri outputs to project_dir/target (not src-tauri/target)
    // When running in a workspace, it may also output to workspace root target
    let possible_target_dirs = [
        project_dir.join("target"),
        project_dir.join("src-tauri/target"),
    ];

    let mut executables = Vec::new();

    for target_dir in &possible_target_dirs {
        if !target_dir.exists() {
            continue;
        }

        let bundle_dir = target_dir.join(profile).join("bundle");
        if !bundle_dir.exists() {
            continue;
        }

        debug!("Searching for executables in: {}", bundle_dir.display());

        // macOS: .app and .dmg
        let macos_dir = bundle_dir.join("macos");
        if macos_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&macos_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "app").unwrap_or(false) {
                        info!("Found macOS app: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        let dmg_dir = bundle_dir.join("dmg");
        if dmg_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&dmg_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "dmg").unwrap_or(false) {
                        info!("Found macOS dmg: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        // Windows: .exe and .msi
        let exe_dir = target_dir.join(profile);
        if exe_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&exe_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "exe").unwrap_or(false) {
                        info!("Found Windows exe: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        let msi_dir = bundle_dir.join("msi");
        if msi_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&msi_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "msi").unwrap_or(false) {
                        info!("Found Windows msi: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        let nsis_dir = bundle_dir.join("nsis");
        if nsis_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nsis_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "exe").unwrap_or(false) {
                        info!("Found Windows nsis installer: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        // Linux: .deb, .rpm, .AppImage
        let deb_dir = bundle_dir.join("deb");
        if deb_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&deb_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "deb").unwrap_or(false) {
                        info!("Found Linux deb: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        let rpm_dir = bundle_dir.join("rpm");
        if rpm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&rpm_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "rpm").unwrap_or(false) {
                        info!("Found Linux rpm: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }

        let appimage_dir = bundle_dir.join("appimage");
        if appimage_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&appimage_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    if name.ends_with(".AppImage") {
                        info!("Found Linux AppImage: {}", path.display());
                        executables.push(path);
                    }
                }
            }
        }
    }

    debug!("Found {} executable(s)", executables.len());
    Ok(executables)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_name() {
        assert_eq!(sanitize_name("My Project!"), "my-project");
        assert_eq!(sanitize_name("Test_Project-1"), "test_project-1");
        assert_eq!(sanitize_name("Game Trainer v2"), "game-trainer-v2");
    }

    #[test]
    fn test_build_target_from_str() {
        assert_eq!(BuildTarget::from_str("current"), Some(BuildTarget::Current));
        assert_eq!(
            BuildTarget::from_str("windows"),
            Some(BuildTarget::WindowsX64)
        );
        assert_eq!(
            BuildTarget::from_str("macos"),
            Some(BuildTarget::MacOsArm64)
        );
    }
}
