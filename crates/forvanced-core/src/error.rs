use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Invalid project format: {0}")]
    InvalidProjectFormat(String),

    #[error("Script not found: {0}")]
    ScriptNotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, CoreError>;
