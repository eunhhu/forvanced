//! Real Frida manager implementation
//!
//! This module provides actual Frida integration using frida-rust bindings.
//! Requires the Frida devkit to be installed.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

use frida::{DeviceManager, DeviceType, Frida, Message, ScriptHandler, ScriptOption};

use crate::error::{FridaError, Result};
use crate::process::{ApplicationInfo, AttachTarget, DeviceInfo, FridaDeviceType, ProcessInfo, SpawnOptions};
use crate::session::{FridaSession, MessageCallback, ScriptMessage};

/// Wrapper for actual Frida session to handle lifetimes
struct RealSession {
    #[allow(dead_code)]
    device_id: String,
    pid: u32,
}

/// Wrapper for actual Frida script
struct RealScript {
    #[allow(dead_code)]
    session_id: String,
}

/// Message handler that implements ScriptHandler trait
struct MessageHandler {
    session_id: String,
    script_id: String,
    message_tx: mpsc::UnboundedSender<(String, String, ScriptMessage)>,
}

impl ScriptHandler for MessageHandler {
    fn on_message(&mut self, message: Message, _data: Option<Vec<u8>>) {
        let script_message = match message {
            Message::Log(log) => {
                let level = match log.level {
                    frida::MessageLogLevel::Info => "info",
                    frida::MessageLogLevel::Debug => "debug",
                    frida::MessageLogLevel::Warning => "warning",
                    frida::MessageLogLevel::Error => "error",
                };
                ScriptMessage::Log {
                    level: level.to_string(),
                    text: log.payload,
                }
            }
            Message::Send(send) => {
                // Convert SendPayload to serde_json::Value
                let payload = serde_json::json!({
                    "type": send.payload.r#type,
                    "id": send.payload.id,
                    "result": send.payload.result,
                    "returns": send.payload.returns,
                });
                ScriptMessage::Send { payload }
            }
            Message::Error(err) => ScriptMessage::Error {
                description: err.description,
                stack: Some(err.stack),
                file_name: Some(err.file_name),
                line_number: Some(err.line_number as u32),
            },
            Message::Other(value) => {
                // Try to handle as a generic send message
                ScriptMessage::Send { payload: value }
            }
        };

        let _ = self.message_tx.send((
            self.session_id.clone(),
            self.script_id.clone(),
            script_message,
        ));
    }
}

