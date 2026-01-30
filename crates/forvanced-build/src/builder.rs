//! Build system for generating standalone trainer applications

use crate::codegen::{generate_frida_script, generate_ui_code};
use crate::error::BuildError;
use crate::template::{TemplateData, TemplateManager};
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
    /// Skip npm install
    pub skip_npm_install: bool,
}

impl Default for BuildOptions {
    fn default() -> Self {
        Self {
            output_dir: PathBuf::from("./dist"),
            target: BuildTarget::Current,
            release: true,
            bundle_frida: true,
            skip_npm_install: false,
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
    /// Build target
    pub target: BuildTarget,
}

/// Builder for generating trainer applications
pub struct Builder {
    template_manager: TemplateManager,
}

impl Builder {
    pub fn new() -> Result<Self, BuildError> {
        Ok(Self {
            template_manager: TemplateManager::new()?,
        })
    }

    /// Generate a trainer project from a Forvanced project
    pub async fn generate_project(
        &self,
        project: &Project,
        output_dir: &Path,
    ) -> Result<PathBuf, BuildError> {
        info!("Generating trainer project: {}", project.name);

        // Validate project
        if project.ui.components.is_empty() {
            return Err(BuildError::EmptyProject);
        }

        // Create output directory structure
        let project_dir = output_dir.join(&sanitize_name(&project.name));
        fs::create_dir_all(&project_dir).await?;
        fs::create_dir_all(project_dir.join("src")).await?;
        fs::create_dir_all(project_dir.join("src-tauri")).await?;
        fs::create_dir_all(project_dir.join("src-tauri/src")).await?;
        fs::create_dir_all(project_dir.join("src-tauri/icons")).await?;

        // Prepare template data
        let sanitized_name = sanitize_name(&project.name);
        let template_data = TemplateData {
            project_name: sanitized_name.clone(),
            lib_name: sanitized_name.replace('-', "_"), // Rust lib names can't have hyphens
            project_version: project.version.clone(),
            project_description: project.description.clone().unwrap_or_default(),
            window_width: project.ui.width,
            window_height: project.ui.height + 60, // Add header height
            window_title: project.name.clone(),
            theme: project.ui.theme.clone(),
            bundle_frida: project.config.build.bundle_frida,
            process_name: project.config.target.process_name.clone(),
            auto_attach: project.config.target.auto_attach,
        };

        // Generate files from templates
        self.write_template_file(&project_dir, "package.json", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src-tauri"), "tauri.conf.json", &template_data)
            .await?;
        self.write_template_file(&project_dir, "index.html", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src"), "main.tsx", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src"), "App.tsx", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src"), "engine.ts", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src"), "styles.css", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src-tauri"), "Cargo.toml", &template_data)
            .await?;
        self.write_template_file(&project_dir.join("src-tauri/src"), "lib.rs", &template_data)
            .await?;

        // Generate UI code
        let ui_code = generate_ui_code(project);
        fs::write(project_dir.join("src/TrainerUI.tsx"), ui_code).await?;

        // Generate Frida script
        let frida_script = generate_frida_script(project);
        fs::write(project_dir.join("src-tauri/frida_script.js"), frida_script).await?;

        // Generate engine module for Rust
        let engine_rs = generate_engine_rs(project);
        fs::write(project_dir.join("src-tauri/src/engine.rs"), engine_rs).await?;

        // Write additional config files
        self.write_vite_config(&project_dir).await?;
        self.write_tsconfig(&project_dir).await?;
        self.write_build_rs(&project_dir).await?;
        self.write_main_rs(&project_dir).await?;
        self.write_default_icons(&project_dir).await?;

        info!("Project generated at: {}", project_dir.display());
        Ok(project_dir)
    }

    /// Build the generated trainer project
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

        // Install npm dependencies
        if !options.skip_npm_install {
            info!("Installing npm dependencies...");
            let npm_status = Command::new("bun")
                .arg("install")
                .current_dir(&project_dir)
                .status()
                .map_err(|e| BuildError::CommandFailed(format!("bun install failed: {}", e)))?;

            if !npm_status.success() {
                return Err(BuildError::CommandFailed(
                    "bun install failed".to_string(),
                ));
            }
        }

        // Build with Tauri
        info!("Building trainer...");
        let mut tauri_cmd = Command::new("cargo");
        tauri_cmd.arg("tauri").arg("build");

        if !options.release {
            tauri_cmd.arg("--debug");
        }

        let target_str = options.target.tauri_target();
        if !target_str.is_empty() {
            tauri_cmd.arg("--target").arg(target_str);
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

    async fn write_template_file(
        &self,
        dir: &Path,
        template_name: &str,
        data: &TemplateData,
    ) -> Result<(), BuildError> {
        let content = self.template_manager.render(template_name, data)?;
        let file_path = dir.join(template_name);
        fs::write(&file_path, content).await?;
        debug!("Written: {}", file_path.display());
        Ok(())
    }

    async fn write_vite_config(&self, project_dir: &Path) -> Result<(), BuildError> {
        let content = r#"import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
"#;
        fs::write(project_dir.join("vite.config.ts"), content).await?;
        Ok(())
    }

    async fn write_tsconfig(&self, project_dir: &Path) -> Result<(), BuildError> {
        let content = r#"{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
"#;
        fs::write(project_dir.join("tsconfig.json"), content).await?;
        Ok(())
    }

    async fn write_build_rs(&self, project_dir: &Path) -> Result<(), BuildError> {
        let content = r#"fn main() {
    tauri_build::build()
}
"#;
        fs::write(project_dir.join("src-tauri/build.rs"), content).await?;
        Ok(())
    }

    async fn write_main_rs(&self, project_dir: &Path) -> Result<(), BuildError> {
        let content = r#"#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    forvanced_trainer_lib::run()
}
"#;
        // Replace with actual crate name
        let crate_name = project_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("trainer");
        let content = content.replace("forvanced_trainer_lib", &format!("{}_lib", crate_name.replace('-', "_")));

        fs::write(project_dir.join("src-tauri/src/main.rs"), content).await?;
        Ok(())
    }

    async fn write_default_icons(&self, project_dir: &Path) -> Result<(), BuildError> {
        let icons_dir = project_dir.join("src-tauri/icons");

        // Create a simple 1x1 transparent PNG as placeholder
        // PNG header + IHDR chunk + IDAT chunk + IEND chunk for 1x1 transparent pixel
        let png_1x1: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, // IHDR length
            0x49, 0x48, 0x44, 0x52, // "IHDR"
            0x00, 0x00, 0x00, 0x01, // width: 1
            0x00, 0x00, 0x00, 0x01, // height: 1
            0x08, 0x06, // bit depth: 8, color type: RGBA
            0x00, 0x00, 0x00, // compression, filter, interlace
            0x1F, 0x15, 0xC4, 0x89, // IHDR CRC
            0x00, 0x00, 0x00, 0x0A, // IDAT length
            0x49, 0x44, 0x41, 0x54, // "IDAT"
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
            0x0D, 0x0A, 0x2D, 0xB4, // IDAT CRC
            0x00, 0x00, 0x00, 0x00, // IEND length
            0x49, 0x45, 0x4E, 0x44, // "IEND"
            0xAE, 0x42, 0x60, 0x82, // IEND CRC
        ];

        // Write placeholder icons
        fs::write(icons_dir.join("32x32.png"), png_1x1).await?;
        fs::write(icons_dir.join("128x128.png"), png_1x1).await?;
        fs::write(icons_dir.join("128x128@2x.png"), png_1x1).await?;

        // For .ico and .icns, we'll create minimal valid files
        // ICO file header for 1x1 image
        let ico_data: &[u8] = &[
            0x00, 0x00, // Reserved
            0x01, 0x00, // Type: ICO
            0x01, 0x00, // Number of images: 1
            // Image directory entry
            0x01, // Width: 1
            0x01, // Height: 1
            0x00, // Color palette: 0
            0x00, // Reserved
            0x01, 0x00, // Color planes: 1
            0x20, 0x00, // Bits per pixel: 32
            0x30, 0x00, 0x00, 0x00, // Image size
            0x16, 0x00, 0x00, 0x00, // Image offset
            // BMP data follows (simplified)
            0x28, 0x00, 0x00, 0x00, // BMP header size
            0x01, 0x00, 0x00, 0x00, // Width
            0x02, 0x00, 0x00, 0x00, // Height (doubled for AND mask)
            0x01, 0x00, // Planes
            0x20, 0x00, // Bits per pixel
            0x00, 0x00, 0x00, 0x00, // Compression
            0x08, 0x00, 0x00, 0x00, // Image size
            0x00, 0x00, 0x00, 0x00, // X pixels per meter
            0x00, 0x00, 0x00, 0x00, // Y pixels per meter
            0x00, 0x00, 0x00, 0x00, // Colors used
            0x00, 0x00, 0x00, 0x00, // Important colors
            // Pixel data (1 RGBA pixel)
            0x00, 0x00, 0x00, 0x00,
            // AND mask
            0x00, 0x00, 0x00, 0x00,
        ];
        fs::write(icons_dir.join("icon.ico"), ico_data).await?;

        // For .icns, we create a minimal file
        // ICNS files are complex, just copy the PNG for now
        fs::write(icons_dir.join("icon.icns"), png_1x1).await?;

        debug!("Default icons written to: {}", icons_dir.display());
        Ok(())
    }
}

