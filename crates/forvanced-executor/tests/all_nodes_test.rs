//! Comprehensive tests for all node types
//!
//! This test file verifies that all executor node types work correctly.

use forvanced_executor::script::{Connection, Port, PortDirection, PortType, Script, ScriptNode, ScriptVariable, ValueType};
use forvanced_executor::value::Value;
use forvanced_executor::ScriptExecutor;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// Helper functions

fn make_port(id: &str, name: &str, port_type: PortType, direction: PortDirection) -> Port {
    Port {
        id: id.to_string(),
        name: name.to_string(),
        port_type,
        value_type: None,
        direction,
    }
}

fn make_value_port(id: &str, name: &str, direction: PortDirection) -> Port {
    make_port(id, name, PortType::Value, direction)
}

fn make_flow_port(id: &str, name: &str, direction: PortDirection) -> Port {
    make_port(id, name, PortType::Flow, direction)
}

fn make_node(id: &str, node_type: &str, config: serde_json::Value) -> ScriptNode {
    ScriptNode {
        id: id.to_string(),
        node_type: node_type.to_string(),
        label: id.to_string(),
        x: 0.0,
        y: 0.0,
        config: config.as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        inputs: vec![],
        outputs: vec![],
    }
}

fn make_connection(id: &str, from_node: &str, from_port: &str, to_node: &str, to_port: &str) -> Connection {
    Connection {
        id: id.to_string(),
        from_node_id: from_node.to_string(),
        from_port_id: from_port.to_string(),
        to_node_id: to_node.to_string(),
        to_port_id: to_port.to_string(),
    }
}

fn make_script(nodes: Vec<ScriptNode>, connections: Vec<Connection>) -> Script {
    Script {
        id: "test-script".to_string(),
        name: "Test Script".to_string(),
        description: None,
        variables: vec![],
        nodes,
        connections,
    }
}

async fn execute_event(script: Script, event_node_id: &str, event_value: Value) -> forvanced_executor::executor::ExecutionResult {
    let ui_state = Arc::new(RwLock::new(HashMap::new()));
    let executor = ScriptExecutor::new(ui_state);
    executor.execute_from_event(script, event_node_id, event_value, None).await.unwrap()
}

// ============================================
// Constant Nodes Tests
// ============================================

#[tokio::test]
async fn test_const_string() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![
            make_flow_port("exec", "exec", PortDirection::Output),
        ];
        n
    };

    let const_str = {
        let mut n = make_node("const", "const_string", serde_json::json!({ "value": "Hello Test" }));
        n.outputs = vec![
            make_value_port("value", "value", PortDirection::Output),
        ];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![
            make_flow_port("out", "exec", PortDirection::Output),
        ];
        n
    };

    let script = make_script(
        vec![event, const_str, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "const", "value", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["Hello Test"]);
}

#[tokio::test]
async fn test_const_number() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![
            make_flow_port("exec", "exec", PortDirection::Output),
        ];
        n
    };

    let const_num = {
        let mut n = make_node("const", "const_number", serde_json::json!({ "value": 42.5, "isFloat": true }));
        n.outputs = vec![
            make_value_port("value", "value", PortDirection::Output),
        ];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![
            make_flow_port("out", "exec", PortDirection::Output),
        ];
        n
    };

    let script = make_script(
        vec![event, const_num, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "const", "value", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["42.5"]);
}

