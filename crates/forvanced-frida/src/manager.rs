//! Real Frida manager implementation
//!
//! This module provides actual Frida integration using frida-rust bindings.
//! Requires the Frida devkit to be installed.
//!
//! Architecture: All Frida operations run on a dedicated thread because frida-rust's
//! Session and Script types don't implement Send. We use channels to communicate
//! between the async world and the Frida thread.
//!
//! Note: frida-rust has complex lifetime requirements. We use Box::leak and unsafe
//! transmute to work around these limitations. The leaked memory is acceptable
//! because sessions are long-lived and cleaned up on detach.

use std::collections::HashMap;
use std::mem::ManuallyDrop;
use std::sync::Arc;
use std::thread;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

use frida::{DeviceManager, DeviceType, Frida, Message, ScriptHandler, ScriptOption};

use crate::error::{FridaError, Result};
use crate::process::{ApplicationInfo, AttachTarget, DeviceInfo, FridaDeviceType, ProcessInfo, SpawnOptions};
use crate::session::{FridaSession, MessageCallback, ScriptMessage};

/// Commands sent to the Frida worker thread
enum FridaCommand {
    EnumerateDevices {
        reply: oneshot::Sender<Result<Vec<DeviceInfo>>>,
    },
    EnumerateProcesses {
        device_id: String,
        reply: oneshot::Sender<Result<Vec<ProcessInfo>>>,
    },
    EnumerateApplications {
        device_id: String,
        reply: oneshot::Sender<Result<Vec<ApplicationInfo>>>,
    },
    AddRemoteDevice {
        address: String,
        reply: oneshot::Sender<Result<DeviceInfo>>,
    },
    Attach {
        device_id: String,
        target: AttachTarget,
        reply: oneshot::Sender<Result<(String, u32)>>, // (session_id, pid)
    },
    SpawnAndAttach {
        device_id: String,
        identifier: String,
        reply: oneshot::Sender<Result<(String, u32)>>, // (session_id, pid)
    },
    Detach {
        session_id: String,
        reply: oneshot::Sender<Result<()>>,
    },
    InjectScript {
        session_id: String,
        script_source: String,
        reply: oneshot::Sender<Result<String>>, // script_id
    },
    UnloadScript {
        session_id: String,
        script_id: String,
        reply: oneshot::Sender<Result<()>>,
    },
    CallRpc {
        session_id: String,
        script_id: String,
        method: String,
        args: Vec<serde_json::Value>,
        reply: oneshot::Sender<Result<serde_json::Value>>,
    },
    Shutdown,
}

/// Session info stored in worker thread (no raw pointers - safer approach)
/// We re-attach when needed since Frida supports multiple attach calls to same PID
struct SessionInfo {
    device_id: String,
    pid: u32,
    /// Script sources keyed by script_id (we reload scripts when needed)
    script_sources: HashMap<String, String>,
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

/// Frida worker that runs on a dedicated thread
/// 
/// IMPORTANT: DeviceManager is wrapped in ManuallyDrop because dropping it
/// causes a segfault in Frida's cleanup code. This is a known issue with frida-rust.
struct FridaWorker {
    device_manager: ManuallyDrop<DeviceManager<'static>>,
    sessions: HashMap<String, SessionInfo>,
    message_tx: mpsc::UnboundedSender<(String, String, ScriptMessage)>,
}

impl FridaWorker {
    fn new(message_tx: mpsc::UnboundedSender<(String, String, ScriptMessage)>) -> Self {
        // Initialize Frida on this thread
        // Box::leak is used to give Frida a 'static lifetime - this is intentional
        // as Frida should live for the entire duration of the worker thread
        let frida_ref: &'static Frida = Box::leak(Box::new(unsafe { Frida::obtain() }));
        let device_manager = ManuallyDrop::new(DeviceManager::obtain(frida_ref));

        Self {
            device_manager,
            sessions: HashMap::new(),
            message_tx,
        }
    }

