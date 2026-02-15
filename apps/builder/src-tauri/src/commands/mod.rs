mod build;
mod executor;
mod project;

use tauri::State;

// Re-export executor commands and state
pub use executor::*;
use tracing::{debug, info};

use crate::AppState;
use forvanced_frida::{ApplicationInfo, AttachTarget, DeviceInfo, FridaManager, ProcessInfo, SpawnOptions};

// Re-export project commands
pub use project::*;

// Re-export build commands
pub use build::*;

/// Structured error type for IPC commands
#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum CommandError {
    FridaNotInitialized,
    NoDeviceSelected,
    DeviceNotFound(String),
    SessionError(String),
    ScriptError(String),
    Frida(String),
    Other(String),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::FridaNotInitialized => write!(f, "Frida not initialized"),
            CommandError::NoDeviceSelected => write!(f, "No device selected"),
            CommandError::DeviceNotFound(id) => write!(f, "Device '{}' not found", id),
            CommandError::SessionError(msg) => write!(f, "Session error: {}", msg),
            CommandError::ScriptError(msg) => write!(f, "Script error: {}", msg),
            CommandError::Frida(msg) => write!(f, "Frida error: {}", msg),
            CommandError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl From<forvanced_frida::FridaError> for CommandError {
    fn from(err: forvanced_frida::FridaError) -> Self {
        use forvanced_frida::FridaError;
        match &err {
            FridaError::DeviceNotFound(msg) => CommandError::DeviceNotFound(msg.clone()),
            FridaError::SessionNotFound(msg) => CommandError::SessionError(msg.clone()),
            FridaError::ScriptNotFound(msg) | FridaError::ScriptCreationFailed(msg)
            | FridaError::ScriptLoadFailed(msg) | FridaError::ScriptInjectionFailed(msg)
            | FridaError::ScriptExecutionError(msg) => CommandError::ScriptError(msg.clone()),
            FridaError::NotConnected => CommandError::FridaNotInitialized,
            _ => CommandError::Frida(err.to_string()),
        }
    }
}

/// Helper: get the FridaManager from AppState
async fn get_manager(state: &AppState) -> Result<impl std::ops::Deref<Target = FridaManager> + '_, CommandError> {
    let guard = state.frida_manager.read().await;
    // We need to map the guard to the inner value. Since RwLockReadGuard doesn't allow
    // partial mapping easily, we'll use a different approach.
    if guard.is_none() {
        return Err(CommandError::FridaNotInitialized);
    }
    Ok(ManagerGuard(guard))
}

/// Wrapper to deref through Option in RwLockReadGuard
struct ManagerGuard<'a>(tokio::sync::RwLockReadGuard<'a, Option<FridaManager>>);

impl<'a> std::ops::Deref for ManagerGuard<'a> {
    type Target = FridaManager;
    fn deref(&self) -> &Self::Target {
        // Safe: we checked is_none() before constructing
        self.0.as_ref().unwrap()
    }
}

/// Helper: get the current device ID from AppState
async fn get_device_id(state: &AppState) -> Result<String, CommandError> {
    state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or(CommandError::NoDeviceSelected)
}

/// List all available Frida devices
#[tauri::command]
pub async fn list_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, CommandError> {
    debug!("list_devices called");
    let manager = get_manager(&state).await?;
    manager.enumerate_devices().await.map_err(CommandError::from)
}

/// Select a device to work with
#[tauri::command]
pub async fn select_device(state: State<'_, AppState>, device_id: String) -> Result<(), CommandError> {
    info!("select_device called with: {}", device_id);

    let manager = get_manager(&state).await?;
    let devices = manager.enumerate_devices().await.map_err(CommandError::from)?;
    if !devices.iter().any(|d| d.id == device_id) {
        return Err(CommandError::DeviceNotFound(device_id));
    }

    *state.current_device_id.write().await = Some(device_id);
    Ok(())
}

/// Get current selected device ID
#[tauri::command]
pub async fn get_current_device(state: State<'_, AppState>) -> Result<Option<String>, CommandError> {
    debug!("get_current_device called");
    Ok(state.current_device_id.read().await.clone())
}

/// Add a remote device
#[tauri::command]
pub async fn add_remote_device(
    state: State<'_, AppState>,
    address: String,
) -> Result<DeviceInfo, CommandError> {
    info!("add_remote_device called with address: {}", address);
    let manager = get_manager(&state).await?;
    manager.add_remote_device(&address).await.map_err(CommandError::from)
}

/// Enumerate processes on current device
#[tauri::command]
pub async fn enumerate_processes(state: State<'_, AppState>) -> Result<Vec<ProcessInfo>, CommandError> {
    debug!("enumerate_processes called");
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .enumerate_processes_on_device(&device_id)
        .await
        .map_err(CommandError::from)
}

/// Enumerate applications on current device (for mobile/USB devices)
#[tauri::command]
pub async fn enumerate_applications(state: State<'_, AppState>) -> Result<Vec<ApplicationInfo>, CommandError> {
    debug!("enumerate_applications called");
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .enumerate_applications_on_device(&device_id)
        .await
        .map_err(CommandError::from)
}

/// Attach to a process on current device by PID
#[tauri::command]
pub async fn attach_to_process(state: State<'_, AppState>, pid: u32) -> Result<String, CommandError> {
    info!("attach_to_process called with pid: {}", pid);
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .attach_on_device(&device_id, pid)
        .await
        .map_err(CommandError::from)
}

