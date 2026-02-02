//! Runtime application state

use forvanced_executor::{ScriptExecutor, Value as ExecutorValue};
use forvanced_frida::FridaManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Alias for executor's UI state type
pub type ExecutorUIState = Arc<RwLock<HashMap<String, ExecutorValue>>>;

/// Convert serde_json::Value to ExecutorValue
fn json_to_executor(json: &serde_json::Value) -> ExecutorValue {
    match json {
        serde_json::Value::Null => ExecutorValue::Null,
        serde_json::Value::Bool(b) => ExecutorValue::Boolean(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                ExecutorValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                ExecutorValue::Float(f)
            } else {
                ExecutorValue::Null
            }
        }
        serde_json::Value::String(s) => ExecutorValue::String(s.clone()),
        serde_json::Value::Array(arr) => {
            ExecutorValue::Array(arr.iter().map(json_to_executor).collect())
        }
        serde_json::Value::Object(obj) => {
            ExecutorValue::Object(obj.iter().map(|(k, v)| (k.clone(), json_to_executor(v))).collect())
        }
    }
}

/// Convert ExecutorValue to serde_json::Value
pub fn executor_to_json(value: &ExecutorValue) -> serde_json::Value {
    match value {
        ExecutorValue::Null => serde_json::Value::Null,
        ExecutorValue::Boolean(b) => serde_json::json!(*b),
        ExecutorValue::Integer(i) => serde_json::json!(*i),
        ExecutorValue::Float(f) => serde_json::json!(*f),
        ExecutorValue::String(s) => serde_json::json!(s),
        ExecutorValue::Pointer(p) => serde_json::json!(p),
        ExecutorValue::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(executor_to_json).collect())
        }
        ExecutorValue::Object(obj) => {
            serde_json::Value::Object(obj.iter().map(|(k, v)| (k.clone(), executor_to_json(v))).collect())
        }
    }
}

