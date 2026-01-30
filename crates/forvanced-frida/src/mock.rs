//! Mock implementation of FridaManager for development without Frida devkit.
//!
//! This module provides a fake implementation that returns simulated process lists
//! and allows testing the UI without requiring the Frida native libraries.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::error::{FridaError, Result};
use crate::process::{DeviceInfo, FridaDeviceType, ProcessInfo};
use crate::session::FridaSession;

/// Mock FridaManager that simulates Frida functionality for development.
pub struct FridaManager {
    sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>>,
}

impl FridaManager {
    pub fn new() -> Result<Self> {
        warn!("Using MOCK FridaManager - no real Frida functionality");
        info!("To use real Frida, rebuild with --features real");

        Ok(Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Returns a simulated list of devices for UI testing.
    pub fn enumerate_devices(&self) -> Result<Vec<DeviceInfo>> {
        debug!("Mock: enumerating devices");

        let mock_devices = vec![
            DeviceInfo::new("local", "Local System", FridaDeviceType::Local),
        ];

        info!("Mock: returning {} devices", mock_devices.len());
        Ok(mock_devices)
    }

    /// Returns a simulated list of processes for a device.
    pub fn enumerate_processes_on_device(&self, device_id: &str) -> Result<Vec<ProcessInfo>> {
        debug!("Mock: enumerating processes on device {}", device_id);

        if device_id != "local" {
            return Err(FridaError::DeviceNotFound(format!(
                "Mock: Device '{}' not found",
                device_id
            )));
        }

        // Return some fake processes for testing
        let mock_processes = vec![
            ProcessInfo::new(1, "launchd"),
            ProcessInfo::new(100, "WindowServer"),
            ProcessInfo::new(200, "Finder").with_path("/System/Library/CoreServices/Finder.app"),
            ProcessInfo::new(300, "Safari").with_path("/Applications/Safari.app"),
            ProcessInfo::new(400, "Terminal").with_path("/Applications/Utilities/Terminal.app"),
            ProcessInfo::new(500, "Xcode").with_path("/Applications/Xcode.app"),
            ProcessInfo::new(600, "Code").with_path("/Applications/Visual Studio Code.app"),
            ProcessInfo::new(700, "Discord").with_path("/Applications/Discord.app"),
            ProcessInfo::new(800, "Slack").with_path("/Applications/Slack.app"),
            ProcessInfo::new(900, "Chrome").with_path("/Applications/Google Chrome.app"),
            ProcessInfo::new(1000, "ExampleGame").with_path("/Users/user/Games/ExampleGame.app"),
            ProcessInfo::new(1100, "TestApp").with_path("/tmp/TestApp"),
        ];

        info!("Mock: returning {} fake processes", mock_processes.len());
        Ok(mock_processes)
    }

    /// Simulates attaching to a process on a device.
    pub async fn attach_on_device(&self, device_id: &str, pid: u32) -> Result<String> {
        info!("Mock: attaching to process {} on device {}", pid, device_id);

        if device_id != "local" {
            return Err(FridaError::DeviceNotFound(format!(
                "Mock: Device '{}' not found",
                device_id
            )));
        }

        let process_info = ProcessInfo::new(pid, format!("mock_process_{}", pid));
        let session_id = Uuid::new_v4().to_string();
        let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        info!("Mock: attached to process {}, session: {}", pid, session_id);
        Ok(session_id)
    }

    /// Simulates adding a remote device.
    pub fn add_remote_device(&self, address: &str) -> Result<DeviceInfo> {
        debug!("Mock: adding remote device at {}", address);

        // Return a fake remote device
        Ok(DeviceInfo::new(
            format!("remote-{}", address),
            format!("Remote @ {}", address),
            FridaDeviceType::Remote,
        ))
    }

    /// Simulates detaching from a session.
    pub async fn detach(&self, session_id: &str) -> Result<()> {
        info!("Mock: detaching session: {}", session_id);

        let session = self
            .sessions
            .write()
            .await
            .remove(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session.mark_detached().await;
        info!("Mock: session {} detached", session_id);
        Ok(())
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Arc<FridaSession>> {
        self.sessions.read().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.read().await.keys().cloned().collect()
    }

    /// Simulates injecting a script into a session.
    pub async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        info!(
            "Mock: injecting script into session {}, source length: {}",
            session_id,
            script_source.len()
        );

        let session = self
            .sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        let script_id = Uuid::new_v4().to_string();
        session.add_script(script_id.clone(), "mock_script".to_string()).await;

        // Mark as loaded
        if let Some(handle) = session.scripts.write().await.get_mut(&script_id) {
            handle.loaded = true;
        }

        info!("Mock: script {} injected into session {}", script_id, session_id);
        Ok(script_id)
    }

    /// Simulates unloading a script from a session.
    pub async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        info!(
            "Mock: unloading script {} from session {}",
            script_id, session_id
        );

        let session = self
            .sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session
            .remove_script(script_id)
            .await
            .ok_or_else(|| FridaError::ScriptNotFound(script_id.to_string()))?;

        info!("Mock: script {} unloaded from session {}", script_id, session_id);
        Ok(())
    }
}

impl Default for FridaManager {
    fn default() -> Self {
        Self::new().expect("Failed to create mock FridaManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_manager_creation() {
        let manager = FridaManager::new();
        assert!(manager.is_ok());
    }

    #[test]
    fn test_mock_enumerate_processes() {
        let manager = FridaManager::new().unwrap();
        let processes = manager.enumerate_local_processes().unwrap();
        assert!(!processes.is_empty());
    }

    #[tokio::test]
    async fn test_mock_attach_detach() {
        let manager = FridaManager::new().unwrap();

        let session_id = manager.attach_local(1234).await.unwrap();
        assert!(!session_id.is_empty());

        let sessions = manager.list_sessions().await;
        assert_eq!(sessions.len(), 1);

        manager.detach(&session_id).await.unwrap();

        let sessions = manager.list_sessions().await;
        assert!(sessions.is_empty());
    }
}