/// Attach to a process on current device by name
#[tauri::command]
pub async fn attach_by_name(state: State<'_, AppState>, name: String) -> Result<String, CommandError> {
    info!("attach_by_name called with name: {}", name);
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .attach_target(&device_id, AttachTarget::Name(name))
        .await
        .map_err(CommandError::from)
}

/// Attach to an application on current device by bundle identifier
#[tauri::command]
pub async fn attach_by_identifier(state: State<'_, AppState>, identifier: String) -> Result<String, CommandError> {
    info!("attach_by_identifier called with identifier: {}", identifier);
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .attach_target(&device_id, AttachTarget::Identifier(identifier))
        .await
        .map_err(CommandError::from)
}

/// Spawn and attach to an application by identifier
#[tauri::command]
pub async fn spawn_and_attach(
    state: State<'_, AppState>,
    identifier: String,
) -> Result<String, CommandError> {
    info!("spawn_and_attach called with identifier: {}", identifier);
    let device_id = get_device_id(&state).await?;
    let manager = get_manager(&state).await?;
    manager
        .spawn_and_attach(&device_id, &identifier, SpawnOptions::default())
        .await
        .map_err(CommandError::from)
}

/// Detach from a session
#[tauri::command]
pub async fn detach_from_process(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), CommandError> {
    info!("detach_from_process called with session: {}", session_id);
    let manager = get_manager(&state).await?;
    manager.detach(&session_id).await.map_err(CommandError::from)
}

/// Inject a script into a session
#[tauri::command]
pub async fn inject_script(
    state: State<'_, AppState>,
    session_id: String,
    script: String,
) -> Result<String, CommandError> {
    info!(
        "inject_script called for session: {}, script length: {}",
        session_id,
        script.len()
    );
    let manager = get_manager(&state).await?;
    manager
        .inject_script(&session_id, &script)
        .await
        .map_err(CommandError::from)
}

/// Unload a script from a session
#[tauri::command]
pub async fn unload_script(
    state: State<'_, AppState>,
    session_id: String,
    script_id: String,
) -> Result<(), CommandError> {
    info!(
        "unload_script called for session: {}, script: {}",
        session_id, script_id
    );
    let manager = get_manager(&state).await?;
    manager
        .unload_script(&session_id, &script_id)
        .await
        .map_err(CommandError::from)
}

/// Call an RPC method on a Frida script
#[tauri::command]
pub async fn call_rpc(
    state: State<'_, AppState>,
    session_id: String,
    script_id: String,
    method: String,
    args: Vec<serde_json::Value>,
) -> Result<serde_json::Value, CommandError> {
    debug!(
        "call_rpc called: session={}, script={}, method={}",
        session_id, script_id, method
    );
    let manager = get_manager(&state).await?;
    manager
        .call_rpc(&session_id, &script_id, &method, args)
        .await
        .map_err(CommandError::from)
}

/// Register for Frida script messages on a session.
/// Messages will be emitted as "frida-message" events.
#[tauri::command]
pub async fn subscribe_to_messages(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), CommandError> {
    info!("subscribe_to_messages called for session: {}", session_id);

    let manager = get_manager(&state).await?;

    let app_handle = app.clone();
    let session_id_clone = session_id.clone();

    manager
        .on_session_message(
            &session_id,
            std::sync::Arc::new(move |script_id, message| {
                use tauri::Emitter;

                let payload = serde_json::json!({
                    "sessionId": session_id_clone,
                    "scriptId": script_id,
                    "message": message
                });

                if let Err(e) = app_handle.emit("frida-message", payload) {
                    tracing::error!("Failed to emit frida-message event: {}", e);
                }
            }),
        )
        .await
        .map_err(CommandError::from)?;

    Ok(())
}

/// Simulate a Frida message for testing (mock mode only)
#[cfg(feature = "mock")]
#[tauri::command]
pub async fn simulate_frida_message(
    state: State<'_, AppState>,
    session_id: String,
    script_id: String,
    message_type: String,
    payload: serde_json::Value,
) -> Result<(), CommandError> {
    use forvanced_frida::ScriptMessage;

    info!(
        "simulate_frida_message called: session={}, type={}",
        session_id, message_type
    );

    let manager = get_manager(&state).await?;

    let message = match message_type.as_str() {
        "log" => ScriptMessage::Log {
            level: payload.get("level").and_then(|v| v.as_str()).unwrap_or("info").to_string(),
            text: payload.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        },
        "send" => ScriptMessage::Send {
            payload: payload.get("payload").cloned().unwrap_or(serde_json::Value::Null),
        },
        "error" => ScriptMessage::Error {
            description: payload.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            stack: payload.get("stack").and_then(|v| v.as_str()).map(|s| s.to_string()),
            file_name: payload.get("fileName").and_then(|v| v.as_str()).map(|s| s.to_string()),
            line_number: payload.get("lineNumber").and_then(|v| v.as_u64()).map(|n| n as u32),
        },
        _ => return Err(CommandError::Other(format!("Unknown message type: {}", message_type))),
    };

    manager
        .dispatch_message(&session_id, &script_id, message)
        .await
        .map_err(CommandError::from)
}