pub struct FridaManager {
    #[allow(dead_code)]
    frida: Arc<Frida>,
    device_manager: DeviceManager<'static>,
    sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>>,
    /// Store real session info for device lookup
    real_sessions: Arc<RwLock<HashMap<String, RealSession>>>,
    /// Store real script info
    real_scripts: Arc<RwLock<HashMap<String, RealScript>>>,
    /// Message sender for dispatching script messages
    message_tx: mpsc::UnboundedSender<(String, String, ScriptMessage)>,
    /// Message receiver handle (spawned task)
    #[allow(dead_code)]
    message_rx_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

// SAFETY: FridaManager is thread-safe because:
// 1. Frida's C API is thread-safe (uses GLib main loop internally)
// 2. We use RwLock for sessions
// 3. DeviceManager operations are synchronized by Frida internally
unsafe impl Send for FridaManager {}
unsafe impl Sync for FridaManager {}

impl FridaManager {
    pub fn new() -> Result<Self> {
        info!("Initializing Real Frida manager");

        let frida = unsafe { Frida::obtain() };
        let frida = Arc::new(frida);

        // DeviceManager needs 'static lifetime, we use leaked reference
        let frida_ref: &'static Frida = Box::leak(Box::new(unsafe { Frida::obtain() }));
        let device_manager = DeviceManager::obtain(frida_ref);

        // Create message channel for async message dispatching
        let (message_tx, mut message_rx) = mpsc::unbounded_channel::<(String, String, ScriptMessage)>();

        let sessions_for_task: Arc<RwLock<HashMap<String, Arc<FridaSession>>>> = Arc::new(RwLock::new(HashMap::new()));
        let sessions_clone = sessions_for_task.clone();

        // Spawn message dispatcher task
        let handle = tokio::spawn(async move {
            while let Some((session_id, script_id, message)) = message_rx.recv().await {
                let sessions = sessions_clone.read().await;
                if let Some(session) = sessions.get(&session_id) {
                    session.dispatch_message(&script_id, message).await;
                }
            }
        });

        Ok(Self {
            frida,
            device_manager,
            sessions: sessions_for_task,
            real_sessions: Arc::new(RwLock::new(HashMap::new())),
            real_scripts: Arc::new(RwLock::new(HashMap::new())),
            message_tx,
            message_rx_handle: Arc::new(RwLock::new(Some(handle))),
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
    /// NOTE: frida-rust 0.17.x does not expose enumerate_applications API.
    /// This returns an empty list with a warning. Use spawn with identifier for mobile apps.
    pub fn enumerate_applications_on_device(&self, device_id: &str) -> Result<Vec<ApplicationInfo>> {
        debug!("Enumerating applications on device: {}", device_id);

        // Verify device exists
        let devices = self.device_manager.enumerate_all_devices();
        let _device = devices
            .iter()
            .find(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        // frida-rust 0.17.x doesn't expose enumerate_applications
        // Return empty list with warning
        warn!(
            "enumerate_applications is not supported in frida-rust 0.17.x. \
             Use spawn with bundle identifier for mobile apps."
        );

        Ok(vec![])
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
        let (session_id, frida_session, pid) = {
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
                    // For identifier-based attach, we need to find by process name pattern
                    // since frida-rust doesn't support enumerate_applications
                    // Try to find a process that matches the identifier pattern
                    let processes = device.enumerate_processes();

                    // Try exact match first, then partial match
                    let process = processes
                        .iter()
                        .find(|p| p.get_name() == identifier)
                        .or_else(|| {
                            // Try finding by partial name match (last component of identifier)
                            let short_name = identifier.split('.').last().unwrap_or(identifier);
                            processes.iter().find(|p| {
                                p.get_name().to_lowercase().contains(&short_name.to_lowercase())
                            })
                        })
                        .ok_or_else(|| {
                            FridaError::ProcessNotFound(format!(
                                "No running process found for identifier '{}'. Use spawn to start it.",
                                identifier
                            ))
                        })?;

                    (process.get_pid(), format!("identifier:{}", identifier))
                }
            };

            // Attach to process - this creates the actual Frida session
            let _session = device
                .attach(pid)
                .map_err(|e| FridaError::AttachFailed(e.to_string()))?;

            let process_info = ProcessInfo::new(pid, format!("{}:{}", device_id, target_name));
            let session_id = Uuid::new_v4().to_string();
            let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

            (session_id, frida_session, pid)
        }; // devices and _session are dropped here, before any await

        // Store real session info
        self.real_sessions.write().await.insert(
            session_id.clone(),
            RealSession {
                device_id: device_id.to_string(),
                pid,
            },
        );

        // Now we can safely await
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        info!("Attached to {} on device {}, session: {}", target, device_id, session_id);
        Ok(session_id)
    }

    /// Spawn and attach to an application by identifier
    /// NOTE: spawn requires mutable access to Device, so we need to use into_iter()
    pub async fn spawn_and_attach(&self, device_id: &str, identifier: &str, _options: SpawnOptions) -> Result<String> {
        info!("Spawning and attaching to {} on device {}", identifier, device_id);

        let (session_id, frida_session, pid) = {
            let devices = self.device_manager.enumerate_all_devices();

            // Find and take ownership of the device for mutable operations
            let mut device = devices
                .into_iter()
                .find(|d| d.get_id() == device_id)
                .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

            // Spawn the application (requires &mut self)
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

            (session_id, frida_session, pid)
        };

        // Store real session info
        self.real_sessions.write().await.insert(
            session_id.clone(),
            RealSession {
                device_id: device_id.to_string(),
                pid,
            },
        );

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

        // Clean up real session
        self.real_sessions.write().await.remove(session_id);

        // Clean up scripts for this session
        let script_ids: Vec<String> = {
            let scripts = self.real_scripts.read().await;
            scripts
                .iter()
                .filter(|(_, s)| s.session_id == session_id)
                .map(|(id, _)| id.clone())
                .collect()
        };
        for script_id in script_ids {
            self.real_scripts.write().await.remove(&script_id);
        }

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
    /// This creates and loads an actual Frida script.
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

        // Get real session info
        let real_session = self
            .real_sessions
            .read()
            .await
            .get(session_id)
            .map(|s| (s.device_id.clone(), s.pid))
            .ok_or_else(|| FridaError::SessionNotFound(format!("Real session not found: {}", session_id)))?;

        let (device_id, pid) = real_session;

        // Create and load actual Frida script
        let script_id = {
            let devices = self.device_manager.enumerate_all_devices();
            let device = devices
                .iter()
                .find(|d| d.get_id() == device_id)
                .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

            // Re-attach to get session handle
            let frida_session = device
                .attach(pid)
                .map_err(|e| FridaError::AttachFailed(format!("Failed to re-attach: {}", e)))?;

            // Create script with message handler
            let script_id = Uuid::new_v4().to_string();

            let mut script_option = ScriptOption::new();

            // Create the script
            let mut script = frida_session
                .create_script(script_source, &mut script_option)
                .map_err(|e| FridaError::ScriptCreationFailed(e.to_string()))?;

            // Set up message handler using ScriptHandler trait
            let handler = MessageHandler {
                session_id: session_id.to_string(),
                script_id: script_id.clone(),
                message_tx: self.message_tx.clone(),
            };
            script.handle_message(handler)
                .map_err(|e| FridaError::ScriptCreationFailed(format!("Failed to set message handler: {}", e)))?;

            // Load the script
            script.load().map_err(|e| FridaError::ScriptLoadFailed(e.to_string()))?;

            script_id
        };

        // Store in our session
        session.add_script(script_id.clone(), "user_script".to_string(), script_source.to_string()).await;
        session.mark_script_loaded(&script_id).await;

        // Store real script info
        self.real_scripts.write().await.insert(
            script_id.clone(),
            RealScript {
                session_id: session_id.to_string(),
            },
        );

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

        // Clean up real script
        self.real_scripts.write().await.remove(script_id);

        info!("Script {} unloaded from session {}", script_id, session_id);
        Ok(())
    }

    /// Call an RPC method on a Frida script.
    /// The script must export the method via `rpc.exports`.
    ///
    /// # Arguments
    /// * `session_id` - The session containing the script
    /// * `script_id` - The script to call
    /// * `method` - The RPC method name (as exported in rpc.exports)
    /// * `args` - JSON arguments to pass to the method
    ///
    /// # Returns
    /// The JSON result from the RPC call
    pub async fn call_rpc(
        &self,
        session_id: &str,
        script_id: &str,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        info!(
            "Calling RPC method '{}' on script {} in session {}",
            method, script_id, session_id
        );

        let session = self
            .sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        // Verify script exists
        let scripts = session.scripts.read().await;
        if !scripts.contains_key(script_id) {
            return Err(FridaError::ScriptNotFound(script_id.to_string()));
        }
        drop(scripts);

        // Get real session info
        let real_session = self
            .real_sessions
            .read()
            .await
            .get(session_id)
            .map(|s| (s.device_id.clone(), s.pid))
            .ok_or_else(|| FridaError::SessionNotFound(format!("Real session not found: {}", session_id)))?;

        let (device_id, pid) = real_session;

        // Get script source to recreate script for RPC call
        // NOTE: This is a workaround because frida-rust Script doesn't impl Send
        // In production, we'd need a different architecture (e.g., dedicated thread per session)
        let script_source = {
            let scripts = session.scripts.read().await;
            scripts.get(script_id)
                .map(|h| h.source.clone())
                .ok_or_else(|| FridaError::ScriptNotFound(script_id.to_string()))?
        };

        // Perform RPC call
        let result = {
            let devices = self.device_manager.enumerate_all_devices();
            let device = devices
                .iter()
                .find(|d| d.get_id() == device_id)
                .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

            let frida_session = device
                .attach(pid)
                .map_err(|e| FridaError::AttachFailed(format!("Failed to re-attach: {}", e)))?;

            let mut script_option = ScriptOption::new();
            let mut script = frida_session
                .create_script(&script_source, &mut script_option)
                .map_err(|e| FridaError::ScriptCreationFailed(e.to_string()))?;

            script.load().map_err(|e| FridaError::ScriptLoadFailed(e.to_string()))?;

            // Convert args to serde_json::Value for frida-rust
            let args_value: serde_json::Value = serde_json::Value::Array(args);

            // Call the RPC method using exports field
            let result = script.exports.call(method, Some(args_value))
                .map_err(|e| FridaError::RpcCallFailed(e.to_string()))?;

            // Return result or null
            result.unwrap_or(serde_json::Value::Null)
        };

        info!("RPC call '{}' completed", method);
        Ok(result)
    }

    /// Register a message callback for a session.
    /// This callback will be invoked when the Frida script sends messages.
    pub async fn on_session_message(
        &self,
        session_id: &str,
        callback: MessageCallback,
    ) -> Result<()> {
        let session = self
            .sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session.on_message(callback).await;
        info!("Message callback registered for session {}", session_id);
        Ok(())
    }

    /// Dispatch a message to a session's callbacks (for testing or internal use).
    pub async fn dispatch_message(
        &self,
        session_id: &str,
        script_id: &str,
        message: ScriptMessage,
    ) -> Result<()> {
        let session = self
            .sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session.dispatch_message(script_id, message).await;
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
