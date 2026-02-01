//! Execution context - holds runtime state during script execution

use crate::error::{ExecutorError, ExecutorResult};
use crate::script::{Script, ScriptNode};
use crate::value::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

/// UI state shared with the frontend
pub type UIState = Arc<RwLock<HashMap<String, Value>>>;

/// Loop state for tracking iteration
#[derive(Debug, Clone)]
pub struct LoopState {
    pub iteration: i64,
    pub max_iterations: i64,
}

/// Function definition (user-defined functions in scripts)
#[derive(Debug, Clone)]
pub struct FunctionDef {
    pub name: String,
    pub node_id: String,
    pub param_names: Vec<String>,
}

/// Execution context for a script run
#[derive(Debug)]
pub struct ExecutionContext {
    /// The script being executed
    pub script: Script,

    /// Current session ID (if attached to a process)
    pub session_id: Option<String>,

    /// Variables declared during execution
    variables: HashMap<String, Value>,

    /// Node output cache (for value nodes that have been evaluated)
    node_outputs: HashMap<String, HashMap<String, Value>>,

    /// Visited nodes (for cycle detection)
    visited: HashSet<String>,

    /// Loop stack (for break/continue)
    loop_stack: Vec<LoopState>,

    /// User-defined functions
    functions: HashMap<String, FunctionDef>,

    /// UI component values (shared with frontend)
    ui_state: UIState,

    /// Event value (the value that triggered this execution)
    event_value: Value,

    /// Event component ID (for UI events)
    event_component_id: Option<String>,

    /// Execution logs (collected from log nodes)
    logs: Vec<String>,
}

impl ExecutionContext {
    /// Create a new execution context
    pub fn new(script: Script, ui_state: UIState) -> Self {
        // Initialize variables from script definitions with default values
        let mut variables = HashMap::new();
        for var_def in &script.variables {
            let default_value = var_def
                .default_value
                .as_ref()
                .map(|v| Value::from(v.clone()))
                .unwrap_or_else(|| Self::default_value_for_type(&var_def.value_type));
            variables.insert(var_def.name.clone(), default_value);
        }

        Self {
            script,
            session_id: None,
            variables,
            node_outputs: HashMap::new(),
            visited: HashSet::new(),
            loop_stack: Vec::new(),
            functions: HashMap::new(),
            ui_state,
            event_value: Value::Null,
            event_component_id: None,
            logs: Vec::new(),
        }
    }

    /// Create a new execution context with pre-loaded variables
    pub fn new_with_variables(
        script: Script,
        ui_state: UIState,
        variables: HashMap<String, Value>,
    ) -> Self {
        Self {
            script,
            session_id: None,
            variables,
            node_outputs: HashMap::new(),
            visited: HashSet::new(),
            loop_stack: Vec::new(),
            functions: HashMap::new(),
            ui_state,
            event_value: Value::Null,
            event_component_id: None,
            logs: Vec::new(),
        }
    }

    /// Get default value for a value type
    fn default_value_for_type(value_type: &crate::script::ValueType) -> Value {
        use crate::script::ValueType;
        match value_type {
            ValueType::Int8 | ValueType::Uint8 |
            ValueType::Int16 | ValueType::Uint16 |
            ValueType::Int32 | ValueType::Uint32 |
            ValueType::Int64 | ValueType::Uint64 => Value::Integer(0),
            ValueType::Float | ValueType::Double => Value::Float(0.0),
            ValueType::Pointer => Value::Pointer(0),
            ValueType::String => Value::String(String::new()),
            ValueType::Boolean => Value::Boolean(false),
            ValueType::Any => Value::Null,
        }
    }

    /// Get all variables (for persistence)
    pub fn take_variables(&mut self) -> HashMap<String, Value> {
        std::mem::take(&mut self.variables)
    }

    /// Get variables reference
    pub fn variables(&self) -> &HashMap<String, Value> {
        &self.variables
    }

    /// Set the session ID
    pub fn with_session(mut self, session_id: String) -> Self {
        self.session_id = Some(session_id);
        self
    }

    /// Set the event trigger data
    pub fn with_event(mut self, value: Value, component_id: Option<String>) -> Self {
        self.event_value = value;
        self.event_component_id = component_id;
        self
    }

    /// Get the event value
    pub fn event_value(&self) -> &Value {
        &self.event_value
    }

    /// Get the event component ID
    pub fn event_component_id(&self) -> Option<&str> {
        self.event_component_id.as_deref()
    }

    // ============================================
    // Variable Management
    // ============================================

    /// Declare a variable with initial value
    pub fn declare_variable(&mut self, name: String, value: Value) {
        self.variables.insert(name, value);
    }

    /// Set a variable value
    pub fn set_variable(&mut self, name: &str, value: Value) -> ExecutorResult<()> {
        if self.variables.contains_key(name) {
            self.variables.insert(name.to_string(), value);
            Ok(())
        } else {
            // Auto-declare if not exists (like JavaScript)
            self.variables.insert(name.to_string(), value);
            Ok(())
        }
    }

    /// Get a variable value
    pub fn get_variable(&self, name: &str) -> ExecutorResult<&Value> {
        self.variables
            .get(name)
            .ok_or_else(|| ExecutorError::VariableNotFound(name.to_string()))
    }

    /// Check if a variable exists
    pub fn has_variable(&self, name: &str) -> bool {
        self.variables.contains_key(name)
    }

