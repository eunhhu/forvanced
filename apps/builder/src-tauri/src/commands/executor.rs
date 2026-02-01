//! Script executor Tauri commands
//!
//! Provides IPC interface for executing visual scripts from the frontend.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::State;
use tokio::sync::RwLock;
use tracing::info;

use forvanced_executor::value::Value;
use forvanced_executor::{RpcCaller, ScriptExecutor};
use forvanced_frida::FridaManager;

use crate::AppState;

/// Shared executor state
pub struct ExecutorState {
    /// The script executor instance
    pub executor: Arc<RwLock<ScriptExecutor>>,
    /// UI component values (shared with frontend)
    pub ui_values: Arc<RwLock<HashMap<String, Value>>>,
}

impl ExecutorState {
    pub fn new() -> Self {
        let ui_values = Arc::new(RwLock::new(HashMap::new()));
        let executor = ScriptExecutor::new(Arc::clone(&ui_values));
        Self {
            executor: Arc::new(RwLock::new(executor)),
            ui_values,
        }
    }
}

impl Default for ExecutorState {
    fn default() -> Self {
        Self::new()
    }
}

/// RPC caller that uses FridaManager to call Frida RPC methods
pub struct FridaRpcCaller {
    frida_manager: Arc<RwLock<Option<FridaManager>>>,
    session_id: String,
    script_id: String,
}

impl FridaRpcCaller {
    pub fn new(
        frida_manager: Arc<RwLock<Option<FridaManager>>>,
        session_id: String,
        script_id: String,
    ) -> Self {
        Self {
            frida_manager,
            session_id,
            script_id,
        }
    }
}

#[async_trait]
impl RpcCaller for FridaRpcCaller {
    async fn call(
        &self,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        let guard = self.frida_manager.read().await;
        let manager = guard.as_ref().ok_or("Frida not initialized")?;

        manager
            .call_rpc(&self.session_id, &self.script_id, method, args)
            .await
            .map_err(|e| e.to_string())
    }
}