#[tokio::test]
async fn test_const_boolean() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_bool = {
        let mut n = make_node("const", "const_boolean", serde_json::json!({ "value": true }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, const_bool, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "const", "value", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["true"]);
}

// ============================================
// Math Nodes Tests
// ============================================

#[tokio::test]
async fn test_math_add() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_a = {
        let mut n = make_node("a", "const_number", serde_json::json!({ "value": 10 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let const_b = {
        let mut n = make_node("b", "const_number", serde_json::json!({ "value": 5 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let math = {
        let mut n = make_node("math", "math", serde_json::json!({ "operation": "add" }));
        n.inputs = vec![
            make_value_port("a", "a", PortDirection::Input),
            make_value_port("b", "b", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, const_a, const_b, math, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "a", "value", "math", "a"),
            make_connection("c3", "b", "value", "math", "b"),
            make_connection("c4", "math", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["15"]); // 10 + 5 = 15
}

#[tokio::test]
async fn test_math_multiply() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_a = {
        let mut n = make_node("a", "const_number", serde_json::json!({ "value": 7 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let const_b = {
        let mut n = make_node("b", "const_number", serde_json::json!({ "value": 6 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let math = {
        let mut n = make_node("math", "math", serde_json::json!({ "operation": "multiply" }));
        n.inputs = vec![
            make_value_port("a", "a", PortDirection::Input),
            make_value_port("b", "b", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, const_a, const_b, math, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "a", "value", "math", "a"),
            make_connection("c3", "b", "value", "math", "b"),
            make_connection("c4", "math", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["42"]); // 7 * 6 = 42
}

// ============================================
// String Nodes Tests
// ============================================

#[tokio::test]
async fn test_string_format() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let name = {
        let mut n = make_node("name", "const_string", serde_json::json!({ "value": "World" }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let count = {
        let mut n = make_node("count", "const_number", serde_json::json!({ "value": 42 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let format = {
        let mut n = make_node("format", "string_format", serde_json::json!({
            "template": "Hello, {0}! You have {1} messages."
        }));
        n.inputs = vec![
            make_value_port("arg0", "arg0", PortDirection::Input),
            make_value_port("arg1", "arg1", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, name, count, format, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "name", "value", "format", "arg0"),
            make_connection("c3", "count", "value", "format", "arg1"),
            make_connection("c4", "format", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["Hello, World! You have 42 messages."]);
}

#[tokio::test]
async fn test_string_concat() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let str_a = {
        let mut n = make_node("a", "const_string", serde_json::json!({ "value": "Hello, " }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let str_b = {
        let mut n = make_node("b", "const_string", serde_json::json!({ "value": "World!" }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let concat = {
        let mut n = make_node("concat", "string_concat", serde_json::json!({}));
        n.inputs = vec![
            make_value_port("a", "a", PortDirection::Input),
            make_value_port("b", "b", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, str_a, str_b, concat, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "a", "value", "concat", "a"),
            make_connection("c3", "b", "value", "concat", "b"),
            make_connection("c4", "concat", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["Hello, World!"]);
}

// ============================================
// Variable Nodes Tests
// ============================================

#[tokio::test]
async fn test_variable_set_get() {
    let var_id = "var-1";
    let var_name = "counter";

    let mut script = Script {
        id: "test".to_string(),
        name: "Test".to_string(),
        description: None,
        variables: vec![ScriptVariable {
            id: var_id.to_string(),
            name: var_name.to_string(),
            value_type: ValueType::Int32,
            default_value: Some(serde_json::json!(0)),
            description: None,
        }],
        nodes: vec![],
        connections: vec![],
    };

    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_val = {
        let mut n = make_node("val", "const_number", serde_json::json!({ "value": 100 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let set_var = {
        let mut n = make_node("set", "set_variable", serde_json::json!({ "variableId": var_id }));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("value", "value", PortDirection::Input),
        ];
        n.outputs = vec![
            make_flow_port("out", "exec", PortDirection::Output),
            make_value_port("val", "value", PortDirection::Output),
        ];
        n
    };

    let get_var = {
        let mut n = make_node("get", "get_variable", serde_json::json!({ "variableId": var_id }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    script.nodes = vec![event, const_val, set_var, get_var, log];
    script.connections = vec![
        make_connection("c1", "event", "exec", "set", "exec"),
        make_connection("c2", "val", "value", "set", "value"),
        make_connection("c3", "set", "out", "log", "exec"),
        make_connection("c4", "get", "value", "log", "message"),
    ];

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["100"]);
}

// ============================================
// Flow Control Tests
// ============================================

#[tokio::test]
async fn test_if_true_branch() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let condition = {
        let mut n = make_node("cond", "const_boolean", serde_json::json!({ "value": true }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let if_node = {
        let mut n = make_node("if", "if", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("condition", "condition", PortDirection::Input),
        ];
        n.outputs = vec![
            make_flow_port("true", "true", PortDirection::Output),
            make_flow_port("false", "false", PortDirection::Output),
        ];
        n
    };

    let log_then = {
        let mut n = make_node("log_then", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let msg_then = {
        let mut n = make_node("msg_then", "const_string", serde_json::json!({ "value": "TRUE" }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, condition, if_node, log_then, msg_then],
        vec![
            make_connection("c1", "event", "exec", "if", "exec"),
            make_connection("c2", "cond", "value", "if", "condition"),
            make_connection("c3", "if", "true", "log_then", "exec"),
            make_connection("c4", "msg_then", "value", "log_then", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["TRUE"]);
}

#[tokio::test]
async fn test_if_false_branch() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let condition = {
        let mut n = make_node("cond", "const_boolean", serde_json::json!({ "value": false }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let if_node = {
        let mut n = make_node("if", "if", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("condition", "condition", PortDirection::Input),
        ];
        n.outputs = vec![
            make_flow_port("true", "true", PortDirection::Output),
            make_flow_port("false", "false", PortDirection::Output),
        ];
        n
    };

    let log_else = {
        let mut n = make_node("log_else", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let msg_else = {
        let mut n = make_node("msg_else", "const_string", serde_json::json!({ "value": "FALSE" }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, condition, if_node, log_else, msg_else],
        vec![
            make_connection("c1", "event", "exec", "if", "exec"),
            make_connection("c2", "cond", "value", "if", "condition"),
            make_connection("c3", "if", "false", "log_else", "exec"),
            make_connection("c4", "msg_else", "value", "log_else", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["FALSE"]);
}

// ============================================
// Compare Node Tests
// ============================================

#[tokio::test]
async fn test_compare_greater_than() {
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_a = {
        let mut n = make_node("a", "const_number", serde_json::json!({ "value": 10 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let const_b = {
        let mut n = make_node("b", "const_number", serde_json::json!({ "value": 5 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let compare = {
        let mut n = make_node("cmp", "compare", serde_json::json!({ "operation": "gt" }));
        n.inputs = vec![
            make_value_port("a", "a", PortDirection::Input),
            make_value_port("b", "b", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, const_a, const_b, compare, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "a", "value", "cmp", "a"),
            make_connection("c3", "b", "value", "cmp", "b"),
            make_connection("c4", "cmp", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["true"]); // 10 > 5 = true
}

// ============================================
// Event Interval Test
// ============================================

#[tokio::test]
async fn test_event_interval_tick_value() {
    let event = {
        let mut n = make_node("event", "event_interval", serde_json::json!({ "intervalMs": 100 }));
        n.outputs = vec![
            make_flow_port("exec", "exec", PortDirection::Output),
            make_value_port("tick", "tick", PortDirection::Output),
        ];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "event", "tick", "log", "message"),
        ],
    );

    // Test with tick value 5
    let result = execute_event(script, "event", Value::Integer(5)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["5"]);
}

// ============================================
// Chained Value Nodes Test
// ============================================

#[tokio::test]
async fn test_chained_value_nodes() {
    // Test: const_number -> math (add with another const) -> string_format -> log
    let event = {
        let mut n = make_node("event", "event_ui", serde_json::json!({}));
        n.outputs = vec![make_flow_port("exec", "exec", PortDirection::Output)];
        n
    };

    let const_a = {
        let mut n = make_node("a", "const_number", serde_json::json!({ "value": 10 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let const_b = {
        let mut n = make_node("b", "const_number", serde_json::json!({ "value": 5 }));
        n.outputs = vec![make_value_port("value", "value", PortDirection::Output)];
        n
    };

    let math = {
        let mut n = make_node("math", "math", serde_json::json!({ "operation": "multiply" }));
        n.inputs = vec![
            make_value_port("a", "a", PortDirection::Input),
            make_value_port("b", "b", PortDirection::Input),
        ];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let format = {
        let mut n = make_node("format", "string_format", serde_json::json!({ "template": "Result: {0}" }));
        n.inputs = vec![make_value_port("arg0", "arg0", PortDirection::Input)];
        n.outputs = vec![make_value_port("result", "result", PortDirection::Output)];
        n
    };

    let log = {
        let mut n = make_node("log", "log", serde_json::json!({}));
        n.inputs = vec![
            make_flow_port("exec", "exec", PortDirection::Input),
            make_value_port("message", "message", PortDirection::Input),
        ];
        n.outputs = vec![make_flow_port("out", "exec", PortDirection::Output)];
        n
    };

    let script = make_script(
        vec![event, const_a, const_b, math, format, log],
        vec![
            make_connection("c1", "event", "exec", "log", "exec"),
            make_connection("c2", "a", "value", "math", "a"),
            make_connection("c3", "b", "value", "math", "b"),
            make_connection("c4", "math", "result", "format", "arg0"),
            make_connection("c5", "format", "result", "log", "message"),
        ],
    );

    let result = execute_event(script, "event", Value::Boolean(true)).await;
    assert!(result.success);
    assert_eq!(result.logs, vec!["Result: 50"]); // 10 * 5 = 50
}
