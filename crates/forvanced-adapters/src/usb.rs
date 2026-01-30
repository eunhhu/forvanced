use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::RwLock;
use tracing::{debug, info};

use forvanced_frida::{FridaManager, ProcessInfo};

use crate::error::{AdapterError, Result};
use crate::traits::{AdapterCapabilities, TargetAdapter};

/// USB device adapter for connecting to Android/iOS devices via USB.
/// Uses Frida's USB device detection.
pub struct USBAdapter {
    frida_manager: Arc<RwLock<Option<FridaManager>>>,
    connected: bool,
}

impl USBAdapter {
    pub fn new() -> Self {
        Self {
            frida_manager: Arc::new(RwLock::new(None)),
            connected: false,
        }
    }
}

impl Default for USBAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TargetAdapter for USBAdapter {
    fn adapter_id(&self) -> &str {
        "usb"
    }

    fn display_name(&self) -> &str {
        "USB Device"
    }

    async fn connect(&mut self) -> Result<()> {
        info!("Connecting USBAdapter");

        let manager = FridaManager::new().map_err(|e| AdapterError::ConnectionFailed(e.to_string()))?;

        *self.frida_manager.write().await = Some(manager);
        self.connected = true;

        info!("USBAdapter connected");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        info!("Disconnecting USBAdapter");

        *self.frida_manager.write().await = None;
        self.connected = false;

        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn enumerate_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating processes via USBAdapter");

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.enumerate_usb_processes().map_err(|e| e.into())
    }

    async fn attach(&self, pid: u32) -> Result<String> {
        info!("Attaching to process {} via USBAdapter", pid);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.attach_usb(pid).await.map_err(|e| e.into())
    }

    async fn detach(&self, session_id: &str) -> Result<()> {
        info!("Detaching session {} via USBAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager.detach(session_id).await.map_err(|e| e.into())
    }

    async fn spawn(&self, _path: &str, _args: &[&str]) -> Result<u32> {
        Err(AdapterError::NotSupported("spawn not yet implemented for USB".to_string()))
    }

    fn capabilities(&self) -> AdapterCapabilities {
        AdapterCapabilities {
            can_spawn: false,
            can_attach: true,
            can_enumerate: true,
            can_scan_memory: true,
            supports_java: true,  // Android support
            supports_objc: true,  // iOS support
            supports_swift: true, // iOS support
        }
    }

    async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        info!("Injecting script into session {} via USBAdapter", session_id);

        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or(AdapterError::NotConnected)?;

        manager
            .inject_script(session_id, script_source)
            .await
            .map_err(|e| e.into())
    }

    async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        info!(
            "Unloading script {} from session {} via USBAdapter",
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
        let adapter = USBAdapter::new();
        assert!(!adapter.is_connected());
        assert_eq!(adapter.adapter_id(), "usb");
    }
}