/// Trainer configuration embedded at build time
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectConfig {
    /// Trainer name
    pub name: String,
    /// Target process name (optional - user can select if not specified)
    pub target_process: Option<String>,
    /// UI components
    pub components: Vec<UIComponent>,
    /// Visual scripts
    pub scripts: Vec<Script>,
    /// Canvas settings
    pub canvas: CanvasSettings,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CanvasSettings {
    pub width: u32,
    pub height: u32,
    pub padding: u32,
    pub gap: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UIComponent {
    pub id: String,
    #[serde(rename = "type")]
    pub component_type: String,
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub props: serde_json::Value,
    pub parent_id: Option<String>,
    pub children: Option<Vec<String>>,
    pub z_index: i32,
    pub visible: Option<bool>,
    pub width_mode: Option<String>,
    pub height_mode: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub nodes: Vec<ScriptNode>,
    pub connections: Vec<ScriptConnection>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScriptNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptConnection {
    pub id: String,
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
}

/// Runtime application state
pub struct AppState {
    /// Frida manager for process interaction
    pub frida_manager: Arc<FridaManager>,
    /// Current session ID (if attached)
    pub session_id: Option<String>,
    /// Current script ID (injected script)
    pub script_id: Option<String>,
    /// Script executor for visual scripts
    pub executor: ScriptExecutor,
    /// Component runtime values (for frontend JSON communication)
    pub component_values: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    /// Executor UI state (synced with component_values)
    pub executor_ui_state: ExecutorUIState,
    /// Trainer configuration (loaded at startup)
    pub config: Option<ProjectConfig>,
}

impl AppState {
    pub fn new() -> Self {
        let frida_manager = FridaManager::new()
            .expect("Failed to initialize FridaManager");

        let component_values: Arc<RwLock<HashMap<String, serde_json::Value>>> =
            Arc::new(RwLock::new(HashMap::new()));
        let executor_ui_state: ExecutorUIState = Arc::new(RwLock::new(HashMap::new()));
        let executor = ScriptExecutor::new(Arc::clone(&executor_ui_state));

        Self {
            frida_manager: Arc::new(frida_manager),
            session_id: None,
            script_id: None,
            executor,
            component_values,
            executor_ui_state,
            config: None,
        }
    }

    /// Create AppState from embedded config (used by generated projects)
    pub fn from_config(config: ProjectConfig) -> Self {
        let frida_manager = FridaManager::new()
            .expect("Failed to initialize FridaManager");

        let component_values: Arc<RwLock<HashMap<String, serde_json::Value>>> =
            Arc::new(RwLock::new(HashMap::new()));
        let executor_ui_state: ExecutorUIState = Arc::new(RwLock::new(HashMap::new()));
        let executor = ScriptExecutor::new(Arc::clone(&executor_ui_state));

        Self {
            frida_manager: Arc::new(frida_manager),
            session_id: None,
            script_id: None,
            executor,
            component_values,
            executor_ui_state,
            config: Some(config),
        }
    }

    /// Sync component value from JSON to executor state
    pub async fn sync_component_value(&self, component_id: &str, value: serde_json::Value) {
        // Update JSON state
        {
            let mut json_values = self.component_values.write().await;
            json_values.insert(component_id.to_string(), value.clone());
        }
        // Update executor state
        {
            let mut executor_values = self.executor_ui_state.write().await;
            executor_values.insert(component_id.to_string(), json_to_executor(&value));
        }
    }

    /// Get component value as JSON
    pub async fn get_component_value_json(&self, component_id: &str) -> Option<serde_json::Value> {
        let values = self.component_values.read().await;
        values.get(component_id).cloned()
    }

    /// Load trainer configuration from embedded data
    pub fn load_config(&mut self, config: ProjectConfig) {
        // Initialize component values with defaults
        let mut values = HashMap::new();
        for comp in &config.components {
            if let Some(default_value) = get_default_value(comp) {
                values.insert(comp.id.clone(), default_value);
            }
        }

        // Block on async write - this is only called once at startup
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            let mut writer = self.component_values.write().await;
            *writer = values;
        });

        self.config = Some(config);
    }
}

impl Default for AppState {
    fn default() -> Self {
        let frida_manager = FridaManager::new()
            .expect("Failed to initialize FridaManager");

        let component_values: Arc<RwLock<HashMap<String, serde_json::Value>>> =
            Arc::new(RwLock::new(HashMap::new()));
        let executor_ui_state: ExecutorUIState = Arc::new(RwLock::new(HashMap::new()));
        let executor = ScriptExecutor::new(Arc::clone(&executor_ui_state));

        Self {
            frida_manager: Arc::new(frida_manager),
            session_id: None,
            script_id: None,
            executor,
            component_values,
            executor_ui_state,
            config: None,
        }
    }
}

/// Get default value for a component based on its type
fn get_default_value(component: &UIComponent) -> Option<serde_json::Value> {
    match component.component_type.as_str() {
        "toggle" => {
            let default = component.props.get("defaultValue")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            Some(serde_json::json!(default))
        }
        "slider" => {
            let default = component.props.get("defaultValue")
                .and_then(|v| v.as_f64())
                .or_else(|| component.props.get("min").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);
            Some(serde_json::json!(default))
        }
        "input" => {
            let default = component.props.get("defaultValue")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            Some(serde_json::json!(default))
        }
        "dropdown" => {
            let options = component.props.get("options")
                .and_then(|v| v.as_array());
            if let Some(opts) = options {
                if let Some(first) = opts.first() {
                    return Some(first.clone());
                }
            }
            Some(serde_json::json!(""))
        }
        "page" => {
            // Default to first tab
            let tabs = component.props.get("tabs")
                .and_then(|v| v.as_array());
            if let Some(tabs) = tabs {
                if let Some(first) = tabs.first() {
                    if let Some(id) = first.get("id").and_then(|v| v.as_str()) {
                        return Some(serde_json::json!(id));
                    }
                }
            }
            None
        }
        _ => None,
    }
}
