use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BuildError {
    #[error("Project has no components to build")]
    EmptyProject,

    #[error("Invalid project configuration: {0}")]
    InvalidConfig(String),

    #[error("Template error: {0}")]
    Template(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Build command failed: {0}")]
    CommandFailed(String),

    #[error("Tauri CLI not found. Install with: cargo install tauri-cli")]
    TauriCliNotFound,

    #[error("Build target not supported: {0}")]
    UnsupportedTarget(String),

    #[error("Runtime template not found at: {0}")]
    RuntimeNotFound(PathBuf),

    #[error("Build cancelled")]
    Cancelled,

    #[error("Missing required build tools")]
    MissingTools(MissingToolsInfo),
}

/// Information about missing build tools with installation instructions
#[derive(Debug, Clone)]
pub struct MissingToolsInfo {
    pub missing: Vec<MissingTool>,
}

#[derive(Debug, Clone)]
pub struct MissingTool {
    pub name: &'static str,
    pub description: &'static str,
    pub install_instructions: Vec<InstallInstruction>,
}

#[derive(Debug, Clone)]
pub struct InstallInstruction {
    pub platform: &'static str,
    pub command: &'static str,
    pub url: Option<&'static str>,
}

impl std::fmt::Display for MissingToolsInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "\n╭─────────────────────────────────────────────────────────────╮")?;
        writeln!(f, "│  🔧 빌드에 필요한 도구가 설치되어 있지 않습니다            │")?;
        writeln!(f, "╰─────────────────────────────────────────────────────────────╯\n")?;

        for tool in &self.missing {
            writeln!(f, "❌ {} - {}", tool.name, tool.description)?;
            writeln!(f, "   설치 방법:")?;
            for inst in &tool.install_instructions {
                if let Some(url) = inst.url {
                    writeln!(f, "   • {}: {} ({})", inst.platform, inst.command, url)?;
                } else {
                    writeln!(f, "   • {}: {}", inst.platform, inst.command)?;
                }
            }
            writeln!(f)?;
        }

        writeln!(f, "💡 모든 도구를 설치한 후 다시 빌드를 시도해주세요.")?;
        Ok(())
    }
}