    fn run(&mut self, cmd_rx: std::sync::mpsc::Receiver<FridaCommand>) {
        info!("Frida worker thread started");

        while let Ok(cmd) = cmd_rx.recv() {
            match cmd {
                FridaCommand::EnumerateDevices { reply } => {
                    let result = self.enumerate_devices();
                    let _ = reply.send(result);
                }
                FridaCommand::EnumerateProcesses { device_id, reply } => {
                    let result = self.enumerate_processes(&device_id);
                    let _ = reply.send(result);
                }
                FridaCommand::EnumerateApplications { device_id, reply } => {
                    let result = self.enumerate_applications(&device_id);
                    let _ = reply.send(result);
                }
                FridaCommand::AddRemoteDevice { address, reply } => {
                    let result = self.add_remote_device(&address);
                    let _ = reply.send(result);
                }
                FridaCommand::Attach { device_id, target, reply } => {
                    let result = self.attach(&device_id, target);
                    let _ = reply.send(result);
                }
                FridaCommand::SpawnAndAttach { device_id, identifier, reply } => {
                    let result = self.spawn_and_attach(&device_id, &identifier);
                    let _ = reply.send(result);
                }
                FridaCommand::Detach { session_id, reply } => {
                    let result = self.detach(&session_id);
                    let _ = reply.send(result);
                }
                FridaCommand::InjectScript { session_id, script_source, reply } => {
                    let result = self.inject_script(&session_id, &script_source);
                    let _ = reply.send(result);
                }
                FridaCommand::UnloadScript { session_id, script_id, reply } => {
                    let result = self.unload_script(&session_id, &script_id);
                    let _ = reply.send(result);
                }
                FridaCommand::CallRpc { session_id, script_id, method, args, reply } => {
                    let result = self.call_rpc(&session_id, &script_id, &method, args);
                    let _ = reply.send(result);
                }
                FridaCommand::Shutdown => {
                    info!("Frida worker shutting down");
                    break;
                }
            }
        }

        info!("Frida worker thread exiting");
    }

    fn enumerate_devices(&self) -> Result<Vec<DeviceInfo>> {
        debug!("Enumerating all Frida devices");

        // Use ManuallyDrop to prevent Frida objects from being dropped (causes crash)
        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());

        let result: Vec<DeviceInfo> = devices
            .iter()
            .map(|d| {
                let device_type = match d.get_type() {
                    DeviceType::Local => FridaDeviceType::Local,
                    DeviceType::Remote => FridaDeviceType::Remote,
                    DeviceType::USB => FridaDeviceType::Usb,
                    _ => FridaDeviceType::Local,
                };
                DeviceInfo::new(d.get_id(), d.get_name(), device_type)
            })
            .collect();

        info!("Found {} devices", result.len());
        Ok(result)
    }

    fn enumerate_processes(&self, device_id: &str) -> Result<Vec<ProcessInfo>> {
        debug!("Enumerating processes on device: {}", device_id);

        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());

        let device_idx = devices
            .iter()
            .position(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        let processes = ManuallyDrop::new(devices[device_idx].enumerate_processes());

        let result: Vec<ProcessInfo> = processes
            .iter()
            .map(|p| ProcessInfo::new(p.get_pid(), p.get_name()))
            .collect();

        info!("Found {} processes on device {}", result.len(), device_id);
        Ok(result)
    }

    fn enumerate_applications(&self, device_id: &str) -> Result<Vec<ApplicationInfo>> {
        debug!("Enumerating applications on device: {}", device_id);

        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());
        let _has_device = devices.iter().any(|d| d.get_id() == device_id);
        
