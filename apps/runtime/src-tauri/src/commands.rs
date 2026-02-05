//! Tauri commands for runtime

use crate::state::{AppState, ProjectConfig, Script as ConfigScript};
use async_trait::async_trait;
use forvanced_executor::script::{
    Connection, Script as ExecutorScript, ScriptNode as ExecutorScriptNode,
};
use forvanced_executor::value::Value;
use forvanced_executor::{rpc::generate_target_script, RpcCaller};
use forvanced_frida::FridaError;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

/// Notification event payload for frontend
#[derive(Debug, Clone, Serialize)]
pub struct NotificationEvent {
    pub title: String,
    pub message: String,
    pub level: String,
}

/// RPC caller implementation that uses FridaManager
struct FridaRpcCaller {
    frida_manager: Arc<forvanced_frida::FridaManager>,
    session_id: String,
    script_id: String,
}

#[async_trait]
impl RpcCaller for FridaRpcCaller {
    async fn call(
        &self,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        self.frida_manager
            .call_rpc(&self.session_id, &self.script_id, method, args)
            .await
            .map_err(|e| e.to_string())
    }
}

/// Get the trainer configuration
/// This is embedded at build time or loaded from a config file
#[tauri::command]
pub async fn get_project_config(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<ProjectConfig, String> {
    let state = state.lock().await;

    // For now, return a demo config
    // In production, this would be embedded at build time
    if let Some(config) = &state.config {
        Ok(config.clone())
    } else {
        // Return demo config for development
        Ok(get_demo_config())
    }
}

/// Attach to a process
#[tauri::command]
pub async fn attach_process(
    state: State<'_, Arc<Mutex<AppState>>>,
    process_name: String,
) -> Result<String, String> {
    let mut state = state.lock().await;

    // List devices and find local
    let devices = state.frida_manager.enumerate_devices()
        .await
        .map_err(|e: FridaError| e.to_string())?;

    let local_device = devices.iter()
        .find(|d| d.device_type == forvanced_frida::FridaDeviceType::Local)
        .ok_or("No local device found")?;

    // List processes
    let processes = state.frida_manager.enumerate_processes_on_device(&local_device.id)
        .await
        .map_err(|e: FridaError| e.to_string())?;

    // Find target process
    let target = processes.iter()
        .find(|p| p.name.to_lowercase().contains(&process_name.to_lowercase()))
        .ok_or(format!("Process '{}' not found", process_name))?;

    // Attach
    let session_id = state.frida_manager.attach_on_device(&local_device.id, target.pid).await
        .map_err(|e: FridaError| e.to_string())?;

    state.session_id = Some(session_id.clone());

    // Inject the target RPC handler script
    let target_script = generate_target_script();
    let script_id = state.frida_manager
        .inject_script(&session_id, &target_script)
        .await
        .map_err(|e: FridaError| e.to_string())?;

    state.script_id = Some(script_id.clone());

    // Set up RPC caller for executor
    let rpc_caller = Arc::new(FridaRpcCaller {
        frida_manager: Arc::clone(&state.frida_manager),
        session_id: session_id.clone(),
        script_id: script_id.clone(),
    });
    state.executor.set_rpc_caller(rpc_caller).await;
    state.executor.set_session(session_id.clone()).await;

    Ok(session_id)
}

/// Detach from current process
#[tauri::command]
pub async fn detach_process(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;

    // Clear executor session
    state.executor.clear_session().await;

    // Unload script if exists
    if let (Some(session_id), Some(script_id)) = (&state.session_id, &state.script_id) {
        let _ = state.frida_manager.unload_script(session_id, script_id).await;
    }

    // Detach from process
    if let Some(session_id) = state.session_id.take() {
        state.frida_manager.detach(&session_id).await
            .map_err(|e: FridaError| e.to_string())?;
    }

    state.script_id = None;

    Ok(())
}

/// Execute an action (direct RPC call to target)
#[tauri::command]
pub async fn execute_action(
    state: State<'_, Arc<Mutex<AppState>>>,
    action_type: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let session_id = state.session_id.as_ref()
        .ok_or("Not attached to any process")?;

    let script_id = state.script_id.as_ref()
        .ok_or("No script injected")?;

    // Build RPC request for executeTargetNode
    let request = serde_json::json!({
        "id": 1,
        "node_type": action_type,
        "config": params.get("config").cloned().unwrap_or(serde_json::json!({})),
        "inputs": params.get("inputs").cloned().unwrap_or(serde_json::json!({})),
    });

    state.frida_manager
        .call_rpc(session_id, script_id, "executeTargetNode", vec![request])
        .await
        .map_err(|e: FridaError| e.to_string())
}

/// Trigger a UI event (e.g., button click, toggle change)
/// This will find and execute any scripts bound to the component
#[tauri::command]
pub async fn trigger_ui_event(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    component_id: String,
    event_type: String,
    value: serde_json::Value,
) -> Result<(), String> {
    tracing::info!(
        "trigger_ui_event called: component_id={}, event_type={}, value={:?}",
        component_id, event_type, value
    );
    
    let state = state.lock().await;

    // Sync component value
    state.sync_component_value(&component_id, value.clone()).await;

    // Find scripts that listen to this component's events
    if let Some(config) = &state.config {
        tracing::info!("Found {} scripts in config", config.scripts.len());
        
        for script in &config.scripts {
            tracing::debug!("Checking script '{}' with {} nodes", script.name, script.nodes.len());
            
            // Look for event_ui nodes that match this component
            for node in &script.nodes {
                tracing::debug!(
                    "  Node '{}' type='{}' config={:?}",
                    node.id, node.node_type, node.config
                );
                
                if node.node_type == "event_ui" {
                    let node_component_id = node.config.get("componentId")
                        .and_then(|v| v.as_str());
                    let node_event_type = node.config.get("eventType")
                        .and_then(|v| v.as_str());
                    
                    tracing::info!(
                        "  event_ui node: componentId={:?}, eventType={:?} (looking for {} / {})",
                        node_component_id, node_event_type, component_id, event_type
                    );

                    if node_component_id == Some(&component_id)
                        && node_event_type == Some(&event_type)
                    {
                        // Convert and execute the script
                        let executor_script = convert_config_script_to_executor(script);
                        let event_value = Value::from(value.clone());

                        tracing::info!(
                            "Executing script '{}' node '{}' for component '{}' event '{}'",
                            script.name,
                            node.id,
                            component_id,
                            event_type
                        );

                        match state.executor
                            .execute_from_event(
                                executor_script,
                                &node.id,
                                event_value,
                                Some(component_id.clone()),
                            )
                            .await
                        {
                            Ok(result) => {
                                if result.success {
                                    tracing::info!("Script '{}' executed successfully", script.name);
                                    for log in &result.logs {
                                        tracing::info!("Script log: {}", log);
                                    }
                                    // Emit notifications to frontend
                                    for notification in &result.notifications {
                                        tracing::info!(
                                            "Emitting notification: {} - {}",
                                            notification.title, notification.message
                                        );
                                        let _ = app.emit("notification", NotificationEvent {
                                            title: notification.title.clone(),
                                            message: notification.message.clone(),
                                            level: notification.level.clone(),
                                        });
                                    }
                                } else {
                                    tracing::error!(
                                        "Script '{}' failed: {:?}",
                                        script.name,
                                        result.error
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::error!("Script execution error: {}", e);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Convert a config Script to executor Script format
fn convert_config_script_to_executor(script: &ConfigScript) -> ExecutorScript {
    // The config script has minimal node data - we need to build full nodes
    // For now, create basic nodes from the config
    let nodes = script
        .nodes
        .iter()
        .map(|n| {
            // Extract config as HashMap
            let config: HashMap<String, serde_json::Value> = n
                .config
                .as_object()
                .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                .unwrap_or_default();

            ExecutorScriptNode {
                id: n.id.clone(),
                node_type: n.node_type.clone(),
                label: n.node_type.clone(), // Use node_type as label since config doesn't have it
                x: 0.0,
                y: 0.0,
                config,
                inputs: vec![], // Will be populated from node registry
                outputs: vec![],
            }
        })
        .collect();

    let connections = script
        .connections
        .iter()
        .map(|c| Connection {
            id: c.id.clone(),
            from_node_id: c.source_node.clone(),
            from_port_id: c.source_port.clone(),
            to_node_id: c.target_node.clone(),
            to_port_id: c.target_port.clone(),
        })
        .collect();

    ExecutorScript {
        id: script.id.clone(),
        name: script.name.clone(),
        description: None,
        variables: vec![],
        nodes,
        connections,
    }
}

/// Get a component's current value
#[tauri::command]
pub async fn get_component_value(
    state: State<'_, Arc<Mutex<AppState>>>,
    component_id: String,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;
    let values = state.component_values.read().await;

    Ok(values.get(&component_id).cloned().unwrap_or(serde_json::Value::Null))
}

/// Set a component's value
#[tauri::command]
pub async fn set_component_value(
    state: State<'_, Arc<Mutex<AppState>>>,
    component_id: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let state = state.lock().await;
    let mut values = state.component_values.write().await;

    values.insert(component_id, value);
    Ok(())
}

/// Demo configuration for development
fn get_demo_config() -> ProjectConfig {
    ProjectConfig {
        name: "Demo Project".to_string(),
        target_process: None,
        canvas: crate::state::CanvasSettings {
            width: 400,
            height: 500,
            padding: 12,
            gap: 8,
        },
        components: vec![
            crate::state::UIComponent {
                id: "label1".to_string(),
                component_type: "label".to_string(),
                label: "Demo Project".to_string(),
                x: 0,
                y: 0,
                width: 376,
                height: 32,
                props: serde_json::json!({ "fontSize": 18, "bold": true, "align": "center" }),
                parent_id: None,
                children: None,
                z_index: 1,
                visible: Some(true),
                width_mode: Some("fill".to_string()),
                height_mode: Some("fixed".to_string()),
            },
            crate::state::UIComponent {
                id: "toggle1".to_string(),
                component_type: "toggle".to_string(),
                label: "God Mode".to_string(),
                x: 0,
                y: 0,
                width: 376,
                height: 36,
                props: serde_json::json!({ "defaultValue": false }),
                parent_id: None,
                children: None,
                z_index: 2,
                visible: Some(true),
                width_mode: Some("fill".to_string()),
                height_mode: Some("fixed".to_string()),
            },
            crate::state::UIComponent {
                id: "slider1".to_string(),
                component_type: "slider".to_string(),
                label: "Health".to_string(),
                x: 0,
                y: 0,
                width: 376,
                height: 48,
                props: serde_json::json!({ "min": 0, "max": 100, "defaultValue": 100 }),
                parent_id: None,
                children: None,
                z_index: 3,
                visible: Some(true),
                width_mode: Some("fill".to_string()),
                height_mode: Some("fixed".to_string()),
            },
            crate::state::UIComponent {
                id: "button1".to_string(),
                component_type: "button".to_string(),
                label: "Add Money".to_string(),
                x: 0,
                y: 0,
                width: 376,
                height: 36,
                props: serde_json::json!({}),
                parent_id: None,
                children: None,
                z_index: 4,
                visible: Some(true),
                width_mode: Some("fill".to_string()),
                height_mode: Some("fixed".to_string()),
            },
        ],
        scripts: vec![],
    }
}
