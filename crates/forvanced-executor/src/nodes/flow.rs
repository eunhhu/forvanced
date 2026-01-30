//! Flow control node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// If conditional node
pub struct IfExecutor;

#[async_trait]
impl NodeExecutor for IfExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let condition = inputs
            .get("condition")
            .map(|v| v.is_truthy())
            .unwrap_or(false);

        let flow_output = if condition { "true" } else { "false" };
        Ok(NodeOutput::flow(flow_output))
    }
}

/// Switch multi-branch node
pub struct SwitchExecutor;

#[async_trait]
impl NodeExecutor for SwitchExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value = inputs.get("value").cloned().unwrap_or(Value::Null);
        let value_str = value.to_string_value();

        // Get case values from config
        let case_values: Vec<String> = node
            .config_get("caseValues")
            .unwrap_or_else(Vec::new);

        // Find matching case
        for (i, case_val) in case_values.iter().enumerate() {
            if *case_val == value_str {
                return Ok(NodeOutput::flow(&format!("case{}", i)));
            }
        }

        // No match, use default
        Ok(NodeOutput::flow("default"))
    }
}

/// Delay node (async wait)
pub struct DelayExecutor;

#[async_trait]
impl NodeExecutor for DelayExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        // Get ms from input or config
        let ms = inputs
            .get("ms")
            .and_then(|v| v.as_i64())
            .or_else(|| node.config_i64("ms"))
            .unwrap_or(100) as u64;

        // Perform async wait
        tokio::time::sleep(tokio::time::Duration::from_millis(ms)).await;

        Ok(NodeOutput::flow("exec"))
    }
}

/// Break from loop
pub struct BreakExecutor;

#[async_trait]
impl NodeExecutor for BreakExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        if !ctx.in_loop() {
            return Err(ExecutorError::InvalidOperation(
                "break outside of loop".to_string(),
            ));
        }
        Err(ExecutorError::BreakSignal)
    }
}

/// Continue to next iteration
pub struct ContinueExecutor;

#[async_trait]
impl NodeExecutor for ContinueExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        if !ctx.in_loop() {
            return Err(ExecutorError::InvalidOperation(
                "continue outside of loop".to_string(),
            ));
        }
        Err(ExecutorError::ContinueSignal)
    }
}

/// ForEach loop state (used by executor, not a standalone NodeExecutor)
#[derive(Debug)]
pub struct ForEachState {
    pub array: Vec<Value>,
    pub index: usize,
}

impl ForEachState {
    pub fn new(array: Vec<Value>) -> Self {
        Self { array, index: 0 }
    }

    pub fn current(&self) -> Option<(&Value, usize)> {
        self.array.get(self.index).map(|v| (v, self.index))
    }

    pub fn next(&mut self) -> bool {
        self.index += 1;
        self.index < self.array.len()
    }
}

/// ForRange loop state
#[derive(Debug)]
pub struct ForRangeState {
    pub current: i64,
    pub end: i64,
    pub step: i64,
}

impl ForRangeState {
    pub fn new(start: i64, end: i64, step: i64) -> Self {
        Self {
            current: start,
            end,
            step,
        }
    }

    pub fn is_done(&self) -> bool {
        if self.step > 0 {
            self.current >= self.end
        } else {
            self.current <= self.end
        }
    }

    pub fn next(&mut self) {
        self.current += self.step;
    }
}

/// While loop state
#[derive(Debug)]
pub struct WhileLoopState {
    pub iteration: i64,
    pub max_iterations: i64,
}

impl WhileLoopState {
    pub fn new(max_iterations: i64) -> Self {
        Self {
            iteration: 0,
            max_iterations,
        }
    }

    pub fn next(&mut self) -> ExecutorResult<()> {
        self.iteration += 1;
        if self.iteration > self.max_iterations {
            Err(ExecutorError::LoopLimitExceeded(self.max_iterations as usize))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{Port, PortDirection, PortType, Script};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn make_node(node_type: &str, config: serde_json::Value) -> ScriptNode {
        ScriptNode {
            id: "test".to_string(),
            node_type: node_type.to_string(),
            label: "Test".to_string(),
            x: 0.0,
            y: 0.0,
            config: config
                .as_object()
                .unwrap()
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            inputs: vec![Port {
                id: "in".to_string(),
                name: "condition".to_string(),
                port_type: PortType::Value,
                value_type: None,
                direction: PortDirection::Input,
            }],
            outputs: vec![
                Port {
                    id: "out-true".to_string(),
                    name: "true".to_string(),
                    port_type: PortType::Flow,
                    value_type: None,
                    direction: PortDirection::Output,
                },
                Port {
                    id: "out-false".to_string(),
                    name: "false".to_string(),
                    port_type: PortType::Flow,
                    value_type: None,
                    direction: PortDirection::Output,
                },
            ],
        }
    }

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
    async fn test_if_true() {
        let node = make_node("if", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("condition".to_string(), Value::Boolean(true));

        let result = IfExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("true".to_string()));
    }

    #[tokio::test]
    async fn test_if_false() {
        let node = make_node("if", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("condition".to_string(), Value::Boolean(false));

        let result = IfExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("false".to_string()));
    }

    #[tokio::test]
    async fn test_switch() {
        let node = ScriptNode {
            id: "test".to_string(),
            node_type: "switch".to_string(),
            label: "Test".to_string(),
            x: 0.0,
            y: 0.0,
            config: serde_json::json!({
                "caseCount": 3,
                "caseValues": ["apple", "banana", "cherry"]
            })
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
            inputs: vec![],
            outputs: vec![],
        };

        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("value".to_string(), Value::String("banana".to_string()));

        let result = SwitchExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("case1".to_string()));
    }

    #[tokio::test]
    async fn test_switch_default() {
        let node = ScriptNode {
            id: "test".to_string(),
            node_type: "switch".to_string(),
            label: "Test".to_string(),
            x: 0.0,
            y: 0.0,
            config: serde_json::json!({
                "caseCount": 2,
                "caseValues": ["a", "b"]
            })
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
            inputs: vec![],
            outputs: vec![],
        };

        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("value".to_string(), Value::String("c".to_string()));

        let result = SwitchExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("default".to_string()));
    }

    #[test]
    fn test_for_each_state() {
        let arr = vec![
            Value::Integer(1),
            Value::Integer(2),
            Value::Integer(3),
        ];
        let mut state = ForEachState::new(arr);

        let (v, i) = state.current().unwrap();
        assert_eq!(v.as_i64(), Some(1));
        assert_eq!(i, 0);

        assert!(state.next());
        let (v, i) = state.current().unwrap();
        assert_eq!(v.as_i64(), Some(2));
        assert_eq!(i, 1);

        assert!(state.next());
        assert!(!state.next()); // No more elements
    }

    #[test]
    fn test_for_range_state() {
        let mut state = ForRangeState::new(0, 5, 2);

        assert!(!state.is_done());
        assert_eq!(state.current, 0);

        state.next();
        assert_eq!(state.current, 2);

        state.next();
        assert_eq!(state.current, 4);

        state.next();
        assert!(state.is_done()); // 6 >= 5
    }
}
