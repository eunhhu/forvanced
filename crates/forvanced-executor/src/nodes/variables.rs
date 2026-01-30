//! Variable node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Declare variable node
pub struct DeclareVariableExecutor;

#[async_trait]
impl NodeExecutor for DeclareVariableExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let var_name = node
            .config_str("variableName")
            .ok_or_else(|| ExecutorError::InvalidConfig("variableName required".to_string()))?;

        // Get initial value from input or config
        let initial_value = inputs
            .get("initialValue")
            .cloned()
            .or_else(|| {
                node.config_str("inlineValue")
                    .filter(|s| !s.is_empty())
                    .map(Value::String)
            })
            .unwrap_or(Value::Null);

        ctx.declare_variable(var_name, initial_value.clone());

        let mut outputs = HashMap::new();
        outputs.insert("value".to_string(), initial_value);

        Ok(NodeOutput::values(outputs).with_flow("exec"))
    }
}

/// Set variable node
pub struct SetVariableExecutor;

#[async_trait]
impl NodeExecutor for SetVariableExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let var_id = node
            .config_str("variableId")
            .ok_or_else(|| ExecutorError::InvalidConfig("variableId required".to_string()))?;

        // Look up variable name from script's variable definitions
        let var_name = ctx
            .script()
            .find_variable(&var_id)
            .map(|v| v.name.clone())
            .unwrap_or(var_id);

        let value = inputs
            .get("value")
            .cloned()
            .unwrap_or(Value::Null);

        ctx.set_variable(&var_name, value.clone())?;

        let mut outputs = HashMap::new();
        outputs.insert("value".to_string(), value);

        Ok(NodeOutput::values(outputs).with_flow("exec"))
    }
}

/// Get variable node
pub struct GetVariableExecutor;

#[async_trait]
impl NodeExecutor for GetVariableExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let var_id = node
            .config_str("variableId")
            .ok_or_else(|| ExecutorError::InvalidConfig("variableId required".to_string()))?;

        // Look up variable name from script's variable definitions
        let var_name = ctx
            .script()
            .find_variable(&var_id)
            .map(|v| v.name.clone())
            .unwrap_or(var_id);

        let value = ctx.get_variable(&var_name)?.clone();

        Ok(NodeOutput::single("value", value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{Port, PortDirection, PortType, Script, ScriptVariable, ValueType};
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
                name: "value".to_string(),
                port_type: PortType::Value,
                value_type: None,
                direction: PortDirection::Input,
            }],
            outputs: vec![Port {
                id: "out".to_string(),
                name: "value".to_string(),
                port_type: PortType::Value,
                value_type: None,
                direction: PortDirection::Output,
            }],
        }
    }

    fn script_with_variable(var_id: &str, var_name: &str) -> Script {
        Script {
            id: "test".to_string(),
            name: "Test".to_string(),
            description: None,
            variables: vec![ScriptVariable {
                id: var_id.to_string(),
                name: var_name.to_string(),
                value_type: ValueType::Any,
                default_value: None,
                description: None,
            }],
            nodes: vec![],
            connections: vec![],
        }
    }

    #[tokio::test]
    async fn test_declare_and_get_variable() {
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(script_with_variable("var-1", "myVar"), ui_state);

        // Declare
        let declare_node = make_node(
            "declare_variable",
            serde_json::json!({ "variableName": "myVar" }),
        );
        let mut inputs = HashMap::new();
        inputs.insert("initialValue".to_string(), Value::Integer(42));

        DeclareVariableExecutor
            .execute(&declare_node, &inputs, &mut ctx)
            .await
            .unwrap();

        // Get
        let get_node = make_node("get_variable", serde_json::json!({ "variableId": "var-1" }));
        let result = GetVariableExecutor
            .execute(&get_node, &HashMap::new(), &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("value").unwrap().as_i64(), Some(42));
    }

    #[tokio::test]
    async fn test_set_variable() {
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(script_with_variable("var-1", "myVar"), ui_state);

        // Declare first
        ctx.declare_variable("myVar".to_string(), Value::Integer(0));

        // Set
        let set_node = make_node("set_variable", serde_json::json!({ "variableId": "var-1" }));
        let mut inputs = HashMap::new();
        inputs.insert("value".to_string(), Value::Integer(100));

        SetVariableExecutor
            .execute(&set_node, &inputs, &mut ctx)
            .await
            .unwrap();

        // Verify
        assert_eq!(ctx.get_variable("myVar").unwrap().as_i64(), Some(100));
    }
}
