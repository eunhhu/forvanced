//! Array operation node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Create array node
pub struct ArrayCreateExecutor;

#[async_trait]
impl NodeExecutor for ArrayCreateExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let mut array = Vec::new();

        // Collect elements from elem0, elem1, elem2, elem3
        for i in 0..4 {
            let key = format!("elem{}", i);
            if let Some(val) = inputs.get(&key) {
                if !val.is_null() {
                    array.push(val.clone());
                }
            }
        }

        Ok(NodeOutput::single("array", Value::Array(array)))
    }
}

/// Array get element node
pub struct ArrayGetExecutor;

#[async_trait]
impl NodeExecutor for ArrayGetExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));
        let index = inputs
            .get("index")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let arr = array.as_array().ok_or_else(|| {
            ExecutorError::TypeError {
                expected: "array".to_string(),
                actual: array.type_name().to_string(),
            }
        })?;

        let element = if index >= 0 && (index as usize) < arr.len() {
            arr[index as usize].clone()
        } else {
            return Err(ExecutorError::IndexOutOfBounds {
                index,
                length: arr.len(),
            });
        };

        Ok(NodeOutput::single("element", element))
    }
}

/// Array set element node
pub struct ArraySetExecutor;

#[async_trait]
impl NodeExecutor for ArraySetExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let mut array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));
        let index = inputs
            .get("index")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let value = inputs.get("value").cloned().unwrap_or(Value::Null);

        let arr = array.as_array_mut().ok_or_else(|| {
            ExecutorError::TypeError {
                expected: "array".to_string(),
                actual: inputs
                    .get("array")
                    .map(|v| v.type_name())
                    .unwrap_or("null")
                    .to_string(),
            }
        })?;

        if index >= 0 && (index as usize) < arr.len() {
            arr[index as usize] = value;
        } else {
            return Err(ExecutorError::IndexOutOfBounds {
                index,
                length: arr.len(),
            });
        }

        Ok(NodeOutput::single("array", array).with_flow("exec"))
    }
}

/// Array push element node
pub struct ArrayPushExecutor;

#[async_trait]
impl NodeExecutor for ArrayPushExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let mut array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));
        let value = inputs.get("value").cloned().unwrap_or(Value::Null);

        let arr = array.as_array_mut().ok_or_else(|| {
            ExecutorError::TypeError {
                expected: "array".to_string(),
                actual: inputs
                    .get("array")
                    .map(|v| v.type_name())
                    .unwrap_or("null")
                    .to_string(),
            }
        })?;

        arr.push(value);
        let length = arr.len() as i64;

        let mut outputs = HashMap::new();
        outputs.insert("array".to_string(), array);
        outputs.insert("length".to_string(), Value::Integer(length));

        Ok(NodeOutput::values(outputs).with_flow("exec"))
    }
}

/// Array length node
pub struct ArrayLengthExecutor;

#[async_trait]
impl NodeExecutor for ArrayLengthExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));

        let length = match &array {
            Value::Array(arr) => arr.len() as i64,
            Value::String(s) => s.len() as i64,
            _ => 0,
        };

        Ok(NodeOutput::single("length", Value::Integer(length)))
    }
}

/// Array find element node
pub struct ArrayFindExecutor;

#[async_trait]
impl NodeExecutor for ArrayFindExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let array = inputs.get("array").cloned().unwrap_or(Value::Array(vec![]));
        let search_value = inputs.get("value").cloned().unwrap_or(Value::Null);

        let arr = array.as_array().ok_or_else(|| {
            ExecutorError::TypeError {
                expected: "array".to_string(),
                actual: array.type_name().to_string(),
            }
        })?;

        let mut found_index: i64 = -1;
        for (i, item) in arr.iter().enumerate() {
            if values_equal(item, &search_value) {
                found_index = i as i64;
                break;
            }
        }

        let mut outputs = HashMap::new();
        outputs.insert("index".to_string(), Value::Integer(found_index));
        outputs.insert("found".to_string(), Value::Boolean(found_index >= 0));

        Ok(NodeOutput::values(outputs))
    }
}

/// Check if two values are equal
fn values_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Boolean(a), Value::Boolean(b)) => a == b,
        (Value::Integer(a), Value::Integer(b)) => a == b,
        (Value::Float(a), Value::Float(b)) => (a - b).abs() < f64::EPSILON,
        (Value::Integer(a), Value::Float(b)) => ((*a as f64) - b).abs() < f64::EPSILON,
        (Value::Float(a), Value::Integer(b)) => (a - (*b as f64)).abs() < f64::EPSILON,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Pointer(a), Value::Pointer(b)) => a == b,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{Port, PortDirection, PortType, Script};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn make_node(node_type: &str) -> ScriptNode {
        ScriptNode {
            id: "test".to_string(),
            node_type: node_type.to_string(),
            label: "Test".to_string(),
            x: 0.0,
            y: 0.0,
            config: HashMap::new(),
            inputs: vec![],
            outputs: vec![Port {
                id: "out".to_string(),
                name: "result".to_string(),
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
    async fn test_array_create() {
        let node = make_node("array_create");
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("elem0".to_string(), Value::Integer(1));
        inputs.insert("elem1".to_string(), Value::Integer(2));
        inputs.insert("elem2".to_string(), Value::Integer(3));

        let result = ArrayCreateExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        let arr = result.values.get("array").unwrap().as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0].as_i64(), Some(1));
    }

    #[tokio::test]
    async fn test_array_get() {
        let node = make_node("array_get");
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let arr = Value::Array(vec![
            Value::Integer(10),
            Value::Integer(20),
            Value::Integer(30),
        ]);

        let mut inputs = HashMap::new();
        inputs.insert("array".to_string(), arr);
        inputs.insert("index".to_string(), Value::Integer(1));

        let result = ArrayGetExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("element").unwrap().as_i64(), Some(20));
    }

    #[tokio::test]
    async fn test_array_find() {
        let node = make_node("array_find");
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let arr = Value::Array(vec![
            Value::String("apple".to_string()),
            Value::String("banana".to_string()),
            Value::String("cherry".to_string()),
        ]);

        let mut inputs = HashMap::new();
        inputs.insert("array".to_string(), arr);
        inputs.insert("value".to_string(), Value::String("banana".to_string()));

        let result = ArrayFindExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("index").unwrap().as_i64(), Some(1));
        assert_eq!(result.values.get("found").unwrap().as_bool(), Some(true));
    }
}
