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
}
