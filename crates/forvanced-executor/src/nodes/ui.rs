//! UI operation node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Get UI component value node
pub struct UIGetValueExecutor;

#[async_trait]
impl NodeExecutor for UIGetValueExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let component_id = node
            .config_str("componentId")
            .ok_or_else(|| ExecutorError::InvalidConfig("componentId required".to_string()))?;

        let value = ctx.get_ui_value(&component_id).await?;

        let mut outputs = HashMap::new();
        outputs.insert("value".to_string(), value);
        outputs.insert("componentId".to_string(), Value::String(component_id));

        Ok(NodeOutput::values(outputs))
    }
}

/// Set UI component value node
pub struct UISetValueExecutor;

#[async_trait]
impl NodeExecutor for UISetValueExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let component_id = node
            .config_str("componentId")
            .ok_or_else(|| ExecutorError::InvalidConfig("componentId required".to_string()))?;

        let value = inputs.get("value").cloned().unwrap_or(Value::Null);

        ctx.set_ui_value(&component_id, value).await?;

        Ok(NodeOutput::flow("exec"))
    }
}

/// Get UI component properties node
pub struct UIGetPropsExecutor;

#[async_trait]
impl NodeExecutor for UIGetPropsExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let _component_id = node
            .config_str("componentId")
            .ok_or_else(|| ExecutorError::InvalidConfig("componentId required".to_string()))?;

        let _prop_name = node
            .config_str("propName")
            .unwrap_or_else(|| "label".to_string());

        // TODO: This needs access to the actual UI component definitions
        // For now, return null - the real implementation will need to
        // query the designer store for component properties

        // In a full implementation, this would:
        // 1. Get the component definition from designerStore
        // 2. Extract the requested property (label, min, max, options, etc.)
        // 3. Return the property value

        Ok(NodeOutput::single("value", Value::Null))
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
    async fn test_ui_get_value() {
        let node = make_node("ui_get_value", serde_json::json!({ "componentId": "toggle-1" }));

        // Pre-populate UI state
        let mut initial_state = HashMap::new();
        initial_state.insert("toggle-1".to_string(), Value::Boolean(true));
        let ui_state = Arc::new(RwLock::new(initial_state));

        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let result = UIGetValueExecutor
            .execute(&node, &HashMap::new(), &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("value").unwrap().as_bool(), Some(true));
        assert_eq!(
            result.values.get("componentId").unwrap().as_str(),
            Some("toggle-1")
        );
    }

    #[tokio::test]
    async fn test_ui_set_value() {
        let node = make_node("ui_set_value", serde_json::json!({ "componentId": "slider-1" }));

        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), Arc::clone(&ui_state));

        let mut inputs = HashMap::new();
        inputs.insert("value".to_string(), Value::Float(75.0));

        UISetValueExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        // Verify the value was set
        let state = ui_state.read().await;
        assert_eq!(state.get("slider-1").unwrap().as_f64(), Some(75.0));
    }
}
