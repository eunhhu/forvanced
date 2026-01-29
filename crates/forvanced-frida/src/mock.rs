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
use crate::process::ProcessInfo;
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

    /// Returns a simulated list of processes for UI testing.
    pub fn enumerate_local_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Mock: enumerating local processes");

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

    /// Returns a simulated list of USB device processes.
    pub fn enumerate_usb_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Mock: enumerating USB processes");

        // Simulate no USB device connected
        Err(FridaError::DeviceNotFound(
            "Mock: No USB device connected".to_string(),
        ))
    }

    /// Simulates attaching to a process.
    pub async fn attach_local(&self, pid: u32) -> Result<String> {
        info!("Mock: attaching to process {}", pid);

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
