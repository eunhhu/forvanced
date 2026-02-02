mod build;
mod executor;
mod project;

use tauri::State;

// Re-export executor commands and state
pub use executor::*;
use tracing::{debug, info};

use crate::AppState;
use forvanced_frida::{ApplicationInfo, AttachTarget, DeviceInfo, ProcessInfo, SpawnOptions};

// Re-export project commands
pub use project::*;

// Re-export build commands
pub use build::*;

/// List all available Frida devices
#[tauri::command]
pub async fn list_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    debug!("list_devices called");

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager.enumerate_devices().await.map_err(|e| e.to_string())
}

/// Select a device to work with
#[tauri::command]
pub async fn select_device(state: State<'_, AppState>, device_id: String) -> Result<(), String> {
    info!("select_device called with: {}", device_id);

    // Verify device exists
    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    let devices = manager.enumerate_devices().await.map_err(|e| e.to_string())?;
    if !devices.iter().any(|d| d.id == device_id) {
        return Err(format!("Device '{}' not found", device_id));
    }

    *state.current_device_id.write().await = Some(device_id);
    Ok(())
}

/// Get current selected device ID
#[tauri::command]
pub async fn get_current_device(state: State<'_, AppState>) -> Result<Option<String>, String> {
    debug!("get_current_device called");
    Ok(state.current_device_id.read().await.clone())
}

/// Add a remote device
#[tauri::command]
pub async fn add_remote_device(
    state: State<'_, AppState>,
    address: String,
) -> Result<DeviceInfo, String> {
    info!("add_remote_device called with address: {}", address);

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager.add_remote_device(&address).await.map_err(|e| e.to_string())
}

/// Enumerate processes on current device
#[tauri::command]
pub async fn enumerate_processes(state: State<'_, AppState>) -> Result<Vec<ProcessInfo>, String> {
    debug!("enumerate_processes called");

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .enumerate_processes_on_device(&device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Enumerate applications on current device (for mobile/USB devices)
#[tauri::command]
pub async fn enumerate_applications(state: State<'_, AppState>) -> Result<Vec<ApplicationInfo>, String> {
    debug!("enumerate_applications called");

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .enumerate_applications_on_device(&device_id)
        .await
        .map_err(|e| e.to_string())
}

/// Attach to a process on current device by PID
#[tauri::command]
pub async fn attach_to_process(state: State<'_, AppState>, pid: u32) -> Result<String, String> {
    info!("attach_to_process called with pid: {}", pid);
    eprintln!("[CMD DEBUG] attach_to_process called with pid: {}", pid);

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;
    eprintln!("[CMD DEBUG] device_id: {}", device_id);

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;
    eprintln!("[CMD DEBUG] Got frida manager");

    let result = manager
        .attach_on_device(&device_id, pid)
        .await
        .map_err(|e| e.to_string());
    
    eprintln!("[CMD DEBUG] attach_on_device returned: {:?}", result);
    eprintln!("[CMD DEBUG] Dropping guard...");
    drop(guard);
    eprintln!("[CMD DEBUG] Guard dropped, returning result");
    
    result
}

/// Attach to a process on current device by name
#[tauri::command]
pub async fn attach_by_name(state: State<'_, AppState>, name: String) -> Result<String, String> {
    info!("attach_by_name called with name: {}", name);

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .attach_target(&device_id, AttachTarget::Name(name))
        .await
        .map_err(|e| e.to_string())
}

/// Attach to an application on current device by bundle identifier
#[tauri::command]
pub async fn attach_by_identifier(state: State<'_, AppState>, identifier: String) -> Result<String, String> {
    info!("attach_by_identifier called with identifier: {}", identifier);

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .attach_target(&device_id, AttachTarget::Identifier(identifier))
        .await
        .map_err(|e| e.to_string())
}

/// Spawn and attach to an application by identifier
#[tauri::command]
pub async fn spawn_and_attach(
    state: State<'_, AppState>,
    identifier: String,
) -> Result<String, String> {
    info!("spawn_and_attach called with identifier: {}", identifier);

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .spawn_and_attach(&device_id, &identifier, SpawnOptions::default())
        .await
        .map_err(|e| e.to_string())
}

/// Detach from a session
#[tauri::command]
pub async fn detach_from_process(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    info!("detach_from_process called with session: {}", session_id);

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager.detach(&session_id).await.map_err(|e| e.to_string())
}

/// Inject a script into a session
#[tauri::command]
pub async fn inject_script(
    state: State<'_, AppState>,
    session_id: String,
    script: String,
) -> Result<String, String> {
    info!(
        "inject_script called for session: {}, script length: {}",
        session_id,
        script.len()
    );

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .inject_script(&session_id, &script)
        .await
        .map_err(|e| e.to_string())
}

/// Unload a script from a session
#[tauri::command]
pub async fn unload_script(
    state: State<'_, AppState>,
    session_id: String,
    script_id: String,
) -> Result<(), String> {
    info!(
        "unload_script called for session: {}, script: {}",
        session_id, script_id
    );

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .unload_script(&session_id, &script_id)
        .await
        .map_err(|e| e.to_string())
}

/// Call an RPC method on a Frida script
#[tauri::command]
pub async fn call_rpc(
    state: State<'_, AppState>,
    session_id: String,
    script_id: String,
    method: String,
    args: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    debug!(
        "call_rpc called: session={}, script={}, method={}",
        session_id, script_id, method
    );

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .call_rpc(&session_id, &script_id, &method, args)
        .await
        .map_err(|e| e.to_string())
}

/// Register for Frida script messages on a session.
/// Messages will be emitted as "frida-message" events.
#[tauri::command]
pub async fn subscribe_to_messages(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    info!("subscribe_to_messages called for session: {}", session_id);

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    let app_handle = app.clone();
    let session_id_clone = session_id.clone();

    manager
        .on_session_message(
            &session_id,
            std::sync::Arc::new(move |script_id, message| {
                use tauri::Emitter;

                // Emit event to frontend
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
        .map_err(|e| e.to_string())?;

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
) -> Result<(), String> {
    use forvanced_frida::ScriptMessage;

    info!(
        "simulate_frida_message called: session={}, type={}",
        session_id, message_type
    );

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

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
        _ => return Err(format!("Unknown message type: {}", message_type)),
    };

    manager
        .dispatch_message(&session_id, &script_id, message)
        .await
        .map_err(|e| e.to_string())
}