/// Script data from frontend (matching Script in script.ts)
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptData {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub variables: Vec<VariableData>,
    pub nodes: Vec<NodeData>,
    pub connections: Vec<ConnectionData>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableData {
    pub id: String,
    pub name: String,
    pub value_type: String,
    #[serde(default)]
    pub default_value: serde_json::Value,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeData {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub config: HashMap<String, serde_json::Value>,
    pub inputs: Vec<PortData>,
    pub outputs: Vec<PortData>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortData {
    pub id: String,
    pub name: String,
    pub port_type: String,
    pub value_type: Option<String>,
    pub direction: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionData {
    pub id: String,
    pub from_node_id: String,
    pub from_port_id: String,
    pub to_node_id: String,
    pub to_port_id: String,
}

/// Execution result sent back to frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResultData {
    pub success: bool,
    pub variables: HashMap<String, serde_json::Value>,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

/// Convert frontend script data to executor Script type
fn convert_script(data: ScriptData) -> forvanced_executor::script::Script {
    use forvanced_executor::script::{
        Connection, Port, PortDirection, PortType, Script, ScriptNode, ScriptVariable, ValueType,
    };

    fn parse_value_type(s: &str) -> ValueType {
        match s {
            "int8" => ValueType::Int8,
            "uint8" => ValueType::Uint8,
            "int16" => ValueType::Int16,
            "uint16" => ValueType::Uint16,
            "int32" => ValueType::Int32,
            "uint32" => ValueType::Uint32,
            "int64" => ValueType::Int64,
            "uint64" => ValueType::Uint64,
            "float" => ValueType::Float,
            "double" => ValueType::Double,
            "pointer" => ValueType::Pointer,
            "string" => ValueType::String,
            "boolean" => ValueType::Boolean,
            _ => ValueType::Any,
        }
    }

    let variables = data
        .variables
        .into_iter()
        .map(|v| ScriptVariable {
            id: v.id,
            name: v.name,
            value_type: parse_value_type(&v.value_type),
            default_value: Some(v.default_value),
            description: None,
        })
        .collect();

    let nodes = data
        .nodes
        .into_iter()
        .map(|n| ScriptNode {
            id: n.id,
            node_type: n.node_type,
            label: n.label,
            x: n.x,
            y: n.y,
            config: n.config,
            inputs: n
                .inputs
                .into_iter()
                .map(|p| Port {
                    id: p.id,
                    name: p.name,
                    port_type: match p.port_type.as_str() {
                        "flow" => PortType::Flow,
                        _ => PortType::Value,
                    },
                    value_type: p.value_type.map(|vt| parse_value_type(&vt)),
                    direction: match p.direction.as_str() {
                        "input" => PortDirection::Input,
                        _ => PortDirection::Output,
                    },
                })
                .collect(),
            outputs: n
                .outputs
                .into_iter()
                .map(|p| Port {
                    id: p.id,
                    name: p.name,
                    port_type: match p.port_type.as_str() {
                        "flow" => PortType::Flow,
                        _ => PortType::Value,
                    },
                    value_type: p.value_type.map(|vt| parse_value_type(&vt)),
                    direction: match p.direction.as_str() {
                        "input" => PortDirection::Input,
                        _ => PortDirection::Output,
                    },
                })
                .collect(),
        })
        .collect();

    let connections = data
        .connections
        .into_iter()
        .map(|c| Connection {
            id: c.id,
            from_node_id: c.from_node_id,
            from_port_id: c.from_port_id,
            to_node_id: c.to_node_id,
            to_port_id: c.to_port_id,
        })
        .collect();

    Script {
        id: data.id,
        name: data.name,
        description: data.description,
        variables,
        nodes,
        connections,
    }
}

/// Convert serde_json::Value to executor Value
fn json_to_value(json: serde_json::Value) -> Value {
    Value::from(json)
}

/// Convert executor Value to serde_json::Value
fn value_to_json(value: Value) -> serde_json::Value {
    serde_json::Value::from(value)
}

/// Execute a script from an event trigger
#[tauri::command]
pub async fn execute_script(
    executor_state: State<'_, ExecutorState>,
    script: ScriptData,
    event_node_id: String,
    event_value: serde_json::Value,
    component_id: Option<String>,
) -> Result<ExecutionResultData, String> {
    info!(
        "execute_script called: event_node={}, component={:?}",
        event_node_id, component_id
    );

    // Debug: Print all nodes and their configs
    for node in &script.nodes {
        info!("Node: {} ({}), config: {:?}", node.label, node.node_type, node.config);
    }

    // Debug: Print all connections
    for conn in &script.connections {
        info!("Connection: {} -> {}", conn.from_node_id, conn.to_node_id);
    }

    let converted_script = convert_script(script);
    let converted_value = json_to_value(event_value);

    let executor = executor_state.executor.read().await;
    let result = executor
        .execute_from_event(converted_script, &event_node_id, converted_value, component_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ExecutionResultData {
        success: result.success,
        variables: result
            .variables
            .into_iter()
            .map(|(k, v)| (k, value_to_json(v)))
            .collect(),
        logs: result.logs,
        error: result.error,
    })
}

/// Set session for target node execution
#[tauri::command]
pub async fn set_executor_session(
    app_state: State<'_, AppState>,
    executor_state: State<'_, ExecutorState>,
    session_id: String,
    script_id: String,
) -> Result<(), String> {
    info!(
        "set_executor_session called: session={}, script={}",
        session_id, script_id
    );

    // Create RPC caller that uses FridaManager
    let rpc_caller = Arc::new(FridaRpcCaller::new(
        Arc::clone(&app_state.frida_manager),
        session_id.clone(),
        script_id,
    ));

    // Set session and RPC caller on executor
    let executor = executor_state.executor.read().await;
    executor.set_session(session_id).await;
    executor.set_rpc_caller(rpc_caller).await;

    Ok(())
}

/// Clear executor session
#[tauri::command]
pub async fn clear_executor_session(
    executor_state: State<'_, ExecutorState>,
) -> Result<(), String> {
    info!("clear_executor_session called");

    let executor = executor_state.executor.read().await;
    executor.clear_session().await;
    Ok(())
}

/// Set UI component value (from frontend interaction)
#[tauri::command]
pub async fn set_ui_value(
    executor_state: State<'_, ExecutorState>,
    component_id: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let converted_value = json_to_value(value);
    let mut ui_values = executor_state.ui_values.write().await;
    ui_values.insert(component_id, converted_value);
    Ok(())
}

/// Get UI component value
#[tauri::command]
pub async fn get_ui_value(
    executor_state: State<'_, ExecutorState>,
    component_id: String,
) -> Result<serde_json::Value, String> {
    let ui_values = executor_state.ui_values.read().await;
    let value = ui_values
        .get(&component_id)
        .cloned()
        .unwrap_or(Value::Null);
    Ok(value_to_json(value))
}

/// Get all UI component values
#[tauri::command]
pub async fn get_all_ui_values(
    executor_state: State<'_, ExecutorState>,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let ui_values = executor_state.ui_values.read().await;
    let result = ui_values
        .iter()
        .map(|(k, v)| (k.clone(), value_to_json(v.clone())))
        .collect();
    Ok(result)
}

/// Batch set UI component values
#[tauri::command]
pub async fn set_ui_values_batch(
    executor_state: State<'_, ExecutorState>,
    values: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let mut ui_values = executor_state.ui_values.write().await;
    for (key, value) in values {
        ui_values.insert(key, json_to_value(value));
    }
    Ok(())
}

/// Clear script state (reset variables) for a specific script
#[tauri::command]
pub async fn clear_script_state(
    executor_state: State<'_, ExecutorState>,
    script_id: String,
) -> Result<(), String> {
    info!("clear_script_state called: script_id={}", script_id);
    let executor = executor_state.executor.read().await;
    executor.clear_script_state(&script_id).await;
    Ok(())
}

/// Clear all script states (reset all variables)
#[tauri::command]
pub async fn clear_all_script_states(
    executor_state: State<'_, ExecutorState>,
) -> Result<(), String> {
    info!("clear_all_script_states called");
    let executor = executor_state.executor.read().await;
    executor.clear_all_states().await;
    Ok(())
}
