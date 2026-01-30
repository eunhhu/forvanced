mod build;
mod project;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, info};

use crate::AppState;
use forvanced_frida::ProcessInfo;

// Re-export project commands
pub use project::*;

// Re-export build commands
pub use build::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct AdapterInfo {
    pub id: String,
    pub name: String,
    pub connected: bool,
}

#[tauri::command]
pub async fn enumerate_processes(state: State<'_, AppState>) -> Result<Vec<ProcessInfo>, String> {
    debug!("enumerate_processes called");

    let registry = state.adapter_registry.read().await;
    let adapter = registry
        .current_adapter()
        .ok_or_else(|| "No adapter selected".to_string())?;

    let adapter_guard = adapter.read().await;
    adapter_guard
        .enumerate_processes()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn attach_to_process(state: State<'_, AppState>, pid: u32) -> Result<String, String> {
    info!("attach_to_process called with pid: {}", pid);

    let registry = state.adapter_registry.read().await;
    let adapter = registry
        .current_adapter()
        .ok_or_else(|| "No adapter selected".to_string())?;

    let adapter_guard = adapter.read().await;
    adapter_guard.attach(pid).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn detach_from_process(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    info!("detach_from_process called with session: {}", session_id);

    let registry = state.adapter_registry.read().await;
    let adapter = registry
        .current_adapter()
        .ok_or_else(|| "No adapter selected".to_string())?;

    let adapter_guard = adapter.read().await;
    adapter_guard
        .detach(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_adapters(state: State<'_, AppState>) -> Result<Vec<AdapterInfo>, String> {
    debug!("list_adapters called");

    let registry = state.adapter_registry.read().await;
    let adapter_ids = registry.list_adapters();

    let mut adapters = Vec::new();
    for id in adapter_ids {
        if let Some(adapter) = registry.get(&id) {
            let adapter_guard = adapter.read().await;
            adapters.push(AdapterInfo {
                id: adapter_guard.adapter_id().to_string(),
                name: adapter_guard.display_name().to_string(),
                connected: adapter_guard.is_connected(),
            });
        }
    }

    Ok(adapters)
}

#[tauri::command]
pub async fn select_adapter(state: State<'_, AppState>, adapter_id: String) -> Result<(), String> {
    info!("select_adapter called with: {}", adapter_id);

    let mut registry = state.adapter_registry.write().await;
    registry
        .select_adapter(&adapter_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_adapter(state: State<'_, AppState>) -> Result<Option<String>, String> {
    debug!("get_current_adapter called");

    let registry = state.adapter_registry.read().await;
    Ok(registry.current_adapter_id().map(|s| s.to_string()))
}

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

    let registry = state.adapter_registry.read().await;
    let adapter = registry
        .current_adapter()
        .ok_or_else(|| "No adapter selected".to_string())?;

    let adapter_guard = adapter.read().await;
    adapter_guard
        .inject_script(&session_id, &script)
        .await
        .map_err(|e| e.to_string())
}

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

    let registry = state.adapter_registry.read().await;
    let adapter = registry
        .current_adapter()
        .ok_or_else(|| "No adapter selected".to_string())?;

    let adapter_guard = adapter.read().await;
    adapter_guard
        .unload_script(&session_id, &script_id)
        .await
        .map_err(|e| e.to_string())
}
