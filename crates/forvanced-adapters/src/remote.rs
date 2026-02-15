use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::RwLock;
use tracing::{debug, info};

use forvanced_frida::{FridaManager, ProcessInfo};

use crate::error::{AdapterError, Result};
use crate::traits::{AdapterCapabilities, TargetAdapter};

/// Remote adapter for connecting to frida-server over TCP.
/// Use this for connecting to remote devices, emulators, or WSL.
pub struct RemoteAdapter {
    frida_manager: Arc<RwLock<Option<FridaManager>>>,
    host: String,
    port: u16,
    connected: bool,
}

impl RemoteAdapter {
    pub fn new(host: impl Into<String>, port: u16) -> Self {
        Self {
            frida_manager: Arc::new(RwLock::new(None)),
            host: host.into(),
            port,
            connected: false,
        }
    }

    /// Create a remote adapter with default frida-server settings (localhost:27042)
    pub fn default_local() -> Self {
        Self::new("127.0.0.1", 27042)
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn set_host(&mut self, host: impl Into<String>) {
        self.host = host.into();
    }

    pub fn set_port(&mut self, port: u16) {
        self.port = port;
    }
}

impl Default for RemoteAdapter {
    fn default() -> Self {
        Self::default_local()
    }
}

#[async_trait]
impl TargetAdapter for RemoteAdapter {
    fn adapter_id(&self) -> &str {
        "remote"
    }

    fn display_name(&self) -> &str {
        "Remote (frida-server)"
    }

    async fn connect(&mut self) -> Result<()> {
        info!("Connecting RemoteAdapter to {}:{}", self.host, self.port);

        let manager = FridaManager::new().map_err(|e| AdapterError::ConnectionFailed(e.to_string()))?;

        *self.frida_manager.write().await = Some(manager);
        self.connected = true;

        info!("RemoteAdapter connected");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        info!("Disconnecting RemoteAdapter");

        *self.frida_manager.write().await = None;
        self.connected = false;

        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn enumerate_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating processes via RemoteAdapter at {}:{}", self.host, self.port);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        let device_id = format!("remote-{}:{}", self.host, self.port);
        manager
            .enumerate_processes_on_device(&device_id)
            .await
            .map_err(|e: forvanced_frida::FridaError| AdapterError::Frida(e))
    }

    async fn attach(&self, pid: u32) -> Result<String> {
        info!("Attaching to process {} via RemoteAdapter", pid);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        let device_id = format!("remote-{}:{}", self.host, self.port);
        manager
            .attach_on_device(&device_id, pid)
            .await
            .map_err(|e: forvanced_frida::FridaError| AdapterError::Frida(e))
    }

    async fn detach(&self, session_id: &str) -> Result<()> {
        info!("Detaching session {} via RemoteAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.detach(session_id).await.map_err(|e| e.into())
    }

    async fn spawn(&self, _path: &str, _args: &[&str]) -> Result<u32> {
        Err(AdapterError::NotSupported("spawn not yet implemented for remote".to_string()))
    }

    fn capabilities(&self) -> AdapterCapabilities {
        AdapterCapabilities {
            can_spawn: false,
            can_attach: true,
            can_enumerate: true,
            can_scan_memory: true,
            supports_java: true,  // Depends on target
            supports_objc: true,  // Depends on target
            supports_swift: true, // Depends on target
        }
    }

    async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        info!("Injecting script into session {} via RemoteAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager
            .inject_script(session_id, script_source)
            .await
            .map_err(|e| e.into())
    }

    async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        info!(
            "Unloading script {} from session {} via RemoteAdapter",
            script_id, session_id
        );

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager
            .unload_script(session_id, script_id)
            .await
            .map_err(|e| e.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::TargetAdapter;

    #[tokio::test]
    async fn test_adapter_creation() {
        let adapter = RemoteAdapter::new("192.168.1.100", 27042);
        assert!(!adapter.is_connected());
        assert_eq!(adapter.adapter_id(), "remote");
        assert_eq!(adapter.host(), "192.168.1.100");
        assert_eq!(adapter.port(), 27042);
    }

    #[tokio::test]
    async fn test_default_local() {
        let adapter = RemoteAdapter::default_local();
        assert_eq!(adapter.host(), "127.0.0.1");
        assert_eq!(adapter.port(), 27042);
    }

    #[test]
    fn test_display_name() {
        let adapter = RemoteAdapter::new("10.0.0.1", 5555);
        assert_eq!(adapter.display_name(), "Remote (frida-server)");
    }

    #[test]
    fn test_default_trait() {
        let adapter = RemoteAdapter::default();
        assert_eq!(adapter.host(), "127.0.0.1");
        assert_eq!(adapter.port(), 27042);
        assert!(!adapter.is_connected());
    }

    #[test]
    fn test_set_host_port() {
        let mut adapter = RemoteAdapter::default();
        adapter.set_host("10.0.0.5");
        adapter.set_port(9999);
        assert_eq!(adapter.host(), "10.0.0.5");
        assert_eq!(adapter.port(), 9999);
    }

    #[test]
    fn test_capabilities() {
        let adapter = RemoteAdapter::new("localhost", 27042);
        let caps = adapter.capabilities();
        assert!(!caps.can_spawn);
        assert!(caps.can_attach);
        assert!(caps.can_enumerate);
        assert!(caps.can_scan_memory);
        assert!(caps.supports_java);
        assert!(caps.supports_objc);
        assert!(caps.supports_swift);
    }

    #[tokio::test]
    async fn test_not_connected_enumerate() {
        let adapter = RemoteAdapter::new("localhost", 27042);
        let result = adapter.enumerate_processes().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_not_connected_attach() {
        let adapter = RemoteAdapter::new("localhost", 27042);
        let result = adapter.attach(1234).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_spawn_not_supported() {
        let adapter = RemoteAdapter::new("localhost", 27042);
        let result = adapter.spawn("/bin/ls", &[]).await;
        assert!(result.is_err());
    }
}