impl Default for Builder {
    fn default() -> Self {
        Self::new().expect("Failed to create builder")
    }
}

/// Generate engine.rs for the runtime
fn generate_engine_rs(project: &Project) -> String {
    let frida_script = generate_frida_script(project);
    let escaped_script = frida_script.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");

    format!(
        r#"use std::sync::Mutex;
use tauri::State;

const FRIDA_SCRIPT: &str = "{script}";

pub struct CheatEngineState {{
    pub attached: Mutex<bool>,
    pub process_name: Mutex<Option<String>>,
}}

impl CheatEngineState {{
    pub fn new() -> Self {{
        Self {{
            attached: Mutex::new(false),
            process_name: Mutex::new(None),
        }}
    }}
}}

#[tauri::command]
pub async fn attach_process(
    state: State<'_, CheatEngineState>,
    process_name: String,
) -> Result<(), String> {{
    // TODO: Implement actual Frida attachment
    *state.attached.lock().unwrap() = true;
    *state.process_name.lock().unwrap() = Some(process_name);
    Ok(())
}}

#[tauri::command]
pub async fn detach_process(state: State<'_, CheatEngineState>) -> Result<(), String> {{
    *state.attached.lock().unwrap() = false;
    *state.process_name.lock().unwrap() = None;
    Ok(())
}}

#[tauri::command]
pub async fn memory_read(
    address: String,
    value_type: String,
) -> Result<serde_json::Value, String> {{
    // TODO: Call Frida RPC
    Ok(serde_json::json!(0))
}}

#[tauri::command]
pub async fn memory_write(
    address: String,
    value: String,
    value_type: String,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn memory_freeze(
    address: String,
    value: String,
    value_type: String,
    interval_ms: u32,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn memory_unfreeze(address: String) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn pattern_scan(
    pattern: String,
    protection: String,
) -> Result<Vec<String>, String> {{
    // TODO: Call Frida RPC
    Ok(vec![])
}}

#[tauri::command]
pub async fn value_scan(
    value: String,
    value_type: String,
) -> Result<Vec<String>, String> {{
    // TODO: Call Frida RPC
    Ok(vec![])
}}

#[tauri::command]
pub async fn hook_function(
    address: String,
    log_enter: bool,
    log_leave: bool,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn replace_return(address: String, value: i64) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn nop_function(address: String) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn java_hook_method(
    class_name: String,
    method_name: String,
    overload: Option<String>,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn java_modify_return(
    class_name: String,
    method_name: String,
    value: serde_json::Value,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn java_call_method(
    class_name: String,
    method_name: String,
    is_static: bool,
) -> Result<serde_json::Value, String> {{
    // TODO: Call Frida RPC
    Ok(serde_json::json!(null))
}}

#[tauri::command]
pub async fn objc_hook_method(
    class_name: String,
    selector: String,
    is_class_method: bool,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn objc_modify_return(
    class_name: String,
    selector: String,
    value: serde_json::Value,
) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn swift_hook_function(mangled_name: String) -> Result<(), String> {{
    // TODO: Call Frida RPC
    Ok(())
}}

#[tauri::command]
pub async fn list_modules() -> Result<Vec<serde_json::Value>, String> {{
    // TODO: Call Frida RPC
    Ok(vec![])
}}

#[tauri::command]
pub async fn find_export(
    module_name: String,
    export_name: String,
) -> Result<Option<String>, String> {{
    // TODO: Call Frida RPC
    Ok(None)
}}

#[tauri::command]
pub async fn execute_custom_script(script: String) -> Result<serde_json::Value, String> {{
    // TODO: Call Frida RPC
    Ok(serde_json::json!(null))
}}
"#,
        script = escaped_script
    )
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn find_executables(project_dir: &Path, release: bool) -> Result<Vec<PathBuf>, BuildError> {
    let target_dir = project_dir.join("src-tauri/target");
    let profile = if release { "release" } else { "debug" };

    let mut executables = Vec::new();

    // Platform-specific paths
    #[cfg(target_os = "windows")]
    {
        let exe_path = target_dir.join(profile).join("*.exe");
        if let Ok(entries) = glob::glob(exe_path.to_str().unwrap_or_default()) {
            for entry in entries.flatten() {
                executables.push(entry);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let app_path = target_dir.join(profile).join("bundle/macos");
        if app_path.exists() {
            if let Ok(entries) = std::fs::read_dir(&app_path) {
                for entry in entries.flatten() {
                    if entry.path().extension().map(|e| e == "app").unwrap_or(false) {
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
                    if entry.path().extension().map(|e| e == "deb").unwrap_or(false) {
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
    use forvanced_core::{
        Project, ProjectConfig, TargetConfig, BuildConfig as ProjectBuildConfig,
        HotkeyConfig, UILayout, UIComponent, ComponentType,
    };

    #[test]
    fn test_sanitize_name() {
        assert_eq!(sanitize_name("My Trainer!"), "my-trainer");
        assert_eq!(sanitize_name("Test_Project-1"), "test_project-1");
        assert_eq!(sanitize_name("Game Trainer v2"), "game-trainer-v2");
    }

    #[test]
    fn test_build_target_from_str() {
        assert_eq!(BuildTarget::from_str("current"), Some(BuildTarget::Current));
        assert_eq!(BuildTarget::from_str("windows"), Some(BuildTarget::WindowsX64));
        assert_eq!(BuildTarget::from_str("macos"), Some(BuildTarget::MacOsArm64));
    }

    #[tokio::test]
    async fn test_generate_project() {
        let project = create_test_project();
        let builder = Builder::new().expect("Failed to create builder");

        let temp_dir = std::env::temp_dir().join("forvanced_test");
        let _ = std::fs::remove_dir_all(&temp_dir); // Clean up any existing

        let result = builder.generate_project(&project, &temp_dir).await;
        assert!(result.is_ok(), "Project generation failed: {:?}", result.err());

        let project_dir = result.unwrap();
        assert!(project_dir.exists(), "Project directory not created");
        assert!(project_dir.join("package.json").exists(), "package.json not created");
        assert!(project_dir.join("src/TrainerUI.tsx").exists(), "TrainerUI.tsx not created");
        assert!(project_dir.join("src-tauri/Cargo.toml").exists(), "Cargo.toml not created");
        assert!(project_dir.join("src-tauri/icons/icon.ico").exists(), "icon.ico not created");

        // Print generated files for inspection
        println!("Generated project at: {:?}", project_dir);

        // Verify TrainerUI.tsx content
        let trainer_ui = std::fs::read_to_string(project_dir.join("src/TrainerUI.tsx")).unwrap();
        assert!(trainer_ui.contains("Test Button"), "TrainerUI should contain the button label");

        // Verify Cargo.toml content
        let cargo_toml = std::fs::read_to_string(project_dir.join("src-tauri/Cargo.toml")).unwrap();
        assert!(cargo_toml.contains("test_trainer_lib"), "Cargo.toml should have correct lib name (underscores, not hyphens)");
        assert!(!cargo_toml.contains("forvanced-frida"), "Cargo.toml should not reference internal crates");

        // Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    fn create_test_project() -> Project {
        Project {
            id: "test-id".to_string(),
            name: "Test Trainer".to_string(),
            description: Some("Test description".to_string()),
            version: "1.0.0".to_string(),
            author: Some("Test Author".to_string()),
            created_at: 0,
            updated_at: 0,
            config: ProjectConfig {
                target: TargetConfig {
                    process_name: Some("test.exe".to_string()),
                    process_patterns: vec![],
                    adapter_type: "local_pc".to_string(),
                    adapter_config: serde_json::Value::Null,
                    auto_attach: true,
                },
                build: ProjectBuildConfig {
                    output_name: Some("test-trainer".to_string()),
                    targets: vec!["current".to_string()],
                    icon: None,
                    bundle_frida: true,
                },
                hotkeys: HotkeyConfig::default(),
            },
            ui: UILayout {
                components: vec![
                    UIComponent {
                        id: "btn1".to_string(),
                        component_type: ComponentType::Button,
                        label: "Test Button".to_string(),
                        x: 10.0,
                        y: 10.0,
                        width: 100.0,
                        height: 36.0,
                        props: serde_json::json!({}),
                        bindings: vec![],
                        parent_id: None,
                        children: vec![],
                        z_index: 0,
                        visible: true,
                        locked: false,
                        collapsed: false,
                        width_mode: None,
                        height_mode: None,
                    },
                ],
                width: 400,
                height: 500,
                theme: "dark".to_string(),
                padding: 12,
                gap: 8,
            },
            scripts: vec![],
        }
    }
}
