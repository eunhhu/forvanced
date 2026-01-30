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

/// Main script executor
pub struct ScriptExecutor {
    /// RPC bridge for target node execution
    rpc_bridge: Arc<RwLock<RpcBridge>>,
    /// UI state shared with frontend
    ui_state: UIState,
}

impl ScriptExecutor {
    /// Create a new script executor
    pub fn new(ui_state: UIState) -> Self {
        Self {
            rpc_bridge: Arc::new(RwLock::new(RpcBridge::new())),
            ui_state,
        }
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
        // Create execution context
        let mut ctx = ExecutionContext::new(script, Arc::clone(&self.ui_state))
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

        // Set up event outputs (value, componentId, etc.)
        let mut event_outputs = HashMap::new();
        event_outputs.insert("value".to_string(), ctx.event_value().clone());
        if let Some(cid) = ctx.event_component_id() {
            event_outputs.insert("componentId".to_string(), Value::String(cid.to_string()));
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

        Ok(ExecutionResult {
            success: true,
            variables: HashMap::new(), // TODO: expose variables
            logs: vec![],
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

    /// Execute a value-only node (no flow inputs, typically constants)
    /// This avoids recursion by not calling collect_inputs for value nodes
    async fn execute_value_node(
        &self,
        ctx: &mut ExecutionContext,
        node: &ScriptNode,
    ) -> ExecutorResult<NodeOutput> {
        // Value nodes don't have inputs to collect (they're constants or getters)
        let inputs = HashMap::new();

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
