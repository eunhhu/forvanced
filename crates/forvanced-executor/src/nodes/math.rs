//! Math and logic node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Math operation node
pub struct MathExecutor;

#[async_trait]
impl NodeExecutor for MathExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let operation = node.config_str("operation").unwrap_or_else(|| "add".to_string());
        let a = inputs.get("a").cloned().unwrap_or(Value::Integer(0));
        let b = inputs.get("b").cloned().unwrap_or(Value::Integer(0));

        // Determine if we should use float math
        let use_float = matches!(&a, Value::Float(_)) || matches!(&b, Value::Float(_));

        let result = if use_float {
            let a_f = a.as_f64().unwrap_or(0.0);
            let b_f = b.as_f64().unwrap_or(0.0);

            match operation.as_str() {
                "add" => Value::Float(a_f + b_f),
                "subtract" | "sub" => Value::Float(a_f - b_f),
                "multiply" | "mul" => Value::Float(a_f * b_f),
                "divide" | "div" => {
                    if b_f == 0.0 {
                        return Err(ExecutorError::DivisionByZero);
                    }
                    Value::Float(a_f / b_f)
                }
                "modulo" | "mod" => {
                    if b_f == 0.0 {
                        return Err(ExecutorError::DivisionByZero);
                    }
                    Value::Float(a_f % b_f)
                }
                "power" | "pow" => Value::Float(a_f.powf(b_f)),
                "min" => Value::Float(a_f.min(b_f)),
                "max" => Value::Float(a_f.max(b_f)),
                "abs" => Value::Float(a_f.abs()),
                "floor" => Value::Float(a_f.floor()),
                "ceil" => Value::Float(a_f.ceil()),
                "round" => Value::Float(a_f.round()),
                "sqrt" => Value::Float(a_f.sqrt()),
                _ => return Err(ExecutorError::InvalidOperation(format!("Unknown math operation: {}", operation))),
            }
        } else {
            let a_i = a.as_i64().unwrap_or(0);
            let b_i = b.as_i64().unwrap_or(0);

            match operation.as_str() {
                "add" => Value::Integer(a_i.wrapping_add(b_i)),
                "subtract" | "sub" => Value::Integer(a_i.wrapping_sub(b_i)),
                "multiply" | "mul" => Value::Integer(a_i.wrapping_mul(b_i)),
                "divide" | "div" => {
                    if b_i == 0 {
                        return Err(ExecutorError::DivisionByZero);
                    }
                    Value::Integer(a_i / b_i)
                }
                "modulo" | "mod" => {
                    if b_i == 0 {
                        return Err(ExecutorError::DivisionByZero);
                    }
                    Value::Integer(a_i % b_i)
                }
                "power" | "pow" => Value::Integer(a_i.pow(b_i as u32)),
                "min" => Value::Integer(a_i.min(b_i)),
                "max" => Value::Integer(a_i.max(b_i)),
                "abs" => Value::Integer(a_i.abs()),
                "floor" | "ceil" | "round" => Value::Integer(a_i), // No-op for integers
                "sqrt" => Value::Integer((a_i as f64).sqrt() as i64),
                // Bitwise operations
                "bit_and" => Value::Integer(a_i & b_i),
                "bit_or" => Value::Integer(a_i | b_i),
                "bit_xor" => Value::Integer(a_i ^ b_i),
                "bit_not" => Value::Integer(!a_i),
                "shift_left" | "shl" => Value::Integer(a_i << b_i),
                "shift_right" | "shr" => Value::Integer(a_i >> b_i),
                _ => return Err(ExecutorError::InvalidOperation(format!("Unknown math operation: {}", operation))),
            }
        };

        Ok(NodeOutput::single("result", result))
    }
}

/// Compare operation node
pub struct CompareExecutor;

