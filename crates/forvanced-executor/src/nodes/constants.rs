//! Constant node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::ExecutorResult;
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Constant string node
pub struct ConstStringExecutor;

#[async_trait]
impl NodeExecutor for ConstStringExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value = node.config_str("value").unwrap_or_default();
        Ok(NodeOutput::single("value", Value::String(value)))
    }
}

/// Constant number node
pub struct ConstNumberExecutor;

#[async_trait]
impl NodeExecutor for ConstNumberExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let is_float = node.config_bool("isFloat").unwrap_or(false);

        let value = if is_float {
            let f = node.config_f64("value").unwrap_or(0.0);
            Value::Float(f)
        } else {
            let i = node.config_i64("value").unwrap_or(0);
            Value::Integer(i)
        };

        Ok(NodeOutput::single("value", value))
    }
}

/// Constant boolean node
pub struct ConstBooleanExecutor;

#[async_trait]
impl NodeExecutor for ConstBooleanExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value = node.config_bool("value").unwrap_or(true);
        Ok(NodeOutput::single("value", Value::Boolean(value)))
    }
}

/// Constant pointer/address node
pub struct ConstPointerExecutor;

#[async_trait]
impl NodeExecutor for ConstPointerExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value_str = node.config_str("value").unwrap_or_else(|| "0x0".to_string());
        let value = Value::from_hex(&value_str).unwrap_or(Value::Pointer(0));
        Ok(NodeOutput::single("value", value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::ExecutionContext;
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
            inputs: vec![],
            outputs: vec![Port {
                id: "out".to_string(),
                name: "value".to_string(),
                port_type: PortType::Value,
                value_type: None,
                direction: PortDirection::Output,
            }],
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
    async fn test_const_string() {
        let node = make_node("const_string", serde_json::json!({ "value": "hello" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let result = ConstStringExecutor
            .execute(&node, &HashMap::new(), &mut ctx)
            .await
            .unwrap();
        assert_eq!(
            result.values.get("value").unwrap().as_str(),
            Some("hello")
        );
    }

    #[tokio::test]
    async fn test_const_number_int() {
        let node = make_node(
            "const_number",
            serde_json::json!({ "value": 42, "isFloat": false }),
        );
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let result = ConstNumberExecutor
            .execute(&node, &HashMap::new(), &mut ctx)
            .await
            .unwrap();
        assert_eq!(result.values.get("value").unwrap().as_i64(), Some(42));
    }

    #[tokio::test]
    async fn test_const_pointer() {
        let node = make_node("const_pointer", serde_json::json!({ "value": "0x1234" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let result = ConstPointerExecutor
            .execute(&node, &HashMap::new(), &mut ctx)
            .await
            .unwrap();
        assert_eq!(result.values.get("value").unwrap().as_u64(), Some(0x1234));
    }
}
