use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

use frida::{DeviceManager, DeviceType, Frida};

use crate::error::{FridaError, Result};
use crate::process::ProcessInfo;
use crate::session::FridaSession;

pub struct FridaManager {
    frida: Arc<Frida>,
    device_manager: DeviceManager<'static>,
    sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>>,
}

impl FridaManager {
    pub fn new() -> Result<Self> {
        info!("Initializing Frida manager");

        let frida = unsafe { Frida::obtain() };
        let frida = Arc::new(frida);

        // DeviceManager needs 'static lifetime, we use leaked reference
        let frida_ref: &'static Frida = Box::leak(Box::new(unsafe { Frida::obtain() }));
        let device_manager = DeviceManager::obtain(frida_ref);

        Ok(Self {
            frida,
            device_manager,
            sessions: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    pub fn enumerate_local_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating local processes");

        let device = self
            .device_manager
            .get_local_device()
            .map_err(|e| FridaError::DeviceNotFound(e.to_string()))?;

        let processes = device
            .enumerate_processes()
            .map_err(|e| FridaError::Frida(e.to_string()))?;

        let result: Vec<ProcessInfo> = processes
            .iter()
            .map(|p| ProcessInfo::new(p.get_pid(), p.get_name()))
            .collect();

        info!("Found {} processes", result.len());
        Ok(result)
    }

    pub fn enumerate_usb_processes(&self) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating USB device processes");

        let devices = self
            .device_manager
            .enumerate_all_devices()
            .map_err(|e| FridaError::Frida(e.to_string()))?;

        let usb_device = devices
            .iter()
            .find(|d| d.get_type() == DeviceType::USB)
            .ok_or_else(|| FridaError::DeviceNotFound("No USB device found".to_string()))?;

        let processes = usb_device
            .enumerate_processes()
            .map_err(|e| FridaError::Frida(e.to_string()))?;

        let result: Vec<ProcessInfo> = processes
            .iter()
            .map(|p| ProcessInfo::new(p.get_pid(), p.get_name()))
            .collect();

        info!("Found {} processes on USB device", result.len());
        Ok(result)
    }

    pub async fn attach_local(&self, pid: u32) -> Result<String> {
        info!("Attaching to local process {}", pid);

        let device = self
            .device_manager
            .get_local_device()
            .map_err(|e| FridaError::DeviceNotFound(e.to_string()))?;

        let _session = device
            .attach(pid)
            .map_err(|e| FridaError::AttachFailed(e.to_string()))?;

        let process_info = ProcessInfo::new(pid, format!("pid:{}", pid));
        let session_id = Uuid::new_v4().to_string();
        let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        info!("Attached to process {}, session: {}", pid, session_id);
        Ok(session_id)
    }

    pub async fn detach(&self, session_id: &str) -> Result<()> {
        info!("Detaching session: {}", session_id);

        let session = self
            .sessions
            .write()
            .await
            .remove(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session.mark_detached().await;
        info!("Session {} detached", session_id);
        Ok(())
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Arc<FridaSession>> {
        self.sessions.read().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.read().await.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manager_creation() {
        // This test requires Frida to be installed
        let result = FridaManager::new();
        // We don't assert success as it depends on Frida installation
        if result.is_err() {
            eprintln!("FridaManager creation failed (Frida may not be installed)");
        }
    }
}
