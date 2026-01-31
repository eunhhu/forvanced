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
}
