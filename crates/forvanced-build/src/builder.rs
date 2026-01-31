//! Build system for generating standalone project applications
//!
//! Uses apps/runtime as the template and embeds project configuration.

use crate::error::BuildError;
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

        // Validate project
        if project.ui.components.is_empty() {
            return Err(BuildError::EmptyProject);
        }

        // Create output directory
        let project_dir = output_dir.join(&sanitize_name(&project.name));
        if project_dir.exists() {
            fs::remove_dir_all(&project_dir).await?;
        }
        fs::create_dir_all(&project_dir).await?;

        // Copy runtime template
        copy_dir_recursive(&self.runtime_path, &project_dir).await?;
        debug!("Copied runtime template to: {}", project_dir.display());

        // Generate project config
        let config = ProjectConfig::from(project);
        let config_json = serde_json::to_string_pretty(&config)
            .map_err(|e| BuildError::SerializationError(e.to_string()))?;

        // Write config to be embedded at build time
        let config_path = project_dir.join("src-tauri/project_config.json");
        fs::write(&config_path, &config_json).await?;
        debug!("Written project config: {}", config_path.display());

        // Update tauri.conf.json with project name
        self.update_tauri_config(&project_dir, project).await?;

        // Update Cargo.toml with project name
        self.update_cargo_toml(&project_dir, project).await?;

        // Update package.json with project name
        self.update_package_json(&project_dir, project).await?;

        // Generate lib.rs that loads the embedded config
        self.generate_lib_rs(&project_dir).await?;

        info!("Project generated at: {}", project_dir.display());
        Ok(project_dir)
    }

    /// Build the generated project
    pub async fn build(
        &self,
        project: &Project,
        options: &BuildOptions,
    ) -> Result<BuildOutput, BuildError> {
        // First generate the project
        let project_dir = self.generate_project(project, &options.output_dir).await?;

        // Check for tauri CLI
        if which::which("cargo-tauri").is_err() && which::which("tauri").is_err() {
            return Err(BuildError::TauriCliNotFound);
        }

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
            obj["productName"] = serde_json::json!(project.name);

            if let Some(bundle) = obj.get_mut("bundle").and_then(|b| b.as_object_mut()) {
                let identifier = format!("com.forvanced.{}", sanitize_name(&project.name));
                bundle["identifier"] = serde_json::json!(identifier);
            }

            // Update window title and size
            if let Some(app) = obj.get_mut("app").and_then(|a| a.as_object_mut()) {
                if let Some(windows) = app.get_mut("windows").and_then(|w| w.as_array_mut()) {
                    if let Some(window) = windows.first_mut().and_then(|w| w.as_object_mut()) {
                        window["title"] = serde_json::json!(project.name);
                        window["width"] = serde_json::json!(project.ui.width);
                        window["height"] = serde_json::json!(project.ui.height + 60); // Add header
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
        let content = fs::read_to_string(&cargo_path).await?;

        let sanitized = sanitize_name(&project.name);
        let lib_name = sanitized.replace('-', "_");

        // Simple string replacement for package name
        let updated = content
            .replace("forvanced-runtime", &sanitized)
            .replace("forvanced_runtime_lib", &format!("{}_lib", lib_name));

        fs::write(&cargo_path, updated).await?;
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

    async fn generate_lib_rs(&self, project_dir: &Path) -> Result<(), BuildError> {
        let lib_path = project_dir.join("src-tauri/src/lib.rs");

        // Generate lib.rs that loads embedded config
        let content = r#"//! Generated project runtime

mod commands;
mod state;

use state::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Embedded project configuration
const PROJECT_CONFIG: &str = include_str!("../project_config.json");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("forvanced=debug".parse().unwrap()))
        .init();

    tracing::info!("Starting Forvanced Project Runtime");

    // Load embedded config
    let config: state::ProjectConfig = serde_json::from_str(PROJECT_CONFIG)
        .expect("Failed to parse embedded project config");

    let mut app_state = AppState::new();
    app_state.load_config(config);

    let app_state = Arc::new(Mutex::new(app_state));

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_project_config,
            commands::attach_process,
            commands::detach_process,
            commands::execute_action,
            commands::trigger_ui_event,
            commands::get_component_value,
            commands::set_component_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
"#;

        fs::write(&lib_path, content).await?;
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
    // Try common locations
    let candidates = [
        PathBuf::from("apps/runtime"),
        PathBuf::from("../apps/runtime"),
        PathBuf::from("../../apps/runtime"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("apps/runtime"),
    ];

    for path in &candidates {
        if path.exists() && path.join("src-tauri").exists() {
            return Ok(path.clone());
        }
    }

    // Try from CARGO_MANIFEST_DIR
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let workspace_root = PathBuf::from(manifest_dir)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf());

        if let Some(root) = workspace_root {
            let runtime_path = root.join("apps/runtime");
            if runtime_path.exists() {
                return Ok(runtime_path);
            }
        }
    }

    Err(BuildError::RuntimeNotFound(PathBuf::from("apps/runtime")))
}

/// Recursively copy a directory
async fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), BuildError> {
    fs::create_dir_all(dst).await?;

    let mut entries = fs::read_dir(src).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let file_name = path.file_name().unwrap();
        let dst_path = dst.join(file_name);

        // Skip certain directories
        let name = file_name.to_string_lossy();
        if name == "node_modules" || name == "target" || name == "dist" || name == ".git" {
            continue;
        }

        if path.is_dir() {
            Box::pin(copy_dir_recursive(&path, &dst_path)).await?;
        } else {
            fs::copy(&path, &dst_path).await?;
        }
    }

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
