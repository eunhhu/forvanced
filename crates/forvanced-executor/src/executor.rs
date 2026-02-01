//! Main script executor
//!
//! The ScriptExecutor orchestrates visual script execution by:
//! 1. Finding event entry points
//! 2. Executing host nodes directly
//! 3. Delegating target nodes to the RPC bridge
//! 4. Managing flow control and loops

use crate::context::{ExecutionContext, UIState};
use crate::error::{ExecutorError, ExecutorResult};
use crate::nodes::{self, flow, NodeOutput};
use crate::rpc::RpcBridge;
use crate::script::{PortType, Script, ScriptNode};
use crate::value::Value;
use crate::{classify_node, NodeContext};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Result of script execution
#[derive(Debug)]
pub struct ExecutionResult {
    /// Whether execution completed successfully
    pub success: bool,
    /// Final variable values
    pub variables: HashMap<String, Value>,
    /// Execution logs
    pub logs: Vec<String>,
    /// Error message if failed
    pub error: Option<String>,
}

/// Persistent variable state for scripts
pub type VariableState = Arc<RwLock<HashMap<String, Value>>>;

/// Main script executor
pub struct ScriptExecutor {
    /// RPC bridge for target node execution
    rpc_bridge: Arc<RwLock<RpcBridge>>,
    /// UI state shared with frontend
    ui_state: UIState,
    /// Script variable state (persists across executions within same script)
    /// Key is script ID, value is variable name -> value
    script_variables: Arc<RwLock<HashMap<String, HashMap<String, Value>>>>,
}

