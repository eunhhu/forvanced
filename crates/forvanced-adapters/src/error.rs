use thiserror::Error;

#[derive(Error, Debug)]
pub enum AdapterError {
    #[error("Not connected to target")]
    NotConnected,

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("Process not found: {0}")]
    ProcessNotFound(String),

    #[error("Operation not supported: {0}")]
    NotSupported(String),

    #[error("Frida error: {0}")]
    Frida(#[from] forvanced_frida::FridaError),

    #[error("Adapter error: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, AdapterError>;
