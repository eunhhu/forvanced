use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use forvanced_frida::ProcessInfo;

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterCapabilities {
    pub can_spawn: bool,
    pub can_attach: bool,
    pub can_enumerate: bool,
    pub can_scan_memory: bool,
    pub supports_java: bool,
    pub supports_objc: bool,
    pub supports_swift: bool,
}

impl Default for AdapterCapabilities {
    fn default() -> Self {
        Self {
            can_spawn: false,
            can_attach: true,
            can_enumerate: true,
            can_scan_memory: true,
            supports_java: false,
            supports_objc: false,
            supports_swift: false,
        }
    }
}

#[async_trait]
pub trait TargetAdapter: Send + Sync {
    /// Get the adapter's unique identifier
    fn adapter_id(&self) -> &str;

    /// Get the adapter's display name
    fn display_name(&self) -> &str;

    /// Connect to the target device/environment
    async fn connect(&mut self) -> Result<()>;

    /// Disconnect from the target
    async fn disconnect(&mut self) -> Result<()>;

    /// Check if currently connected
    fn is_connected(&self) -> bool;

    /// List running processes on the target
    async fn enumerate_processes(&self) -> Result<Vec<ProcessInfo>>;

    /// Attach to a running process by PID
    async fn attach(&self, pid: u32) -> Result<String>;

    /// Detach from a session
    async fn detach(&self, session_id: &str) -> Result<()>;

    /// Spawn a new process (if supported)
    async fn spawn(&self, _path: &str, _args: &[&str]) -> Result<u32> {
        Err(crate::error::AdapterError::NotSupported(
            "spawn not supported by this adapter".to_string(),
        ))
    }

    /// Get the adapter's capabilities
    fn capabilities(&self) -> AdapterCapabilities;

    /// Inject a Frida script into a session
    async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        let _ = (session_id, script_source);
        Err(crate::error::AdapterError::NotSupported(
            "inject_script not supported by this adapter".to_string(),
        ))
    }

    /// Unload a script from a session
    async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        let _ = (session_id, script_id);
        Err(crate::error::AdapterError::NotSupported(
            "unload_script not supported by this adapter".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_capabilities_default() {
        let caps = AdapterCapabilities::default();
        assert!(!caps.can_spawn);
        assert!(caps.can_attach);
        assert!(caps.can_enumerate);
        assert!(caps.can_scan_memory);
        assert!(!caps.supports_java);
        assert!(!caps.supports_objc);
        assert!(!caps.supports_swift);
    }

    #[test]
    fn test_adapter_capabilities_serde() {
        let caps = AdapterCapabilities {
            can_spawn: true,
            can_attach: true,
            can_enumerate: false,
            can_scan_memory: true,
            supports_java: true,
            supports_objc: false,
            supports_swift: false,
        };
        let json = serde_json::to_value(&caps).unwrap();
        assert_eq!(json["can_spawn"], true);
        assert_eq!(json["can_enumerate"], false);
        assert_eq!(json["supports_java"], true);

        let deserialized: AdapterCapabilities = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.can_spawn, true);
        assert_eq!(deserialized.can_enumerate, false);
    }
}
