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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_error_display() {
        let err = AdapterError::NotConnected;
        assert_eq!(err.to_string(), "Not connected to target");

        let err = AdapterError::ConnectionFailed("timeout".into());
        assert_eq!(err.to_string(), "Connection failed: timeout");

        let err = AdapterError::DeviceNotFound("dev-1".into());
        assert_eq!(err.to_string(), "Device not found: dev-1");

        let err = AdapterError::NotSupported("spawn".into());
        assert_eq!(err.to_string(), "Operation not supported: spawn");

        let err = AdapterError::Other("something".into());
        assert_eq!(err.to_string(), "Adapter error: something");
    }

    #[test]
    fn test_adapter_error_from_frida_error() {
        let frida_err = forvanced_frida::FridaError::SessionNotFound("sess-1".into());
        let adapter_err: AdapterError = frida_err.into();
        assert!(adapter_err.to_string().contains("Session not found"));
    }

    #[test]
    fn test_adapter_error_debug() {
        let err = AdapterError::ProcessNotFound("chrome".into());
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("ProcessNotFound"));
    }
}
