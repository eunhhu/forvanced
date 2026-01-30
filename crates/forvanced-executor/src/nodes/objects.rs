//! Object operation node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Get property from object node
pub struct ObjectGetExecutor;

#[async_trait]
impl NodeExecutor for ObjectGetExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let object = inputs.get("object").cloned().unwrap_or(Value::Null);

        // Get key from input or config
        let key = inputs
            .get("key")
            .and_then(|v| v.as_str())
            .map(String::from)
            .or_else(|| node.config_str("propertyName"))
            .unwrap_or_default();

        let value = match &object {
            Value::Object(obj) => obj.get(&key).cloned().unwrap_or(Value::Null),
            Value::Array(arr) => {
                // Support numeric key for arrays
                if let Ok(idx) = key.parse::<usize>() {
                    arr.get(idx).cloned().unwrap_or(Value::Null)
                } else {
                    Value::Null
                }
            }
            _ => Value::Null,
        };

        Ok(NodeOutput::single("value", value))
    }
}

/// Set property on object node
pub struct ObjectSetExecutor;

#[async_trait]
impl NodeExecutor for ObjectSetExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let mut object = inputs.get("object").cloned().unwrap_or_else(|| {
            Value::Object(HashMap::new())
        });

        let key = inputs
            .get("key")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_default();

        let value = inputs.get("value").cloned().unwrap_or(Value::Null);

        match &mut object {
            Value::Object(obj) => {
                obj.insert(key, value);
            }
            Value::Array(arr) => {
                // Support numeric key for arrays
                if let Ok(idx) = key.parse::<usize>() {
                    if idx < arr.len() {
                        arr[idx] = value;
                    } else {
                        return Err(ExecutorError::IndexOutOfBounds {
                            index: idx as i64,
                            length: arr.len(),
                        });
                    }
                } else {
                    return Err(ExecutorError::TypeError {
                        expected: "numeric index".to_string(),
                        actual: key,
                    });
                }
            }
            _ => {
                // Create new object with the key-value
                let mut obj = HashMap::new();
                obj.insert(key, value);
                object = Value::Object(obj);
            }
        }

        Ok(NodeOutput::single("object", object).with_flow("exec"))
    }
}

/// Get object keys node
pub struct ObjectKeysExecutor;

#[async_trait]
impl NodeExecutor for ObjectKeysExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let object = inputs.get("object").cloned().unwrap_or(Value::Null);

        let keys = match &object {
            Value::Object(obj) => {
                obj.keys()
                    .map(|k| Value::String(k.clone()))
                    .collect()
            }
            Value::Array(arr) => {
                (0..arr.len())
                    .map(|i| Value::Integer(i as i64))
                    .collect()
            }
            _ => vec![],
        };

        Ok(NodeOutput::single("keys", Value::Array(keys)))
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
    async fn test_object_get() {
        let node = make_node("object_get", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut obj = HashMap::new();
        obj.insert("name".to_string(), Value::String("Alice".to_string()));
        obj.insert("age".to_string(), Value::Integer(30));

        let mut inputs = HashMap::new();
        inputs.insert("object".to_string(), Value::Object(obj));
        inputs.insert("key".to_string(), Value::String("name".to_string()));

        let result = ObjectGetExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(
            result.values.get("value").unwrap().as_str(),
            Some("Alice")
        );
    }

    #[tokio::test]
    async fn test_object_set() {
        let node = make_node("object_set", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut obj = HashMap::new();
        obj.insert("x".to_string(), Value::Integer(10));

        let mut inputs = HashMap::new();
        inputs.insert("object".to_string(), Value::Object(obj));
        inputs.insert("key".to_string(), Value::String("y".to_string()));
        inputs.insert("value".to_string(), Value::Integer(20));

        let result = ObjectSetExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        let result_obj = result.values.get("object").unwrap().as_object().unwrap();
        assert_eq!(result_obj.get("x").unwrap().as_i64(), Some(10));
        assert_eq!(result_obj.get("y").unwrap().as_i64(), Some(20));
    }

    #[tokio::test]
    async fn test_object_keys() {
        let node = make_node("object_keys", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut obj = HashMap::new();
        obj.insert("a".to_string(), Value::Integer(1));
        obj.insert("b".to_string(), Value::Integer(2));
        obj.insert("c".to_string(), Value::Integer(3));

        let mut inputs = HashMap::new();
        inputs.insert("object".to_string(), Value::Object(obj));

        let result = ObjectKeysExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        let keys = result.values.get("keys").unwrap().as_array().unwrap();
        assert_eq!(keys.len(), 3);
    }
}