impl ScriptExecutor {
    /// Create a new script executor
    pub fn new(ui_state: UIState) -> Self {
        Self {
            rpc_bridge: Arc::new(RwLock::new(RpcBridge::new())),
            ui_state,
            script_variables: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get or create variable state for a script
    async fn get_script_variables(&self, script: &Script) -> HashMap<String, Value> {
        let mut states = self.script_variables.write().await;
        if !states.contains_key(&script.id) {
            // Initialize variables from script definitions
            let mut vars = HashMap::new();
            for var_def in &script.variables {
                let default_value = var_def
                    .default_value
                    .as_ref()
                    .map(|v| Value::from(v.clone()))
                    .unwrap_or_else(|| Self::default_value_for_type(&var_def.value_type));
                vars.insert(var_def.name.clone(), default_value);
            }
            states.insert(script.id.clone(), vars);
        }
        states.get(&script.id).cloned().unwrap_or_default()
    }

    /// Save variable state for a script
    async fn save_script_variables(&self, script_id: &str, variables: HashMap<String, Value>) {
        let mut states = self.script_variables.write().await;
        states.insert(script_id.to_string(), variables);
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

    /// Clear variable state for a specific script
    pub async fn clear_script_state(&self, script_id: &str) {
        let mut states = self.script_variables.write().await;
        states.remove(script_id);
    }

    /// Clear all variable states
    pub async fn clear_all_states(&self) {
        let mut states = self.script_variables.write().await;
        states.clear();
    }

    /// Set the session for target node execution
    pub async fn set_session(&self, session_id: String) {
        let mut bridge = self.rpc_bridge.write().await;
        bridge.set_session(session_id);
    }

    /// Clear the current session
    pub async fn clear_session(&self) {
        let mut bridge = self.rpc_bridge.write().await;
        bridge.clear_session();
        bridge.clear_rpc_caller().await;
    }

    /// Set the RPC caller for target node execution
    pub async fn set_rpc_caller(&self, caller: Arc<dyn crate::rpc::RpcCaller>) {
        let bridge = self.rpc_bridge.read().await;
        bridge.set_rpc_caller(caller).await;
    }

    /// Execute a script from an event trigger
    pub async fn execute_from_event(
        &self,
        script: Script,
        event_node_id: &str,
        event_value: Value,
        component_id: Option<String>,
    ) -> ExecutorResult<ExecutionResult> {
        // Load persisted variable state for this script
        let persisted_vars = self.get_script_variables(&script).await;

        // Create execution context with persisted variables
        let mut ctx = ExecutionContext::new_with_variables(
            script,
            Arc::clone(&self.ui_state),
            persisted_vars,
        )
        .with_event(event_value, component_id);

        // Find the event node
        let event_node = ctx.find_node(event_node_id)?.clone();

        // Validate it's an event node
        if !nodes::is_event_node(&event_node.node_type) {
            return Err(ExecutorError::InvalidOperation(format!(
                "Node {} is not an event node",
                event_node_id
            )));
        }

        // Set up event outputs based on node type
        let mut event_outputs = HashMap::new();
        event_outputs.insert("value".to_string(), ctx.event_value().clone());
        if let Some(cid) = ctx.event_component_id() {
            event_outputs.insert("componentId".to_string(), Value::String(cid.to_string()));
        }
        // Handle specific event node outputs
        match event_node.node_type.as_str() {
            "event_interval" => {
                // tick output contains the tick count (event_value)
                event_outputs.insert("tick".to_string(), ctx.event_value().clone());
            }
            "event_hotkey" => {
                // key output contains the key info
                event_outputs.insert("key".to_string(), ctx.event_value().clone());
            }
            "event_attach" | "event_detach" => {
                // session output contains session id
                event_outputs.insert("session".to_string(), ctx.event_value().clone());
            }
            _ => {}
        }
        ctx.set_node_outputs(event_node_id, event_outputs);

        // Find and execute the flow output
        let script = ctx.script().clone();
        if let Some(exec_port) = event_node.output_by_name("exec") {
            for conn in script.connections_from_port(event_node_id, &exec_port.id) {
                let next_node_id = conn.to_node_id.clone();
                if let Err(e) = self.execute_flow(&mut ctx, &next_node_id).await {
                    if e.is_control_flow() {
                        // Control flow signals are expected in some contexts
                        continue;
                    }
                    return Ok(ExecutionResult {
                        success: false,
                        variables: HashMap::new(),
                        logs: vec![],
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        // Save variable state for next execution
        let script_id = script.id.clone();
        let final_variables = ctx.variables().clone();
        self.save_script_variables(&script_id, final_variables.clone()).await;

        Ok(ExecutionResult {
            success: true,
            variables: final_variables,
            logs: ctx.take_logs(),
            error: None,
        })
    }

    /// Execute a flow of nodes starting from a given node
    /// Uses Box::pin to handle recursive async calls
    fn execute_flow<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        node_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = ExecutorResult<()>> + Send + 'a>> {
        Box::pin(async move {
            let node = ctx.find_node(node_id)?.clone();

            // Check for cycles
            ctx.visit(node_id)?;

            // Handle special loop nodes
            if nodes::is_loop_node(&node.node_type) {
                return self.execute_loop(ctx, &node).await;
            }

            // Execute the node
            let output = self.execute_node(ctx, &node).await?;

            // Store outputs
            ctx.set_node_outputs(node_id, output.values.clone());

            // Follow flow output
            if let Some(flow_port_name) = &output.flow_output {
                if let Some(flow_port) = node.output_by_name(flow_port_name) {
                    let script = ctx.script().clone();
                    for conn in script.connections_from_port(node_id, &flow_port.id) {
                        let next_node_id = conn.to_node_id.clone();
                        ctx.unvisit(node_id); // Allow revisiting for loops
                        self.execute_flow(ctx, &next_node_id).await?;
                    }
                }
            }

            ctx.unvisit(node_id);
            Ok(())
        })
    }

    /// Execute a single node
    async fn execute_node(
        &self,
        ctx: &mut ExecutionContext,
        node: &ScriptNode,
    ) -> ExecutorResult<NodeOutput> {
        // Collect inputs
        let inputs = self.collect_inputs(ctx, node).await?;

        // Determine execution context
        let node_context = classify_node(&node.node_type);

        match node_context {
            NodeContext::Host => {
                // Execute using host node executor
                if let Some(executor) = nodes::get_executor(&node.node_type) {
                    executor.execute(node, &inputs, ctx).await
                } else {
                    Err(ExecutorError::InvalidOperation(format!(
                        "No executor for host node type: {}",
                        node.node_type
                    )))
                }
            }
            NodeContext::Target => {
                // Execute via RPC
                let bridge = self.rpc_bridge.read().await;
                let outputs = bridge.execute_target_node(node, &inputs).await?;
                Ok(NodeOutput::values(outputs).with_flow("exec"))
            }
        }
    }

    /// Collect input values for a node
    async fn collect_inputs(
        &self,
        ctx: &mut ExecutionContext,
        node: &ScriptNode,
    ) -> ExecutorResult<HashMap<String, Value>> {
        let mut inputs = HashMap::new();
        let script = ctx.script().clone();

        for input_port in &node.inputs {
            // Skip flow ports
            if input_port.port_type == PortType::Flow {
                continue;
            }

            // Find connection to this input
            if let Some(conn) = script.connection_to_port(&node.id, &input_port.id) {
                // Get the source node's output value
                let from_node_id = &conn.from_node_id;
                let from_port_id = &conn.from_port_id;

                // Check if we have cached output
                if let Some(from_node) = script.find_node(from_node_id) {
                    // Find the port name
                    if let Some(from_port) = from_node.output_by_id(from_port_id) {
                        // Check cache first
                        if let Some(value) = ctx.get_node_output(from_node_id, &from_port.name) {
                            inputs.insert(input_port.name.clone(), value.clone());
                            continue;
                        }

                        // Need to evaluate the source node if it's a value-only node
                        // (nodes with no flow inputs)
                        let from_node = from_node.clone();
                        if from_node.inputs.iter().all(|p| p.port_type != PortType::Flow) {
                            let output = self.execute_value_node(ctx, &from_node).await?;
                            ctx.set_node_outputs(from_node_id, output.values.clone());
                            if let Some(value) = output.values.get(&from_port.name) {
                                inputs.insert(input_port.name.clone(), value.clone());
                            }
                        }
                    }
                }
            }
        }

        Ok(inputs)
    }

    /// Execute a value-only node (no flow inputs)
    /// Recursively collects inputs from connected value nodes
    /// Uses Box::pin to handle recursive async calls
    fn execute_value_node<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        node: &'a ScriptNode,
    ) -> Pin<Box<dyn Future<Output = ExecutorResult<NodeOutput>> + Send + 'a>> {
        Box::pin(async move {
            // Collect inputs from connected value nodes (recursive)
            let inputs = self.collect_value_inputs(ctx, node).await?;

            // Determine execution context
            let node_context = classify_node(&node.node_type);

            match node_context {
                NodeContext::Host => {
                    if let Some(executor) = nodes::get_executor(&node.node_type) {
                        executor.execute(node, &inputs, ctx).await
                    } else {
                        Err(ExecutorError::InvalidOperation(format!(
                            "No executor for value node type: {}",
                            node.node_type
                        )))
                    }
                }
                NodeContext::Target => {
                    // Value-only target nodes are rare, but handle them
                    let bridge = self.rpc_bridge.read().await;
                    let outputs = bridge.execute_target_node(node, &inputs).await?;
                    Ok(NodeOutput::values(outputs))
                }
            }
        })
    }

    /// Collect inputs for a value-only node (recursively evaluates connected value nodes)
    fn collect_value_inputs<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        node: &'a ScriptNode,
    ) -> Pin<Box<dyn Future<Output = ExecutorResult<HashMap<String, Value>>> + Send + 'a>> {
        Box::pin(async move {
            let mut inputs = HashMap::new();
            let script = ctx.script().clone();

            for input_port in &node.inputs {
                // Skip flow ports
                if input_port.port_type == PortType::Flow {
                    continue;
                }

                // Find connection to this input
                if let Some(conn) = script.connection_to_port(&node.id, &input_port.id) {
                    let from_node_id = &conn.from_node_id;
                    let from_port_id = &conn.from_port_id;

                    if let Some(from_node) = script.find_node(from_node_id) {
                        if let Some(from_port) = from_node.output_by_id(from_port_id) {
                            // Check cache first
                            if let Some(value) = ctx.get_node_output(from_node_id, &from_port.name) {
                                inputs.insert(input_port.name.clone(), value.clone());
                                continue;
                            }

                            // Don't try to evaluate event nodes or flow nodes -
                            // their outputs should already be cached from execution flow
                            if nodes::is_event_node(&from_node.node_type) {
                                // Event node outputs not cached means it hasn't been triggered yet
                                // Just skip this input
                                continue;
                            }

                            // Only recursively evaluate pure value nodes (no flow inputs)
                            let has_flow_input = from_node.inputs.iter().any(|p| p.port_type == PortType::Flow);
                            if has_flow_input {
                                // Flow node outputs should be cached from execution
                                // If not cached, the node hasn't been executed yet - skip
                                continue;
                            }

                            // Recursively evaluate the source node (pure value node)
                            let from_node = from_node.clone();
                            let output = self.execute_value_node(ctx, &from_node).await?;
                            ctx.set_node_outputs(from_node_id, output.values.clone());

                            if let Some(value) = output.values.get(&from_port.name) {
                                inputs.insert(input_port.name.clone(), value.clone());
                            }
                        }
                    }
                }
            }

            Ok(inputs)
        })
    }

    /// Execute a loop node (for_each, for_range, loop)
    async fn execute_loop(
        &self,
        ctx: &mut ExecutionContext,
        node: &ScriptNode,
    ) -> ExecutorResult<()> {
        let inputs = self.collect_inputs(ctx, node).await?;
        let script = ctx.script().clone();

        match node.node_type.as_str() {
            "for_each" => {
                let array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));
                let arr = array.as_array().ok_or_else(|| ExecutorError::TypeError {
                    expected: "array".to_string(),
                    actual: array.type_name().to_string(),
                })?;

                let max_iterations = node.config_i64("maxIterations").unwrap_or(10000);
                ctx.enter_loop(max_iterations);

                let mut state = flow::ForEachState::new(arr.clone());

                while let Some((element, index)) = state.current() {
                    ctx.next_iteration()?;

                    // Set loop outputs
                    let mut outputs = HashMap::new();
                    outputs.insert("element".to_string(), element.clone());
                    outputs.insert("index".to_string(), Value::Integer(index as i64));
                    ctx.set_node_outputs(&node.id, outputs);

                    // Execute body
                    if let Some(body_port) = node.output_by_name("body") {
                        for conn in script.connections_from_port(&node.id, &body_port.id) {
                            let next_node_id = conn.to_node_id.clone();
                            match self.execute_flow(ctx, &next_node_id).await {
                                Ok(()) => {}
                                Err(ExecutorError::BreakSignal) => {
                                    ctx.exit_loop();
                                    return self.follow_done_port(ctx, node).await;
                                }
                                Err(ExecutorError::ContinueSignal) => break,
                                Err(e) => {
                                    ctx.exit_loop();
                                    return Err(e);
                                }
                            }
                        }
                    }

                    if !state.next() {
                        break;
                    }
                }

                ctx.exit_loop();
                self.follow_done_port(ctx, node).await
            }

            "for_range" => {
                let start = inputs.get("start").and_then(|v| v.as_i64()).unwrap_or(0);
                let end = inputs.get("end").and_then(|v| v.as_i64()).unwrap_or(10);
                let step = inputs.get("step").and_then(|v| v.as_i64()).unwrap_or(1);

                if step == 0 {
                    return Err(ExecutorError::InvalidOperation(
                        "for_range step cannot be zero".to_string(),
                    ));
                }

                let max_iterations = node.config_i64("maxIterations").unwrap_or(10000);
                ctx.enter_loop(max_iterations);

                let mut state = flow::ForRangeState::new(start, end, step);

                while !state.is_done() {
                    ctx.next_iteration()?;

                    // Set loop outputs
                    let mut outputs = HashMap::new();
                    outputs.insert("index".to_string(), Value::Integer(state.current));
                    ctx.set_node_outputs(&node.id, outputs);

                    // Execute body
                    if let Some(body_port) = node.output_by_name("body") {
                        for conn in script.connections_from_port(&node.id, &body_port.id) {
                            let next_node_id = conn.to_node_id.clone();
                            match self.execute_flow(ctx, &next_node_id).await {
                                Ok(()) => {}
                                Err(ExecutorError::BreakSignal) => {
                                    ctx.exit_loop();
                                    return self.follow_done_port(ctx, node).await;
                                }
                                Err(ExecutorError::ContinueSignal) => break,
                                Err(e) => {
                                    ctx.exit_loop();
                                    return Err(e);
                                }
                            }
                        }
                    }

                    state.next();
                }

                ctx.exit_loop();
                self.follow_done_port(ctx, node).await
            }

            "loop" => {
                let max_iterations = node.config_i64("maxIterations").unwrap_or(1000);
                ctx.enter_loop(max_iterations);

                let mut state = flow::WhileLoopState::new(max_iterations);

                loop {
                    state.next()?;

                    // Re-evaluate condition each iteration
                    let inputs = self.collect_inputs(ctx, node).await?;
                    let condition = inputs
                        .get("condition")
                        .map(|v| v.is_truthy())
                        .unwrap_or(false);

                    if !condition {
                        break;
                    }

                    // Set loop outputs
                    let mut outputs = HashMap::new();
                    outputs.insert("index".to_string(), Value::Integer(state.iteration - 1));
                    ctx.set_node_outputs(&node.id, outputs);

                    // Execute body
                    if let Some(body_port) = node.output_by_name("body") {
                        for conn in script.connections_from_port(&node.id, &body_port.id) {
                            let next_node_id = conn.to_node_id.clone();
                            match self.execute_flow(ctx, &next_node_id).await {
                                Ok(()) => {}
                                Err(ExecutorError::BreakSignal) => {
                                    ctx.exit_loop();
                                    return self.follow_done_port(ctx, node).await;
                                }
                                Err(ExecutorError::ContinueSignal) => break,
                                Err(e) => {
                                    ctx.exit_loop();
                                    return Err(e);
                                }
                            }
                        }
                    }
                }

                ctx.exit_loop();
                self.follow_done_port(ctx, node).await
            }

            _ => Err(ExecutorError::InvalidOperation(format!(
                "Unknown loop type: {}",
                node.node_type
            ))),
        }
    }

    /// Follow the "done" port after loop completion
    async fn follow_done_port(&self, ctx: &mut ExecutionContext, node: &ScriptNode) -> ExecutorResult<()> {
        if let Some(done_port) = node.output_by_name("done") {
            let script = ctx.script().clone();
            for conn in script.connections_from_port(&node.id, &done_port.id) {
                let next_node_id = conn.to_node_id.clone();
                self.execute_flow(ctx, &next_node_id).await?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{Connection, Port, PortDirection, PortType};

    fn make_test_script() -> Script {
        // Create a simple script: event_ui -> log
        let event_node = ScriptNode {
            id: "event-1".to_string(),
            node_type: "event_ui".to_string(),
            label: "UI Event".to_string(),
            x: 0.0,
            y: 0.0,
            config: HashMap::new(),
            inputs: vec![],
            outputs: vec![
                Port {
                    id: "out-exec".to_string(),
                    name: "exec".to_string(),
                    port_type: PortType::Flow,
                    value_type: None,
                    direction: PortDirection::Output,
                },
                Port {
                    id: "out-value".to_string(),
                    name: "value".to_string(),
                    port_type: PortType::Value,
                    value_type: None,
                    direction: PortDirection::Output,
                },
            ],
        };

        let log_node = ScriptNode {
            id: "log-1".to_string(),
            node_type: "log".to_string(),
            label: "Log".to_string(),
            x: 200.0,
            y: 0.0,
            config: HashMap::new(),
            inputs: vec![
                Port {
                    id: "in-exec".to_string(),
                    name: "exec".to_string(),
                    port_type: PortType::Flow,
                    value_type: None,
                    direction: PortDirection::Input,
                },
                Port {
                    id: "in-message".to_string(),
                    name: "message".to_string(),
                    port_type: PortType::Value,
                    value_type: None,
                    direction: PortDirection::Input,
                },
            ],
            outputs: vec![Port {
                id: "out-exec".to_string(),
                name: "exec".to_string(),
                port_type: PortType::Flow,
                value_type: None,
                direction: PortDirection::Output,
            }],
        };

        let const_node = ScriptNode {
            id: "const-1".to_string(),
            node_type: "const_string".to_string(),
            label: "String".to_string(),
            x: 100.0,
            y: 100.0,
            config: {
                let mut c = HashMap::new();
                c.insert("value".to_string(), serde_json::json!("Hello from script!"));
                c
            },
            inputs: vec![],
            outputs: vec![Port {
                id: "out-value".to_string(),
                name: "value".to_string(),
                port_type: PortType::Value,
                value_type: None,
                direction: PortDirection::Output,
            }],
        };

        Script {
            id: "test-script".to_string(),
            name: "Test Script".to_string(),
            description: None,
            variables: vec![],
            nodes: vec![event_node, log_node, const_node],
            connections: vec![
                Connection {
                    id: "conn-1".to_string(),
                    from_node_id: "event-1".to_string(),
                    from_port_id: "out-exec".to_string(),
                    to_node_id: "log-1".to_string(),
                    to_port_id: "in-exec".to_string(),
                },
                Connection {
                    id: "conn-2".to_string(),
                    from_node_id: "const-1".to_string(),
                    from_port_id: "out-value".to_string(),
                    to_node_id: "log-1".to_string(),
                    to_port_id: "in-message".to_string(),
                },
            ],
        }
    }

    #[tokio::test]
    async fn test_simple_script_execution() {
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let executor = ScriptExecutor::new(ui_state);

        let script = make_test_script();
        let result = executor
            .execute_from_event(script, "event-1", Value::Boolean(true), None)
            .await
            .unwrap();

        assert!(result.success);
        assert!(result.error.is_none());
    }
}
