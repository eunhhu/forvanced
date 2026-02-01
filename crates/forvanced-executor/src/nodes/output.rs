//! Output node executors (log, notify)

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::ExecutorResult;
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, warn};

/// Log message node
pub struct LogExecutor;

#[async_trait]
impl NodeExecutor for LogExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let message = inputs
            .get("message")
            .map(|v| v.to_string_value())
            .unwrap_or_else(|| "(empty)".to_string());

        // Log to tracing
        info!(target: "forvanced_script", "{}", message);

        // Also print to stdout for debugging
        println!("[Script Log] {}", message);

        // Add to execution context logs (for frontend)
        ctx.add_log(message);

        Ok(NodeOutput::flow("exec"))
    }
}

/// Notify user node
pub struct NotifyExecutor;

#[async_trait]
impl NodeExecutor for NotifyExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let title = inputs
            .get("title")
            .map(|v| v.to_string_value())
            .unwrap_or_else(|| "Notification".to_string());

        let message = inputs
            .get("message")
            .map(|v| v.to_string_value())
            .unwrap_or_default();

        let level = node.config_str("level").unwrap_or_else(|| "info".to_string());

        // Log the notification
        match level.as_str() {
            "warning" | "warn" => {
                warn!(target: "forvanced_script", title = %title, "{}", message);
            }
            "error" => {
                tracing::error!(target: "forvanced_script", title = %title, "{}", message);
            }
            _ => {
                info!(target: "forvanced_script", title = %title, "{}", message);
            }
        }

        // In a real implementation, this would send an event to the frontend
        // to display a toast/notification
        println!("[Notify] [{}] {}: {}", level.to_uppercase(), title, message);

        Ok(NodeOutput::flow("exec"))
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
                name: "exec".to_string(),
                port_type: PortType::Flow,
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
    async fn test_log() {
        let node = make_node("log", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("message".to_string(), Value::String("Test message".to_string()));

        let result = LogExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("exec".to_string()));
    }

    #[tokio::test]
    async fn test_notify() {
        let node = make_node("notify", serde_json::json!({ "level": "warning" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("title".to_string(), Value::String("Warning".to_string()));
        inputs.insert("message".to_string(), Value::String("Something happened".to_string()));

        let result = NotifyExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.flow_output, Some("exec".to_string()));
    }
}
