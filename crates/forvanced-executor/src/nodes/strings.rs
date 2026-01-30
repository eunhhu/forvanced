//! String operation node executors

use super::{NodeExecutor, NodeOutput};
use crate::context::ExecutionContext;
use crate::error::ExecutorResult;
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Format string with placeholders node
pub struct StringFormatExecutor;

#[async_trait]
impl NodeExecutor for StringFormatExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let template = node.config_str("template").unwrap_or_else(|| "".to_string());

        let mut result = template;

        // Replace {0}, {1}, {2}, {3} with arg0, arg1, arg2, arg3
        for i in 0..4 {
            let placeholder = format!("{{{}}}", i);
            let arg_key = format!("arg{}", i);
            if let Some(val) = inputs.get(&arg_key) {
                result = result.replace(&placeholder, &val.to_string_value());
            }
        }

        Ok(NodeOutput::single("result", Value::String(result)))
    }
}

/// Concatenate strings node
pub struct StringConcatExecutor;

#[async_trait]
impl NodeExecutor for StringConcatExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let a = inputs
            .get("a")
            .map(|v| v.to_string_value())
            .unwrap_or_default();
        let b = inputs
            .get("b")
            .map(|v| v.to_string_value())
            .unwrap_or_default();

        Ok(NodeOutput::single("result", Value::String(format!("{}{}", a, b))))
    }
}

/// Convert value to string node
pub struct ToStringExecutor;

#[async_trait]
impl NodeExecutor for ToStringExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value = inputs.get("value").cloned().unwrap_or(Value::Null);
        let format = node.config_str("format").unwrap_or_else(|| "auto".to_string());

        let result = match format.as_str() {
            "hex" => match &value {
                Value::Integer(i) => format!("0x{:x}", i),
                Value::Pointer(p) => format!("0x{:x}", p),
                _ => value.to_string_value(),
            },
            "decimal" => match &value {
                Value::Integer(i) => i.to_string(),
                Value::Float(f) => f.to_string(),
                Value::Pointer(p) => p.to_string(),
                _ => value.to_string_value(),
            },
            "binary" => match &value {
                Value::Integer(i) => format!("0b{:b}", i),
                Value::Pointer(p) => format!("0b{:b}", p),
                _ => value.to_string_value(),
            },
            "json" => serde_json::to_string(&value).unwrap_or_else(|_| value.to_string_value()),
            _ => value.to_string_value(), // "auto"
        };

        Ok(NodeOutput::single("result", Value::String(result)))
    }
}

/// Parse string to integer node
pub struct ParseIntExecutor;

#[async_trait]
impl NodeExecutor for ParseIntExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let string = inputs
            .get("string")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_default();

        let radix = node.config_i64("radix").unwrap_or(10) as u32;

        // Handle hex prefix automatically
        let (clean_str, actual_radix) = if string.starts_with("0x") || string.starts_with("0X") {
            (string[2..].to_string(), 16)
        } else if string.starts_with("0b") || string.starts_with("0B") {
            (string[2..].to_string(), 2)
        } else if string.starts_with("0o") || string.starts_with("0O") {
            (string[2..].to_string(), 8)
        } else {
            (string, radix)
        };

        let (value, success) = match i64::from_str_radix(&clean_str, actual_radix) {
            Ok(v) => (Value::Integer(v), true),
            Err(_) => (Value::Integer(0), false),
        };

        let mut outputs = HashMap::new();
        outputs.insert("value".to_string(), value);
        outputs.insert("success".to_string(), Value::Boolean(success));

        Ok(NodeOutput::values(outputs))
    }
}

/// Parse string to float node
pub struct ParseFloatExecutor;

#[async_trait]
impl NodeExecutor for ParseFloatExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let string = inputs
            .get("string")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_default();

        let (value, success) = match string.parse::<f64>() {
            Ok(v) => (Value::Float(v), true),
            Err(_) => (Value::Float(0.0), false),
        };

        let mut outputs = HashMap::new();
        outputs.insert("value".to_string(), value);
        outputs.insert("success".to_string(), Value::Boolean(success));

        Ok(NodeOutput::values(outputs))
    }
}

/// Convert to pointer node
pub struct ToPointerExecutor;

#[async_trait]
impl NodeExecutor for ToPointerExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let value = inputs.get("value").cloned().unwrap_or(Value::Null);

        let pointer = match &value {
            Value::Pointer(p) => *p,
            Value::Integer(i) => *i as u64,
            Value::Float(f) => *f as u64,
            Value::String(s) => {
                // Parse hex string
                let s = s.trim();
                if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
                    u64::from_str_radix(hex, 16).unwrap_or(0)
                } else {
                    s.parse().unwrap_or(0)
                }
            }
            _ => 0,
        };

        Ok(NodeOutput::single("pointer", Value::Pointer(pointer)))
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
    async fn test_string_format() {
        let node = make_node(
            "string_format",
            serde_json::json!({ "template": "Hello, {0}! You have {1} messages." }),
        );
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("arg0".to_string(), Value::String("World".to_string()));
        inputs.insert("arg1".to_string(), Value::Integer(42));

        let result = StringFormatExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(
            result.values.get("result").unwrap().as_str(),
            Some("Hello, World! You have 42 messages.")
        );
    }

    #[tokio::test]
    async fn test_string_concat() {
        let node = make_node("string_concat", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("a".to_string(), Value::String("Hello, ".to_string()));
        inputs.insert("b".to_string(), Value::String("World!".to_string()));

        let result = StringConcatExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(
            result.values.get("result").unwrap().as_str(),
            Some("Hello, World!")
        );
    }

    #[tokio::test]
    async fn test_parse_int_hex() {
        let node = make_node("parse_int", serde_json::json!({ "radix": 10 }));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("string".to_string(), Value::String("0x1234".to_string()));

        let result = ParseIntExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(result.values.get("value").unwrap().as_i64(), Some(0x1234));
        assert_eq!(result.values.get("success").unwrap().as_bool(), Some(true));
    }

    #[tokio::test]
    async fn test_to_pointer() {
        let node = make_node("to_pointer", serde_json::json!({}));
        let ui_state = Arc::new(RwLock::new(HashMap::new()));
        let mut ctx = ExecutionContext::new(empty_script(), ui_state);

        let mut inputs = HashMap::new();
        inputs.insert("value".to_string(), Value::String("0xDEADBEEF".to_string()));

        let result = ToPointerExecutor
            .execute(&node, &inputs, &mut ctx)
            .await
            .unwrap();

        assert_eq!(
            result.values.get("pointer").unwrap().as_u64(),
            Some(0xDEADBEEF)
        );
    }
}
