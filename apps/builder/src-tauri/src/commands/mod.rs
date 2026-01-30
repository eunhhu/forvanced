mod build;
mod project;

use tauri::State;
use tracing::{debug, info};

use crate::AppState;
use forvanced_frida::{DeviceInfo, ProcessInfo};

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

    manager.enumerate_devices().map_err(|e| e.to_string())
}

/// Select a device to work with
#[tauri::command]
pub async fn select_device(state: State<'_, AppState>, device_id: String) -> Result<(), String> {
    info!("select_device called with: {}", device_id);

    // Verify device exists
    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    let devices = manager.enumerate_devices().map_err(|e| e.to_string())?;
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

    manager.add_remote_device(&address).map_err(|e| e.to_string())
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
        .map_err(|e| e.to_string())
}

/// Attach to a process on current device
#[tauri::command]
pub async fn attach_to_process(state: State<'_, AppState>, pid: u32) -> Result<String, String> {
    info!("attach_to_process called with pid: {}", pid);

    let device_id = state
        .current_device_id
        .read()
        .await
        .clone()
        .ok_or("No device selected")?;

    let guard = state.frida_manager.read().await;
    let manager = guard.as_ref().ok_or("Frida not initialized")?;

    manager
        .attach_on_device(&device_id, pid)
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