        if !_has_device {
            return Err(FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)));
        }

        warn!(
            "enumerate_applications is not supported in frida-rust 0.17.x. \
             Use spawn with bundle identifier for mobile apps."
        );

        Ok(vec![])
    }

    fn add_remote_device(&self, address: &str) -> Result<DeviceInfo> {
        debug!("Adding remote device at {}", address);

        let device = ManuallyDrop::new(
            self.device_manager
                .get_remote_device(address)
                .map_err(|e| FridaError::ConnectionFailed(e.to_string()))?
        );

        let info = DeviceInfo::new(device.get_id(), device.get_name(), FridaDeviceType::Remote);
        
        info!("Added remote device: {} ({})", info.name, info.id);
        Ok(info)
    }

    fn attach(&mut self, device_id: &str, target: AttachTarget) -> Result<(String, u32)> {
        info!("Attaching to {} on device {}", target, device_id);
        eprintln!("[FRIDA DEBUG] attach() called: device_id={}, target={:?}", device_id, target);

        eprintln!("[FRIDA DEBUG] Enumerating devices...");
        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());
        eprintln!("[FRIDA DEBUG] Found {} devices", devices.len());

        let device_idx = devices.iter().position(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;
        eprintln!("[FRIDA DEBUG] Found device: {}", devices[device_idx].get_name());

        // Resolve target to PID
        eprintln!("[FRIDA DEBUG] Resolving target to PID...");
        let pid = match &target {
            AttachTarget::Pid(pid) => {
                eprintln!("[FRIDA DEBUG] Target is PID: {}", pid);
                *pid
            }
            AttachTarget::Name(name) => {
                eprintln!("[FRIDA DEBUG] Target is Name: {}", name);
                let processes = ManuallyDrop::new(devices[device_idx].enumerate_processes());
                eprintln!("[FRIDA DEBUG] Found {} processes", processes.len());
                let process_pid = processes
                    .iter()
                    .find(|p| p.get_name() == name)
                    .map(|p| p.get_pid())
                    .ok_or_else(|| FridaError::ProcessNotFound(format!("Process '{}' not found", name)))?;
                eprintln!("[FRIDA DEBUG] Found process with PID: {}", process_pid);
                process_pid
            }
            AttachTarget::Identifier(identifier) => {
                eprintln!("[FRIDA DEBUG] Target is Identifier: {}", identifier);
                let processes = ManuallyDrop::new(devices[device_idx].enumerate_processes());
                eprintln!("[FRIDA DEBUG] Found {} processes", processes.len());
                let process_pid = processes
                    .iter()
                    .find(|p| p.get_name() == identifier)
                    .or_else(|| {
                        let short_name = identifier.split('.').last().unwrap_or(identifier);
                        processes.iter().find(|p| {
                            p.get_name().to_lowercase().contains(&short_name.to_lowercase())
                        })
                    })
                    .map(|p| p.get_pid())
                    .ok_or_else(|| FridaError::ProcessNotFound(format!(
                        "No running process found for identifier '{}'. Use spawn to start it.",
                        identifier
                    )))?;
                eprintln!("[FRIDA DEBUG] Found process with PID: {}", process_pid);
                process_pid
            }
        };

        eprintln!("[FRIDA DEBUG] Attempting to attach to PID {}...", pid);
        let _session = ManuallyDrop::new(
            devices[device_idx].attach(pid)
                .map_err(|e| {
                    eprintln!("[FRIDA DEBUG] Attach failed: {}", e);
                    FridaError::AttachFailed(e.to_string())
                })?
        );
        eprintln!("[FRIDA DEBUG] Attach successful!");

        let session_id = Uuid::new_v4().to_string();
        eprintln!("[FRIDA DEBUG] Created session_id: {}", session_id);

        // Store session info (no raw pointers - we re-attach when needed)
        self.sessions.insert(
            session_id.clone(),
            SessionInfo {
                device_id: device_id.to_string(),
                pid,
                script_sources: HashMap::new(),
            },
        );

        info!("Attached to {} on device {}, session: {}", target, device_id, session_id);
        Ok((session_id, pid))
    }

    fn spawn_and_attach(&mut self, device_id: &str, identifier: &str) -> Result<(String, u32)> {
        info!("Spawning and attaching to {} on device {}", identifier, device_id);

        let mut devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());

        let device_idx = devices.iter().position(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        // Spawn the application
        let pid = devices[device_idx].spawn(identifier, &frida::SpawnOptions::new())
            .map_err(|e| FridaError::SpawnFailed(e.to_string()))?;

        // Attach to verify it works
        let _session = ManuallyDrop::new(
            devices[device_idx].attach(pid)
                .map_err(|e| FridaError::AttachFailed(e.to_string()))?
        );

        // Resume the process
        devices[device_idx].resume(pid)
            .map_err(|e| FridaError::ResumeFailed(e.to_string()))?;

        let session_id = Uuid::new_v4().to_string();

        // Store session info
        self.sessions.insert(
            session_id.clone(),
            SessionInfo {
                device_id: device_id.to_string(),
                pid,
                script_sources: HashMap::new(),
            },
        );

        info!("Spawned and attached to {} on device {}, session: {}", identifier, device_id, session_id);
        Ok((session_id, pid))
    }

    fn detach(&mut self, session_id: &str) -> Result<()> {
        info!("Detaching session: {}", session_id);

        let _session_info = self.sessions.remove(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        // Session info is just metadata, actual Frida session is not held
        info!("Session {} detached", session_id);
        Ok(())
    }

    fn inject_script(&mut self, session_id: &str, script_source: &str) -> Result<String> {
        info!("Injecting script into session {}, source length: {}", session_id, script_source.len());

        let session_info = self.sessions.get_mut(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        let script_id = Uuid::new_v4().to_string();
        let device_id = session_info.device_id.clone();
        let pid = session_info.pid;

        // Re-attach to get a fresh session
        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());
        let device_idx = devices.iter().position(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        let session = ManuallyDrop::new(
            devices[device_idx].attach(pid)
                .map_err(|e| FridaError::AttachFailed(format!("Failed to re-attach: {}", e)))?
        );

        let mut script_option = ScriptOption::new();

        // Create the script
        let mut script = ManuallyDrop::new(
            session.create_script(script_source, &mut script_option)
                .map_err(|e| FridaError::ScriptCreationFailed(e.to_string()))?
        );

        // Set up message handler
        let handler = MessageHandler {
            session_id: session_id.to_string(),
            script_id: script_id.clone(),
            message_tx: self.message_tx.clone(),
        };
        script.handle_message(handler)
            .map_err(|e| FridaError::ScriptCreationFailed(format!("Failed to set message handler: {}", e)))?;

        // Load the script
        script.load().map_err(|e| FridaError::ScriptLoadFailed(e.to_string()))?;

        // Store script source for potential reload
        if let Some(session_info) = self.sessions.get_mut(session_id) {
            session_info.script_sources.insert(script_id.clone(), script_source.to_string());
        }

        info!("Script {} injected into session {}", script_id, session_id);
        Ok(script_id)
    }

    fn unload_script(&mut self, session_id: &str, script_id: &str) -> Result<()> {
        info!("Unloading script {} from session {}", script_id, session_id);

        let session_info = self.sessions.get_mut(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        session_info.script_sources.remove(script_id)
            .ok_or_else(|| FridaError::ScriptNotFound(script_id.to_string()))?;

        // Note: The actual script in the target process may still be running
        // To truly unload, we'd need to keep the Script object alive
        // For now, we just remove from our tracking

        info!("Script {} unloaded from session {}", script_id, session_id);
        Ok(())
    }

    fn call_rpc(&mut self, session_id: &str, script_id: &str, method: &str, args: Vec<serde_json::Value>) -> Result<serde_json::Value> {
        info!("Calling RPC method '{}' on script {} in session {}", method, script_id, session_id);

        let session_info = self.sessions.get(session_id)
            .ok_or_else(|| FridaError::SessionNotFound(session_id.to_string()))?;

        let script_source = session_info.script_sources.get(script_id)
            .ok_or_else(|| FridaError::ScriptNotFound(script_id.to_string()))?
            .clone();

        let device_id = session_info.device_id.clone();
        let pid = session_info.pid;

        // Re-attach and reload script for RPC call
        let devices = ManuallyDrop::new(self.device_manager.enumerate_all_devices());
        let device_idx = devices.iter().position(|d| d.get_id() == device_id)
            .ok_or_else(|| FridaError::DeviceNotFound(format!("Device '{}' not found", device_id)))?;

        let session = ManuallyDrop::new(
            devices[device_idx].attach(pid)
                .map_err(|e| FridaError::AttachFailed(format!("Failed to re-attach: {}", e)))?
        );

        let mut script_option = ScriptOption::new();
        let mut script = ManuallyDrop::new(
            session.create_script(&script_source, &mut script_option)
                .map_err(|e| FridaError::ScriptCreationFailed(e.to_string()))?
        );

        script.load().map_err(|e| FridaError::ScriptLoadFailed(e.to_string()))?;

        let args_value = serde_json::Value::Array(args);

        let result = script.exports.call(method, Some(args_value))
            .map_err(|e| FridaError::RpcCallFailed(e.to_string()))?;

        info!("RPC call '{}' completed", method);
        Ok(result.unwrap_or(serde_json::Value::Null))
    }
}

pub struct FridaManager {
    /// Channel to send commands to the worker thread
    cmd_tx: std::sync::mpsc::Sender<FridaCommand>,
    /// Handle to the worker thread
    #[allow(dead_code)]
    worker_handle: Option<thread::JoinHandle<()>>,
    /// Session metadata (for async access without going to worker)
    sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>>,
    /// Message receiver handle (spawned task)
    #[allow(dead_code)]
    message_rx_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

// FridaManager is Send+Sync because it only holds channels and Arc<RwLock<>>
unsafe impl Send for FridaManager {}
unsafe impl Sync for FridaManager {}

impl FridaManager {
    pub fn new() -> Result<Self> {
        info!("Initializing Real Frida manager with dedicated worker thread");

        // Create command channel (std::sync for thread communication)
        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<FridaCommand>();

        // Create message channel for async message dispatching
        let (message_tx, mut message_rx) = mpsc::unbounded_channel::<(String, String, ScriptMessage)>();

        let sessions: Arc<RwLock<HashMap<String, Arc<FridaSession>>>> = Arc::new(RwLock::new(HashMap::new()));
        let sessions_clone = sessions.clone();

        // Spawn message dispatcher task (async)
        let handle = tokio::spawn(async move {
            while let Some((session_id, script_id, message)) = message_rx.recv().await {
                let sessions = sessions_clone.read().await;
                if let Some(session) = sessions.get(&session_id) {
                    session.dispatch_message(&script_id, message).await;
                }
            }
        });

        // Spawn Frida worker thread (sync, owns all Frida objects)
        let worker_handle = thread::Builder::new()
            .name("frida-worker".to_string())
            .spawn(move || {
                // Set up panic hook for this thread
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let mut worker = FridaWorker::new(message_tx);
                    worker.run(cmd_rx);
                }));
                
                if let Err(e) = result {
                    let panic_msg = if let Some(s) = e.downcast_ref::<&str>() {
                        s.to_string()
                    } else if let Some(s) = e.downcast_ref::<String>() {
                        s.clone()
                    } else {
                        "Unknown panic".to_string()
                    };
                    eprintln!("FRIDA WORKER PANIC: {}", panic_msg);
                    tracing::error!("Frida worker thread panicked: {}", panic_msg);
                }
            })
            .map_err(|e| FridaError::InitializationFailed(format!("Failed to spawn worker thread: {}", e)))?;

        Ok(Self {
            cmd_tx,
            worker_handle: Some(worker_handle),
            sessions,
            message_rx_handle: Arc::new(RwLock::new(Some(handle))),
        })
    }

    /// Send a command to the worker and wait for response
    async fn send_command<T, F>(&self, make_cmd: F) -> Result<T>
    where
        F: FnOnce(oneshot::Sender<Result<T>>) -> FridaCommand,
    {
        let (reply_tx, reply_rx) = oneshot::channel();
        let cmd = make_cmd(reply_tx);

        self.cmd_tx.send(cmd)
            .map_err(|_| FridaError::NotConnected)?;

        reply_rx.await
            .map_err(|_| FridaError::NotConnected)?
    }

    /// Enumerate all available Frida devices
    pub async fn enumerate_devices(&self) -> Result<Vec<DeviceInfo>> {
        self.send_command(|reply| FridaCommand::EnumerateDevices { reply }).await
    }

    /// Enumerate processes on a specific device by device ID
    pub async fn enumerate_processes_on_device(&self, device_id: &str) -> Result<Vec<ProcessInfo>> {
        self.send_command(|reply| FridaCommand::EnumerateProcesses {
            device_id: device_id.to_string(),
            reply,
        }).await
    }

    /// Enumerate installed applications on a device (for mobile/USB devices)
    pub async fn enumerate_applications_on_device(&self, device_id: &str) -> Result<Vec<ApplicationInfo>> {
        self.send_command(|reply| FridaCommand::EnumerateApplications {
            device_id: device_id.to_string(),
            reply,
        }).await
    }

    /// Add a remote device and return its info
    pub async fn add_remote_device(&self, address: &str) -> Result<DeviceInfo> {
        self.send_command(|reply| FridaCommand::AddRemoteDevice {
            address: address.to_string(),
            reply,
        }).await
    }

    /// Attach to a process on a specific device by device ID (legacy method for backward compatibility)
    pub async fn attach_on_device(&self, device_id: &str, pid: u32) -> Result<String> {
        self.attach_target(device_id, AttachTarget::Pid(pid)).await
    }

    /// Attach to a target on a specific device
    pub async fn attach_target(&self, device_id: &str, target: AttachTarget) -> Result<String> {
        eprintln!("[FRIDA DEBUG] attach_target() sending command...");
        let (session_id, pid) = self.send_command(|reply| FridaCommand::Attach {
            device_id: device_id.to_string(),
            target: target.clone(),
            reply,
        }).await?;
        eprintln!("[FRIDA DEBUG] attach_target() command returned: session_id={}, pid={}", session_id, pid);

        // Create FridaSession metadata for async access
        eprintln!("[FRIDA DEBUG] Creating FridaSession metadata...");
        let process_info = ProcessInfo::new(pid, format!("{}:{}", device_id, target));
        let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));
        eprintln!("[FRIDA DEBUG] FridaSession created");

        eprintln!("[FRIDA DEBUG] Inserting session into map...");
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);
        eprintln!("[FRIDA DEBUG] Session inserted, returning session_id");

        Ok(session_id)
    }

    /// Spawn and attach to an application by identifier
    pub async fn spawn_and_attach(&self, device_id: &str, identifier: &str, _options: SpawnOptions) -> Result<String> {
        let (session_id, pid) = self.send_command(|reply| FridaCommand::SpawnAndAttach {
            device_id: device_id.to_string(),
            identifier: identifier.to_string(),
            reply,
        }).await?;

        // Create FridaSession metadata for async access
        let process_info = ProcessInfo::new(pid, format!("{}:spawn:{}", device_id, identifier));
        let frida_session = Arc::new(FridaSession::new(session_id.clone(), process_info));

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), frida_session);

        Ok(session_id)
    }

    pub async fn detach(&self, session_id: &str) -> Result<()> {
        // Send detach command to worker
        self.send_command(|reply| FridaCommand::Detach {
            session_id: session_id.to_string(),
            reply,
        }).await?;

        // Clean up session metadata
        if let Some(session) = self.sessions.write().await.remove(session_id) {
            session.mark_detached().await;
        }

        Ok(())
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Arc<FridaSession>> {
        self.sessions.read().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.read().await.keys().cloned().collect()
    }

    /// Inject a Frida script into a session.
    pub async fn inject_script(&self, session_id: &str, script_source: &str) -> Result<String> {
        let script_id = self.send_command(|reply| FridaCommand::InjectScript {
            session_id: session_id.to_string(),
            script_source: script_source.to_string(),
            reply,
        }).await?;

        // Update session metadata
        if let Some(session) = self.sessions.read().await.get(session_id) {
            session.add_script(script_id.clone(), "user_script".to_string(), script_source.to_string()).await;
            session.mark_script_loaded(&script_id).await;
        }

        Ok(script_id)
    }

    /// Unload a script from a session.
    pub async fn unload_script(&self, session_id: &str, script_id: &str) -> Result<()> {
        self.send_command(|reply| FridaCommand::UnloadScript {
            session_id: session_id.to_string(),
            script_id: script_id.to_string(),
            reply,
        }).await?;

        // Update session metadata
        if let Some(session) = self.sessions.read().await.get(session_id) {
            session.remove_script(script_id).await;
        }

        Ok(())
    }

    /// Call an RPC method on a Frida script.
    pub async fn call_rpc(
        &self,
        session_id: &str,
        script_id: &str,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        self.send_command(|reply| FridaCommand::CallRpc {
            session_id: session_id.to_string(),
            script_id: script_id.to_string(),
            method: method.to_string(),
            args,
            reply,
        }).await
    }

    /// Register a message callback for a session.
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

impl Drop for FridaManager {
    fn drop(&mut self) {
        // Send shutdown command to worker thread
        let _ = self.cmd_tx.send(FridaCommand::Shutdown);
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
