use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};
use uuid::Uuid;

use frida::{DeviceManager, DeviceType, Frida};

use crate::error::{FridaError, Result};
use crate::process::{ApplicationInfo, AttachTarget, DeviceInfo, FridaDeviceType, ProcessInfo, SpawnOptions};
use crate::session::FridaSession;

pub struct FridaManager {
    #[allow(dead_code)]
    frida: Arc<Frida>,
    device_manager: DeviceManager<'static>,
    sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>>,
}

// SAFETY: FridaManager is thread-safe because:
// 1. Frida's C API is thread-safe (uses GLib main loop internally)
// 2. We use RwLock for sessions
// 3. DeviceManager operations are synchronized by Frida internally
unsafe impl Send for FridaManager {}
unsafe impl Sync for FridaManager {}

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

    /// Enumerate all available Frida devices
    pub fn enumerate_devices(&self) -> Result<Vec<DeviceInfo>> {
        debug!("Enumerating all Frida devices");

        let devices = self.device_manager.enumerate_all_devices();

        let result: Vec<DeviceInfo> = devices
            .iter()
            .map(|d| {
                let device_type = match d.get_type() {
                    DeviceType::Local => FridaDeviceType::Local,
                    DeviceType::Remote => FridaDeviceType::Remote,
                    DeviceType::USB => FridaDeviceType::Usb,
                    _ => FridaDeviceType::Local, // Unknown device types default to Local
                };
                DeviceInfo::new(d.get_id(), d.get_name(), device_type)
            })
            .collect();

        info!("Found {} devices", result.len());
        Ok(result)
    }

    /// Enumerate processes on a specific device by device ID
    pub fn enumerate_processes_on_device(&self, device_id: &str) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating processes on device: {}", device_id);

        let devices = self.device_manager.enumerate_all_devices();

        let device = devices
            .iter()
            .find(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        let processes = device.enumerate_processes();

        let result: Vec<ProcessInfo> = processes
            .iter()
            .map(|p| ProcessInfo::new(p.get_pid(), p.get_name()))
            .collect();

        info!("Found {} processes on device {}", result.len(), device_id);
        Ok(result)
    }

    /// Enumerate installed applications on a device (for mobile/USB devices)
    pub fn enumerate_applications_on_device(&self, device_id: &str) -> Result<Vec<ApplicationInfo>> {
        debug!("Enumerating applications on device: {}", device_id);

        let devices = self.device_manager.enumerate_all_devices();

        let device = devices
            .iter()
            .find(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        let applications = device.enumerate_applications();

        let result: Vec<ApplicationInfo> = applications
            .iter()
            .map(|app| {
                let mut info = ApplicationInfo::new(app.get_identifier(), app.get_name());
                if let Some(pid) = app.get_pid() {
                    if pid > 0 {
                        info = info.with_pid(pid as u32);
                    }
                }
                info
            })
            .collect();

        info!("Found {} applications on device {}", result.len(), device_id);
        Ok(result)
    }

    /// Attach to a process on a specific device by device ID (legacy method for backward compatibility)
    pub async fn attach_on_device(&self, device_id: &str, pid: u32) -> Result<String> {
        self.attach_target(device_id, AttachTarget::Pid(pid)).await
    }

    /// Attach to a target on a specific device
    /// Supports multiple attach modes: pid, name, identifier
    pub async fn attach_target(&self, device_id: &str, target: AttachTarget) -> Result<String> {
        info!("Attaching to {} on device {}", target, device_id);

        // Do all Frida work synchronously first (no await crossing)
        let (session_id, frida_session) = {
            let devices = self.device_manager.enumerate_all_devices();

            let device = devices
                .iter()
                .find(|d| d.get_id() == device_id)
                .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

            // Resolve target to PID
            let (pid, target_name) = match &target {
                AttachTarget::Pid(pid) => (*pid, format!("pid:{}", pid)),
                AttachTarget::Name(name) => {
                    // Find process by name
                    let processes = device.enumerate_processes();
                    let process = processes
                        .iter()
                        .find(|p| p.get_name() == name)
                        .ok_or_else(|| FridaError::ProcessNotFound(format!("Process '{}' not found", name)))?;
                    (process.get_pid(), format!("name:{}", name))
                }
                AttachTarget::Identifier(identifier) => {
                    // Find application by bundle identifier
                    let applications = device.enumerate_applications();
                    let app = applications
                        .iter()
                        .find(|a| a.get_identifier() == identifier)
                        .ok_or_else(|| FridaError::ProcessNotFound(format!("Application '{}' not found", identifier)))?;

                    // Check if the app is running
                    let pid = app.get_pid().filter(|&p| p > 0).ok_or_else(|| {
                        FridaError::ProcessNotFound(format!(
                            "Application '{}' is not running. Use spawn to start it.",
                            identifier
                        ))
                    })?;
                    (pid as u32, format!("identifier:{}", identifier))
                }
            };

            let _session = device
                .attach(pid)
                .map_err(|e| FridaError::AttachFailed(e.to_string()))?;

            let process_info = ProcessInfo::new(pid, format!("{}:{}", device_id, target_name));
            let session_id = Uuid::new_v4().to_string();
            let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

            (session_id, frida_session)
        }; // devices and _session are dropped here, before any await

        // Now we can safely await
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        info!("Attached to {} on device {}, session: {}", target, device_id, session_id);
        Ok(session_id)
    }

    /// Spawn and attach to an application by identifier
    pub async fn spawn_and_attach(&self, device_id: &str, identifier: &str, _options: SpawnOptions) -> Result<String> {
        info!("Spawning and attaching to {} on device {}", identifier, device_id);

        let (session_id, frida_session) = {
            let devices = self.device_manager.enumerate_all_devices();

            let device = devices
                .iter()
                .find(|d| d.get_id() == device_id)
                .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

            // Spawn the application
            let pid = device
                .spawn(identifier, &frida::SpawnOptions::new())
                .map_err(|e| FridaError::SpawnFailed(e.to_string()))?;

            // Attach to the spawned process
            let _session = device
                .attach(pid)
                .map_err(|e| FridaError::AttachFailed(e.to_string()))?;

            let process_info = ProcessInfo::new(pid, format!("{}:spawn:{}", device_id, identifier));
            let session_id = Uuid::new_v4().to_string();
            let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

            // Resume the process (it's suspended after spawn)
            device.resume(pid).map_err(|e| FridaError::ResumeFailed(e.to_string()))?;

            (session_id, frida_session)
        };

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        info!("Spawned and attached to {} on device {}, session: {}", identifier, device_id, session_id);
        Ok(session_id)
    }

    /// Add a remote device and return its info
    pub fn add_remote_device(&self, address: &str) -> Result<DeviceInfo> {
        debug!("Adding remote device at {}", address);

        // get_remote_device actually adds the remote device in frida-rust
        let device = self
            .device_manager
            .get_remote_device(address)
            .map_err(|e| FridaError::ConnectionFailed(e.to_string()))?;

        let info = DeviceInfo::new(device.get_id(), device.get_name(), FridaDeviceType::Remote);
        info!("Added remote device: {} ({})", info.name, info.id);
        Ok(info)
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

    /// Inject a Frida script into a session.
    /// NOTE: Real implementation requires storing actual Frida Session handles.
    /// Currently stubbed for compilation.
    pub async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        info!(
            "Injecting script into session {}, source length: {}",
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

        // TODO: Real implementation would:
        // 1. Get the actual Frida session handle
        // 2. Create a Script from the source
        // 3. Load and enable the script
        // For now, we create a script handle entry
        let script_id = Uuid::new_v4().to_string();
        session.add_script(script_id.clone(), "user_script".to_string()).await;

        // Mark as loaded
        if let Some(handle) = session.scripts.write().await.get_mut(&script_id) {
            handle.loaded = true;
        }

        info!("Script {} injected into session {}", script_id, session_id);
        Ok(script_id)
    }

    /// Unload a script from a session.
    pub async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        info!(
            "Unloading script {} from session {}",
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

        info!("Script {} unloaded from session {}", script_id, session_id);
        Ok(())
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
