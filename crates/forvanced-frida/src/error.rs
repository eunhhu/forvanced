use thiserror::Error;

#[derive(Error, Debug)]
pub enum FridaError {
    #[error("Frida initialization failed: {0}")]
    InitializationFailed(String),

    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("Process not found: {0}")]
    ProcessNotFound(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Failed to attach to process: {0}")]
    AttachFailed(String),

    #[error("Failed to detach from process: {0}")]
    DetachFailed(String),

    #[error("Script injection failed: {0}")]
    ScriptInjectionFailed(String),

    #[error("Script execution error: {0}")]
    ScriptExecutionError(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Script not found: {0}")]
    ScriptNotFound(String),

    #[error("Not connected to any device")]
    NotConnected,

    #[error("Frida error: {0}")]
    Frida(String),
}

pub type Result<T> = std::result::Result<T, FridaError>;
