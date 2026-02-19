//! Tauri commands for runtime

use crate::state::{AppState, ProjectConfig};
use async_trait::async_trait;
use forvanced_core::project::{
    ComponentType, PortDirection as CorePortDirection, PortType as CorePortType,
    UIComponent as ConfigUIComponent, ValueType as CoreValueType, VisualScript as ConfigScript,
};
use forvanced_executor::script::{
    Connection, Port, PortDirection, PortType, Script as ExecutorScript,
    ScriptNode as ExecutorScriptNode, ScriptVariable, ValueType,
};
use forvanced_executor::value::Value;
use forvanced_executor::{rpc::generate_target_script, RpcCaller};
use forvanced_frida::FridaError;
use serde::Serialize;
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
    let devices = state
        .frida_manager
        .enumerate_devices()
        .await
        .map_err(|e: FridaError| e.to_string())?;

    let local_device = devices
        .iter()
        .find(|d| d.device_type == forvanced_frida::FridaDeviceType::Local)
        .ok_or("No local device found")?;

    // List processes
    let processes = state
        .frida_manager
        .enumerate_processes_on_device(&local_device.id)
        .await
        .map_err(|e: FridaError| e.to_string())?;

    // Find target process
    let target = processes
        .iter()
        .find(|p| p.name.to_lowercase().contains(&process_name.to_lowercase()))
        .ok_or(format!("Process '{}' not found", process_name))?;

    // Attach
    let session_id = state
        .frida_manager
        .attach_on_device(&local_device.id, target.pid)
        .await
        .map_err(|e: FridaError| e.to_string())?;

    state.session_id = Some(session_id.clone());

    // Inject the target RPC handler script
    let target_script = generate_target_script();
    let script_id = state
        .frida_manager
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
pub async fn detach_process(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let mut state = state.lock().await;

    // Clear executor session
    state.executor.clear_session().await;

    // Unload script if exists
    if let (Some(session_id), Some(script_id)) = (&state.session_id, &state.script_id) {
        let _ = state
            .frida_manager
            .unload_script(session_id, script_id)
            .await;
    }

    // Detach from process
    if let Some(session_id) = state.session_id.take() {
        state
            .frida_manager
            .detach(&session_id)
            .await
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

    let session_id = state
        .session_id
        .as_ref()
        .ok_or("Not attached to any process")?;

    let script_id = state.script_id.as_ref().ok_or("No script injected")?;

    // Build RPC request for executeTargetNode
    let request = serde_json::json!({
        "id": 1,
        "node_type": action_type,
        "config": params.get("config").cloned().unwrap_or(serde_json::json!({})),
        "inputs": params.get("inputs").cloned().unwrap_or(serde_json::json!({})),
    });

    state
        .frida_manager
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
        component_id,
        event_type,
        value
    );

    let state = state.lock().await;

    // Sync component value
    state
        .sync_component_value(&component_id, value.clone())
        .await;

    // Find scripts that listen to this component's events
    if let Some(config) = &state.config {
        tracing::info!("Found {} scripts in config", config.scripts.len());

        for script in &config.scripts {
            tracing::debug!(
                "Checking script '{}' with {} nodes",
                script.name,
                script.nodes.len()
            );

            // Look for event_ui nodes that match this component
            for node in &script.nodes {
                tracing::debug!(
                    "  Node '{}' type='{}' config={:?}",
                    node.id,
                    node.node_type,
                    node.config
                );

                if node.node_type == "event_ui" {
                    let node_component_id = node.config.get("componentId").and_then(|v| v.as_str());
                    let node_event_type = node.config.get("eventType").and_then(|v| v.as_str());

                    tracing::info!(
                        "  event_ui node: componentId={:?}, eventType={:?} (looking for {} / {})",
                        node_component_id,
                        node_event_type,
                        component_id,
                        event_type
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

                        match state
                            .executor
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
                                    tracing::info!(
                                        "Script '{}' executed successfully",
                                        script.name
                                    );
                                    for log in &result.logs {
                                        tracing::info!("Script log: {}", log);
                                    }
                                    // Emit notifications to frontend
                                    for notification in &result.notifications {
                                        tracing::info!(
                                            "Emitting notification: {} - {}",
                                            notification.title,
                                            notification.message
                                        );
                                        let _ = app.emit(
                                            "notification",
                                            NotificationEvent {
                                                title: notification.title.clone(),
                                                message: notification.message.clone(),
                                                level: notification.level.clone(),
                                            },
                                        );
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
    fn map_value_type(value_type: CoreValueType) -> ValueType {
        match value_type {
            CoreValueType::Int8 => ValueType::Int8,
            CoreValueType::UInt8 => ValueType::Uint8,
            CoreValueType::Int16 => ValueType::Int16,
            CoreValueType::UInt16 => ValueType::Uint16,
            CoreValueType::Int32 => ValueType::Int32,
            CoreValueType::UInt32 => ValueType::Uint32,
            CoreValueType::Int64 => ValueType::Int64,
            CoreValueType::UInt64 => ValueType::Uint64,
            CoreValueType::Float => ValueType::Float,
            CoreValueType::Double => ValueType::Double,
            CoreValueType::Pointer => ValueType::Pointer,
            CoreValueType::String => ValueType::String,
            CoreValueType::Boolean => ValueType::Boolean,
            CoreValueType::Any => ValueType::Any,
        }
    }

    fn map_port_type(port_type: CorePortType) -> PortType {
        match port_type {
            CorePortType::Flow => PortType::Flow,
            CorePortType::Value => PortType::Value,
        }
    }

    fn map_port_direction(direction: CorePortDirection) -> PortDirection {
        match direction {
            CorePortDirection::Input => PortDirection::Input,
            CorePortDirection::Output => PortDirection::Output,
        }
    }

    let variables = script
        .variables
        .iter()
        .map(|v| ScriptVariable {
            id: v.id.clone(),
            name: v.name.clone(),
            value_type: map_value_type(v.value_type),
            default_value: v.default_value.clone(),
            description: v.description.clone(),
        })
        .collect();

    let nodes = script
        .nodes
        .iter()
        .map(|n| ExecutorScriptNode {
            id: n.id.clone(),
            node_type: n.node_type.clone(),
            label: n.label.clone(),
            x: n.x,
            y: n.y,
            config: n
                .config
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            inputs: n
                .inputs
                .iter()
                .map(|p| Port {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    port_type: map_port_type(p.port_type),
                    value_type: p.value_type.map(map_value_type),
                    direction: map_port_direction(p.direction),
                })
                .collect(),
            outputs: n
                .outputs
                .iter()
                .map(|p| Port {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    port_type: map_port_type(p.port_type),
                    value_type: p.value_type.map(map_value_type),
                    direction: map_port_direction(p.direction),
                })
                .collect(),
        })
        .collect();

    let connections = script
        .connections
        .iter()
        .map(|c| Connection {
            id: c.id.clone(),
            from_node_id: c.from_node_id.clone(),
            from_port_id: c.from_port_id.clone(),
            to_node_id: c.to_node_id.clone(),
            to_port_id: c.to_port_id.clone(),
        })
        .collect();

    ExecutorScript {
        id: script.id.clone(),
        name: script.name.clone(),
        description: script.description.clone(),
        variables,
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

    Ok(values
        .get(&component_id)
        .cloned()
        .unwrap_or(serde_json::Value::Null))
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
        version: "0.1.0".to_string(),
        target_process: None,
        auto_attach: false,
        canvas: crate::state::CanvasSettings {
            width: 400,
            height: 500,
            padding: 12,
            gap: 8,
        },
        components: vec![
            ConfigUIComponent {
                id: "label1".to_string(),
                component_type: ComponentType::Label,
                label: "Demo Project".to_string(),
                x: 0.0,
                y: 0.0,
                width: 376.0,
                height: 32.0,
                props: serde_json::json!({ "fontSize": 18, "bold": true, "align": "center" }),
                parent_id: None,
                children: vec![],
                z_index: 1,
                visible: true,
                locked: false,
                collapsed: false,
                width_mode: None,
                height_mode: None,
                bindings: vec![],
            },
            ConfigUIComponent {
                id: "toggle1".to_string(),
                component_type: ComponentType::Toggle,
                label: "God Mode".to_string(),
                x: 0.0,
                y: 0.0,
                width: 376.0,
                height: 36.0,
                props: serde_json::json!({ "defaultValue": false }),
                parent_id: None,
                children: vec![],
                z_index: 2,
                visible: true,
                locked: false,
                collapsed: false,
                width_mode: None,
                height_mode: None,
                bindings: vec![],
            },
            ConfigUIComponent {
                id: "slider1".to_string(),
                component_type: ComponentType::Slider,
                label: "Health".to_string(),
                x: 0.0,
                y: 0.0,
                width: 376.0,
                height: 48.0,
                props: serde_json::json!({ "min": 0, "max": 100, "defaultValue": 100 }),
                parent_id: None,
                children: vec![],
                z_index: 3,
                visible: true,
                locked: false,
                collapsed: false,
                width_mode: None,
                height_mode: None,
                bindings: vec![],
            },
            ConfigUIComponent {
                id: "button1".to_string(),
                component_type: ComponentType::Button,
                label: "Add Money".to_string(),
                x: 0.0,
                y: 0.0,
                width: 376.0,
                height: 36.0,
                props: serde_json::json!({}),
                parent_id: None,
                children: vec![],
                z_index: 4,
                visible: true,
                locked: false,
                collapsed: false,
                width_mode: None,
                height_mode: None,
                bindings: vec![],
            },
        ],
        scripts: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use forvanced_build::Builder;
    use forvanced_core::project::{
        ComponentType as CoreComponentType, PortDirection as CorePortDirection,
        PortType as CorePortType, Project, ScriptConnection, ScriptNode, ScriptPort,
        ValueType as CoreValueType, VisualScript,
    };
    use tempfile::tempdir;

    fn make_value_port(id: &str, name: &str, direction: CorePortDirection) -> ScriptPort {
        ScriptPort {
            id: id.to_string(),
            name: name.to_string(),
            port_type: CorePortType::Value,
            value_type: Some(CoreValueType::String),
            direction,
        }
    }

    fn make_flow_port(id: &str, name: &str, direction: CorePortDirection) -> ScriptPort {
        ScriptPort {
            id: id.to_string(),
            name: name.to_string(),
            port_type: CorePortType::Flow,
            value_type: None,
            direction,
        }
    }

    #[tokio::test]
    async fn generated_project_event_execution_smoke() {
        // 1) Create a minimal sample project with a UI event script:
        // event_ui(button click) -> log(message from const_string)
        let mut project = Project::new("Runtime Smoke Test");
        let mut button = forvanced_core::project::UIComponent::new(
            CoreComponentType::Button,
            "Run Smoke",
            0.0,
            0.0,
        );
        button.id = "button-1".to_string();
        project.ui.components.push(button);

        let event_node = ScriptNode {
            id: "event-1".to_string(),
            node_type: "event_ui".to_string(),
            label: "UI Event".to_string(),
            x: 0.0,
            y: 0.0,
            config: serde_json::Map::from_iter([
                ("componentId".to_string(), serde_json::json!("button-1")),
                ("eventType".to_string(), serde_json::json!("click")),
            ]),
            inputs: vec![],
            outputs: vec![
                make_flow_port("event-exec", "exec", CorePortDirection::Output),
                make_value_port("event-value", "value", CorePortDirection::Output),
            ],
        };

        let const_node = ScriptNode {
            id: "const-1".to_string(),
            node_type: "const_string".to_string(),
            label: "String".to_string(),
            x: 0.0,
            y: 120.0,
            config: serde_json::Map::from_iter([(
                "value".to_string(),
                serde_json::json!("smoke-ok"),
            )]),
            inputs: vec![],
            outputs: vec![make_value_port(
                "const-value",
                "value",
                CorePortDirection::Output,
            )],
        };

        let log_node = ScriptNode {
            id: "log-1".to_string(),
            node_type: "log".to_string(),
            label: "Log".to_string(),
            x: 220.0,
            y: 0.0,
            config: serde_json::Map::new(),
            inputs: vec![
                make_flow_port("log-exec-in", "exec", CorePortDirection::Input),
                make_value_port("log-message-in", "message", CorePortDirection::Input),
            ],
            outputs: vec![make_flow_port(
                "log-exec-out",
                "exec",
                CorePortDirection::Output,
            )],
        };

        project.scripts.push(VisualScript {
            id: "script-1".to_string(),
            name: "Smoke Script".to_string(),
            description: Some("runtime smoke".to_string()),
            variables: vec![],
            nodes: vec![event_node, const_node, log_node],
            connections: vec![
                ScriptConnection {
                    id: "conn-flow".to_string(),
                    from_node_id: "event-1".to_string(),
                    from_port_id: "event-exec".to_string(),
                    to_node_id: "log-1".to_string(),
                    to_port_id: "log-exec-in".to_string(),
                },
                ScriptConnection {
                    id: "conn-value".to_string(),
                    from_node_id: "const-1".to_string(),
                    from_port_id: "const-value".to_string(),
                    to_node_id: "log-1".to_string(),
                    to_port_id: "log-message-in".to_string(),
                },
            ],
        });

        // 2) Generate a runtime project from the sample (builder side)
        let runtime_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("runtime template directory")
            .to_path_buf();
        let builder = Builder::with_runtime_path(runtime_path).expect("builder creation");
        let temp = tempdir().expect("temp dir");
        let project_dir = builder
            .generate_project(&project, temp.path())
            .await
            .expect("project generation");

        // 3) Load generated config through runtime type (build/runtime schema compatibility)
        let config_path = project_dir.join("src-tauri/project_config.json");
        let config_json = tokio::fs::read_to_string(&config_path)
            .await
            .expect("read generated config");
        let config: ProjectConfig =
            serde_json::from_str(&config_json).expect("runtime config deserialization");
        let cfg_script = config
            .scripts
            .iter()
            .find(|s| s.id == "script-1")
            .expect("script exists in generated config");

        // 4) Convert and execute runtime event path
        let executor_script = convert_config_script_to_executor(cfg_script);
        let event_node_id = cfg_script
            .nodes
            .iter()
            .find(|n| n.node_type == "event_ui")
            .map(|n| n.id.clone())
            .expect("event node exists");

        // Ensure conversion preserved critical graph metadata (ports + connections)
        let converted_event = executor_script
            .find_node("event-1")
            .expect("converted event node");
        assert!(converted_event.output_by_name("exec").is_some());
        let converted_log = executor_script
            .find_node("log-1")
            .expect("converted log node");
        assert!(converted_log.input_by_name("message").is_some());
        assert_eq!(executor_script.connections.len(), 2);

        let app_state = AppState::from_config(config);
        let result = app_state
            .executor
            .execute_from_event(
                executor_script,
                &event_node_id,
                Value::Boolean(true),
                Some("button-1".to_string()),
            )
            .await
            .expect("event execution");

        assert!(result.success, "execution failed: {:?}", result.error);
        assert!(
            result.logs.iter().any(|l| l.contains("smoke-ok")),
            "expected log not found: {:?}",
            result.logs
        );
    }
}