    // ============================================
    // Node Output Cache
    // ============================================

    /// Store node output values
    pub fn set_node_outputs(&mut self, node_id: &str, outputs: HashMap<String, Value>) {
        self.node_outputs.insert(node_id.to_string(), outputs);
    }

    /// Get a specific output from a node
    pub fn get_node_output(&self, node_id: &str, port_name: &str) -> Option<&Value> {
        self.node_outputs
            .get(node_id)
            .and_then(|outputs| outputs.get(port_name))
    }

    /// Clear node output cache (for re-execution)
    pub fn clear_outputs(&mut self) {
        self.node_outputs.clear();
    }

    // ============================================
    // Cycle Detection
    // ============================================

    /// Mark a node as visited
    pub fn visit(&mut self, node_id: &str) -> ExecutorResult<()> {
        if self.visited.contains(node_id) {
            Err(ExecutorError::CycleDetected(node_id.to_string()))
        } else {
            self.visited.insert(node_id.to_string());
            Ok(())
        }
    }

    /// Unmark a node (for allowing revisits in loops)
    pub fn unvisit(&mut self, node_id: &str) {
        self.visited.remove(node_id);
    }

    /// Clear all visited markers
    pub fn clear_visited(&mut self) {
        self.visited.clear();
    }

    // ============================================
    // Loop Stack
    // ============================================

    /// Enter a loop
    pub fn enter_loop(&mut self, max_iterations: i64) {
        self.loop_stack.push(LoopState {
            iteration: 0,
            max_iterations,
        });
    }

    /// Exit a loop
    pub fn exit_loop(&mut self) {
        self.loop_stack.pop();
    }

    /// Increment loop iteration, returns true if should continue
    pub fn next_iteration(&mut self) -> ExecutorResult<bool> {
        if let Some(state) = self.loop_stack.last_mut() {
            state.iteration += 1;
            if state.iteration > state.max_iterations {
                Err(ExecutorError::LoopLimitExceeded(
                    state.max_iterations as usize,
                ))
            } else {
                Ok(true)
            }
        } else {
            Ok(false)
        }
    }

    /// Get current loop iteration (0-based)
    pub fn loop_iteration(&self) -> Option<i64> {
        self.loop_stack.last().map(|s| s.iteration)
    }

    /// Check if we're inside a loop
    pub fn in_loop(&self) -> bool {
        !self.loop_stack.is_empty()
    }

    // ============================================
    // Functions
    // ============================================

    /// Register a function definition
    pub fn register_function(&mut self, name: String, node_id: String, param_names: Vec<String>) {
        self.functions.insert(
            name.clone(),
            FunctionDef {
                name,
                node_id,
                param_names,
            },
        );
    }

    /// Get a function definition
    pub fn get_function(&self, name: &str) -> ExecutorResult<&FunctionDef> {
        self.functions
            .get(name)
            .ok_or_else(|| ExecutorError::FunctionNotFound(name.to_string()))
    }

    // ============================================
    // UI State
    // ============================================

    /// Get UI component value
    pub async fn get_ui_value(&self, component_id: &str) -> ExecutorResult<Value> {
        let state = self.ui_state.read().await;
        state
            .get(component_id)
            .cloned()
            .ok_or_else(|| ExecutorError::UIComponentNotFound(component_id.to_string()))
    }

    /// Set UI component value
    pub async fn set_ui_value(&self, component_id: &str, value: Value) -> ExecutorResult<()> {
        let mut state = self.ui_state.write().await;
        state.insert(component_id.to_string(), value);
        Ok(())
    }

    /// Get the UI state reference
    pub fn ui_state(&self) -> &UIState {
        &self.ui_state
    }

    // ============================================
    // Script Access
    // ============================================

    /// Find a node by ID
    pub fn find_node(&self, node_id: &str) -> ExecutorResult<&ScriptNode> {
        self.script
            .find_node(node_id)
            .ok_or_else(|| ExecutorError::NodeNotFound(node_id.to_string()))
    }

    /// Get the script reference
    pub fn script(&self) -> &Script {
        &self.script
    }

    // ============================================
    // Logging
    // ============================================

    /// Add a log message
    pub fn add_log(&mut self, message: String) {
        self.logs.push(message);
    }

    /// Get all collected logs
    pub fn take_logs(&mut self) -> Vec<String> {
        std::mem::take(&mut self.logs)
    }

    /// Get logs without consuming
    pub fn logs(&self) -> &[String] {
        &self.logs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_script() -> Script {
        Script {
            id: "test".to_string(),
            name: "Test".to_string(),
            description: None,
            variables: vec![],
            nodes: vec![],
            connections: vec![],
        }
    }

    #[tokio::test]
    async fn test_variable_operations() {
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        ctx.declare_variable("x".to_string(), Value::Integer(42));
        assert_eq!(ctx.get_variable("x").unwrap().as_i64(), Some(42));

        ctx.set_variable("x", Value::Integer(100)).unwrap();
        assert_eq!(ctx.get_variable("x").unwrap().as_i64(), Some(100));
    }

    #[tokio::test]
    async fn test_loop_operations() {
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        ctx.enter_loop(10);
        assert!(ctx.in_loop());
        assert_eq!(ctx.loop_iteration(), Some(0));

        ctx.next_iteration().unwrap();
        assert_eq!(ctx.loop_iteration(), Some(1));

        ctx.exit_loop();
        assert!(!ctx.in_loop());
    }
}
