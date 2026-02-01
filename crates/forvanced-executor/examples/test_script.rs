//! CLI tool to test visual scripts from .forvanced files
//!
//! Usage:
//!   cargo run --example test_script -- <path_to_forvanced_file>
//!
//! This tool:
//! 1. Loads a .forvanced project file
//! 2. Lists all scripts
//! 3. Runs each event node and shows outputs
//! 4. Reports any errors

use forvanced_executor::script::{Connection, Port, PortDirection, PortType, Script, ScriptNode, ScriptVariable, ValueType};
use forvanced_executor::value::Value;
use forvanced_executor::ScriptExecutor;
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    scripts: Vec<ScriptData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptData {
    id: String,
    name: String,
    variables: Vec<VariableData>,
    nodes: Vec<NodeData>,
    connections: Vec<ConnectionData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VariableData {
    id: String,
    name: String,
    #[serde(rename = "type")]
    var_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NodeData {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    label: String,
    x: f64,
    y: f64,
    #[serde(default)]
    config: HashMap<String, serde_json::Value>,
    #[serde(default)]
    inputs: Vec<PortData>,
    #[serde(default)]
    outputs: Vec<PortData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortData {
    id: String,
    name: String,
    #[serde(rename = "type")]
    port_type: String,
    #[serde(default)]
    value_type: Option<String>,
    direction: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionData {
    id: String,
    from_node_id: String,
    from_port_id: String,
    to_node_id: String,
    to_port_id: String,
}

fn parse_value_type(s: &str) -> ValueType {
    match s {
        "int8" => ValueType::Int8,
        "uint8" => ValueType::Uint8,
        "int16" => ValueType::Int16,
        "uint16" => ValueType::Uint16,
        "int32" => ValueType::Int32,
        "uint32" => ValueType::Uint32,
        "int64" => ValueType::Int64,
        "uint64" => ValueType::Uint64,
        "float" => ValueType::Float,
        "double" => ValueType::Double,
        "pointer" => ValueType::Pointer,
        "string" => ValueType::String,
        "boolean" => ValueType::Boolean,
        _ => ValueType::Any,
    }
}

fn convert_script(data: &ScriptData) -> Script {
    let variables = data
        .variables
        .iter()
        .map(|v| ScriptVariable {
            id: v.id.clone(),
            name: v.name.clone(),
            value_type: parse_value_type(&v.var_type),
            default_value: None,
            description: None,
        })
        .collect();

    let nodes = data
        .nodes
        .iter()
        .map(|n| ScriptNode {
            id: n.id.clone(),
            node_type: n.node_type.clone(),
            label: n.label.clone(),
            x: n.x,
            y: n.y,
            config: n.config.clone(),
            inputs: n
                .inputs
                .iter()
                .map(|p| Port {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    port_type: if p.port_type == "flow" {
                        PortType::Flow
                    } else {
                        PortType::Value
                    },
                    value_type: p.value_type.as_ref().map(|vt| parse_value_type(vt)),
                    direction: if p.direction == "input" {
                        PortDirection::Input
                    } else {
                        PortDirection::Output
                    },
                })
                .collect(),
            outputs: n
                .outputs
                .iter()
                .map(|p| Port {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    port_type: if p.port_type == "flow" {
                        PortType::Flow
                    } else {
                        PortType::Value
                    },
                    value_type: p.value_type.as_ref().map(|vt| parse_value_type(vt)),
                    direction: if p.direction == "input" {
                        PortDirection::Input
                    } else {
                        PortDirection::Output
                    },
                })
                .collect(),
        })
        .collect();

    let connections = data
        .connections
        .iter()
        .map(|c| Connection {
            id: c.id.clone(),
            from_node_id: c.from_node_id.clone(),
            from_port_id: c.from_port_id.clone(),
            to_node_id: c.to_node_id.clone(),
            to_port_id: c.to_port_id.clone(),
        })
        .collect();

    Script {
        id: data.id.clone(),
        name: data.name.clone(),
        description: None,
        variables,
        nodes,
        connections,
    }
}

fn is_event_node(node_type: &str) -> bool {
    matches!(
        node_type,
        "event_ui" | "event_attach" | "event_detach" | "event_hotkey" | "event_interval"
    )
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("forvanced=debug".parse().unwrap()),
        )
        .init();

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <path_to_forvanced_file>", args[0]);
        eprintln!("");
        eprintln!("Example:");
        eprintln!("  cargo run --example test_script -- /path/to/project.forvanced");
        std::process::exit(1);
    }

    let file_path = &args[1];

    println!("╔════════════════════════════════════════════════════════════════╗");
    println!("║           Forvanced Script Executor - CLI Test Tool            ║");
    println!("╚════════════════════════════════════════════════════════════════╝");
    println!();

    // Load project file
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("❌ Failed to read file: {}", e);
            std::process::exit(1);
        }
    };

    let project: Project = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("❌ Failed to parse project file: {}", e);
            std::process::exit(1);
        }
    };

    println!("📂 Project: {} ({})", project.name, project.id);
    println!("📜 Scripts: {}", project.scripts.len());
    println!();

    // Create shared UI state (persisted across executions)
    let ui_state = Arc::new(RwLock::new(HashMap::new()));

    let mut total_tests = 0;
    let mut passed_tests = 0;

    for script_data in &project.scripts {
        // Create executor (one per script for state isolation between scripts)
        let executor = ScriptExecutor::new(Arc::clone(&ui_state));
        println!("────────────────────────────────────────────────────────────────");
        println!("📜 Script: {} ({})", script_data.name, script_data.id);
        println!();

        // Convert script
        let script = convert_script(script_data);

        // Debug: print nodes and connections
        println!("  Nodes ({}):", script.nodes.len());
        for node in &script.nodes {
            let event_marker = if is_event_node(&node.node_type) { "🎯 " } else { "   " };
            println!("    {}[{}] {} ({})", event_marker, node.id[..8].to_string(), node.label, node.node_type);

            // Print config
            if !node.config.is_empty() {
                for (key, value) in &node.config {
                    println!("        config.{} = {}", key, value);
                }
            }
        }
        println!();

        println!("  Connections ({}):", script.connections.len());
        for conn in &script.connections {
            // Find node names
            let from_node = script.find_node(&conn.from_node_id);
            let to_node = script.find_node(&conn.to_node_id);
            let from_name = from_node.map(|n| n.label.as_str()).unwrap_or("?");
            let to_name = to_node.map(|n| n.label.as_str()).unwrap_or("?");

            // Find port names
            let from_port_name = from_node
                .and_then(|n| n.output_by_id(&conn.from_port_id))
                .map(|p| p.name.as_str())
                .unwrap_or("?");
            let to_port_name = to_node
                .and_then(|n| n.input_by_id(&conn.to_port_id))
                .map(|p| p.name.as_str())
                .unwrap_or("?");

            println!("    {} ({}) → {} ({})", from_name, from_port_name, to_name, to_port_name);
        }
        println!();

        // Find event nodes and execute each
        let event_nodes: Vec<_> = script
            .nodes
            .iter()
            .filter(|n| is_event_node(&n.node_type))
            .collect();

        if event_nodes.is_empty() {
            println!("  ⚠️  No event nodes found in this script");
            continue;
        }

        for event_node in event_nodes {
            total_tests += 1;
            println!("  ▶ Testing event: {} ({})", event_node.label, event_node.node_type);

            // For interval events, run multiple iterations to test accumulation
            let iterations = if event_node.node_type == "event_interval" { 5 } else { 1 };

            for tick in 1..=iterations {
                // Create test event value based on node type
                let event_value = match event_node.node_type.as_str() {
                    "event_ui" => Value::Boolean(true),
                    "event_interval" => Value::Integer(tick), // tick count
                    "event_attach" => Value::String("mock-session".to_string()),
                    "event_detach" => Value::Null,
                    "event_hotkey" => Value::String("test-hotkey".to_string()),
                    _ => Value::Null,
                };

                // Execute
                match executor
                    .execute_from_event(script.clone(), &event_node.id, event_value, None)
                    .await
                {
                    Ok(result) => {
                        if result.success {
                            if tick == iterations {
                                passed_tests += 1;
                            }
                            if iterations == 1 {
                                println!("    ✅ Execution succeeded");
                            } else {
                                println!("    ✅ Tick {} succeeded", tick);
                            }
                        } else {
                            println!("    ❌ Tick {} failed: {}", tick, result.error.unwrap_or_default());
                        }

                        // Print logs
                        if !result.logs.is_empty() {
                            println!("    📝 Logs:");
                            for log in &result.logs {
                                println!("       {}", log);
                            }
                        } else if iterations == 1 {
                            println!("    📝 Logs: (none)");
                        }
                    }
                    Err(e) => {
                        println!("    ❌ Error: {}", e);
                    }
                }
            }
            println!();
        }
    }

    println!("════════════════════════════════════════════════════════════════");
    println!("📊 Test Results: {}/{} passed", passed_tests, total_tests);
    if passed_tests == total_tests {
        println!("🎉 All tests passed!");
    } else {
        println!("⚠️  Some tests failed");
    }
}
