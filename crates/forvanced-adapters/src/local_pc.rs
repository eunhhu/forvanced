use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::RwLock;
use tracing::{debug, info};

use forvanced_frida::{FridaManager, ProcessInfo};

use crate::error::{AdapterError, Result};
use crate::traits::{AdapterCapabilities, TargetAdapter};

pub struct LocalPCAdapter {
    frida_manager: Arc<RwLock<Option<FridaManager>>>,
    connected: bool,
}

impl LocalPCAdapter {
    pub fn new() -> Self {
        Self {
            frida_manager: Arc::new(RwLock::new(None)),
            connected: false,
        }
    }
}

impl Default for LocalPCAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TargetAdapter for LocalPCAdapter {
    fn adapter_id(&self) -> &str {
        "local_pc"
    }

    fn display_name(&self) -> &str {
        "Local PC"
    }

    async fn connect(&mut self) -> Result<()> {
        info!("Connecting LocalPCAdapter");

        let manager = FridaManager::new().map_err(|e| AdapterError::ConnectionFailed(e.to_string()))?;

        *self.frida_manager.write().await = Some(manager);
        self.connected = true;

        info!("LocalPCAdapter connected");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        info!("Disconnecting LocalPCAdapter");

        *self.frida_manager.write().await = None;
        self.connected = false;

        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn enumerate_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating processes via LocalPCAdapter");

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.enumerate_local_processes().map_err(|e| e.into())
    }

    async fn attach(&self, pid: u32) -> Result<String> {
        info!("Attaching to process {} via LocalPCAdapter", pid);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.attach_local(pid).await.map_err(|e| e.into())
    }

    async fn detach(&self, session_id: &str) -> Result<()> {
        info!("Detaching session {} via LocalPCAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.detach(session_id).await.map_err(|e| e.into())
    }

    async fn spawn(&self, _path: &str, _args: &[&str]) -> Result<u32> {
        // TODO: Implement spawn for local processes
        Err(AdapterError::NotSupported("spawn not yet implemented".to_string()))
    }

    fn capabilities(&self) -> AdapterCapabilities {
        AdapterCapabilities {
            can_spawn: true,
            can_attach: true,
            can_enumerate: true,
            can_scan_memory: true,
            supports_java: false,
            supports_objc: cfg!(target_os = "macos"),
            supports_swift: cfg!(target_os = "macos"),
        }
    }

    async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        info!("Injecting script into session {} via LocalPCAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager
            .inject_script(session_id, script_source)
            .await
            .map_err(|e| e.into())
    }

    async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        info!(
            "Unloading script {} from session {} via LocalPCAdapter",
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

    #[tokio::test]
    async fn test_adapter_creation() {
        let adapter = LocalPCAdapter::new();
        assert!(!adapter.is_connected());
        assert_eq!(adapter.adapter_id(), "local_pc");
    }
}