#[async_trait]
impl NodeExecutor for CompareExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let operation = node.config_str("operation").unwrap_or_else(|| "equals".to_string());
        let a = inputs.get("a").cloned().unwrap_or(Value::Null);
        let b = inputs.get("b").cloned().unwrap_or(Value::Null);

        let result = match operation.as_str() {
            "equals" | "eq" | "==" => compare_values(&a, &b) == 0,
            "not_equals" | "neq" | "!=" => compare_values(&a, &b) != 0,
            "less_than" | "lt" | "<" => compare_values(&a, &b) < 0,
            "less_than_equals" | "lte" | "<=" => compare_values(&a, &b) <= 0,
            "greater_than" | "gt" | ">" => compare_values(&a, &b) > 0,
            "greater_than_equals" | "gte" | ">=" => compare_values(&a, &b) >= 0,
            _ => {
                return Err(ExecutorError::InvalidOperation(format!(
                    "Unknown compare operation: {}",
                    operation
                )))
            }
        };

        Ok(NodeOutput::single("result", Value::Boolean(result)))
    }
}

/// Compare two values, returns -1, 0, or 1
fn compare_values(a: &Value, b: &Value) -> i8 {
    match (a, b) {
        (Value::Integer(a), Value::Integer(b)) => a.cmp(b) as i8,
        (Value::Float(a), Value::Float(b)) => {
            if a < b { -1 } else if a > b { 1 } else { 0 }
        }
        (Value::Integer(a), Value::Float(b)) => {
            let a = *a as f64;
            if a < *b { -1 } else if a > *b { 1 } else { 0 }
        }
        (Value::Float(a), Value::Integer(b)) => {
            let b = *b as f64;
            if *a < b { -1 } else if *a > b { 1 } else { 0 }
        }
        (Value::String(a), Value::String(b)) => a.cmp(b) as i8,
        (Value::Boolean(a), Value::Boolean(b)) => a.cmp(b) as i8,
        (Value::Pointer(a), Value::Pointer(b)) => a.cmp(b) as i8,
        (Value::Null, Value::Null) => 0,
        (Value::Null, _) => -1,
        (_, Value::Null) => 1,
        // For different types, compare by type name
        _ => a.type_name().cmp(b.type_name()) as i8,
    }
}

/// Logic operation node
pub struct LogicExecutor;

#[async_trait]
impl NodeExecutor for LogicExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let operation = node.config_str("operation").unwrap_or_else(|| "and".to_string());
        let a = inputs.get("a").map(|v| v.is_truthy()).unwrap_or(false);
        let b = inputs.get("b").map(|v| v.is_truthy()).unwrap_or(false);

        let result = match operation.as_str() {
            "and" | "&&" => a && b,
            "or" | "||" => a || b,
            "not" | "!" => !a,
            "xor" | "^" => a ^ b,
            "nand" => !(a && b),
            "nor" => !(a || b),
            _ => {
                return Err(ExecutorError::InvalidOperation(format!(
                    "Unknown logic operation: {}",
                    operation
                )))
            }
        };

        Ok(NodeOutput::single("result", Value::Boolean(result)))
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
    async fn test_math_add() {
        let node = make_node("math", serde_json::json!({ "operation": "add" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("a".to_string(), Value::Integer(10));
        inputs.insert("b".to_string(), Value::Integer(32));

        let result = MathExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("result").unwrap().as_i64(), Some(42));
    }

    #[tokio::test]
    async fn test_math_float_multiply() {
        let node = make_node("math", serde_json::json!({ "operation": "multiply" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("a".to_string(), Value::Float(2.5));
        inputs.insert("b".to_string(), Value::Float(4.0));

        let result = MathExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("result").unwrap().as_f64(), Some(10.0));
    }

    #[tokio::test]
    async fn test_compare() {
        let node = make_node("compare", serde_json::json!({ "operation": "greater_than" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("a".to_string(), Value::Integer(10));
        inputs.insert("b".to_string(), Value::Integer(5));

        let result = CompareExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("result").unwrap().as_bool(), Some(true));
    }

    #[tokio::test]
    async fn test_logic_and() {
        let node = make_node("logic", serde_json::json!({ "operation": "and" }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("a".to_string(), Value::Boolean(true));
        inputs.insert("b".to_string(), Value::Boolean(false));

        let result = LogicExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("result").unwrap().as_bool(), Some(false));
    }
}
