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

    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),

    #[error("Failed to resume process: {0}")]
    ResumeFailed(String),

    #[error("Script injection failed: {0}")]
    ScriptInjectionFailed(String),

    #[error("Script creation failed: {0}")]
    ScriptCreationFailed(String),

    #[error("Script load failed: {0}")]
    ScriptLoadFailed(String),

    #[error("Script execution error: {0}")]
    ScriptExecutionError(String),

    #[error("RPC call failed: {0}")]
    RpcCallFailed(String),

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frida_error_display() {
        let err = FridaError::DeviceNotFound("abc".into());
        assert_eq!(err.to_string(), "Device not found: abc");

        let err = FridaError::SessionNotFound("sess-1".into());
        assert_eq!(err.to_string(), "Session not found: sess-1");

        let err = FridaError::ScriptNotFound("script-1".into());
        assert_eq!(err.to_string(), "Script not found: script-1");

        let err = FridaError::NotConnected;
        assert_eq!(err.to_string(), "Not connected to any device");

        let err = FridaError::AttachFailed("timeout".into());
        assert_eq!(err.to_string(), "Failed to attach to process: timeout");

        let err = FridaError::RpcCallFailed("method not found".into());
        assert_eq!(err.to_string(), "RPC call failed: method not found");
    }

    #[test]
    fn test_frida_error_debug() {
        let err = FridaError::InitializationFailed("init error".into());
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("InitializationFailed"));
    }
}
