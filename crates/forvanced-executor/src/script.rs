//! Script data structures (mirrors frontend types)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Value types for ports
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ValueType {
    Int8,
    Uint8,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Int64,
    Uint64,
    Float,
    Double,
    Pointer,
    String,
    Boolean,
    Any,
}

impl Default for ValueType {
    fn default() -> Self {
        ValueType::Any
    }
}

/// Port types (flow vs value)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortType {
    Flow,
    Value,
}

/// Port direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortDirection {
    Input,
    Output,
}

/// Port definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub port_type: PortType,
    #[serde(rename = "valueType", skip_serializing_if = "Option::is_none")]
    pub value_type: Option<ValueType>,
    pub direction: PortDirection,
}

/// Connection between nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    #[serde(rename = "fromNodeId")]
    pub from_node_id: String,
    #[serde(rename = "fromPortId")]
    pub from_port_id: String,
    #[serde(rename = "toNodeId")]
    pub to_node_id: String,
    #[serde(rename = "toPortId")]
    pub to_port_id: String,
}

/// Node configuration (varies by node type)
pub type NodeConfig = HashMap<String, serde_json::Value>;

/// Script node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub config: NodeConfig,
    pub inputs: Vec<Port>,
    pub outputs: Vec<Port>,
}

impl ScriptNode {
    /// Get a config value as a specific type
    pub fn config_get<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.config
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Get a config value as string
    pub fn config_str(&self, key: &str) -> Option<String> {
        self.config.get(key).and_then(|v| v.as_str()).map(String::from)
    }

    /// Get a config value as i64
    pub fn config_i64(&self, key: &str) -> Option<i64> {
        self.config.get(key).and_then(|v| v.as_i64())
    }

    /// Get a config value as f64
    pub fn config_f64(&self, key: &str) -> Option<f64> {
        self.config.get(key).and_then(|v| v.as_f64())
    }

    /// Get a config value as bool
    pub fn config_bool(&self, key: &str) -> Option<bool> {
        self.config.get(key).and_then(|v| v.as_bool())
    }

    /// Find input port by name
    pub fn input_by_name(&self, name: &str) -> Option<&Port> {
        self.inputs.iter().find(|p| p.name == name)
    }

    /// Find output port by name
    pub fn output_by_name(&self, name: &str) -> Option<&Port> {
        self.outputs.iter().find(|p| p.name == name)
    }

    /// Find input port by id
    pub fn input_by_id(&self, id: &str) -> Option<&Port> {
        self.inputs.iter().find(|p| p.id == id)
    }

    /// Find output port by id
    pub fn output_by_id(&self, id: &str) -> Option<&Port> {
        self.outputs.iter().find(|p| p.id == id)
    }

    /// Get all flow output ports
    pub fn flow_outputs(&self) -> Vec<&Port> {
        self.outputs
            .iter()
            .filter(|p| p.port_type == PortType::Flow)
            .collect()
    }

    /// Get all value output ports
    pub fn value_outputs(&self) -> Vec<&Port> {
        self.outputs
            .iter()
            .filter(|p| p.port_type == PortType::Value)
            .collect()
    }
}

/// Variable definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptVariable {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub value_type: ValueType,
    #[serde(rename = "defaultValue", skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Complete visual script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub variables: Vec<ScriptVariable>,
    pub nodes: Vec<ScriptNode>,
    pub connections: Vec<Connection>,
}

impl Script {
    /// Find node by ID
    pub fn find_node(&self, id: &str) -> Option<&ScriptNode> {
        self.nodes.iter().find(|n| n.id == id)
    }

    /// Find all event listener nodes (entry points)
    pub fn find_event_nodes(&self) -> Vec<&ScriptNode> {
        self.nodes
            .iter()
            .filter(|n| {
                matches!(
                    n.node_type.as_str(),
                    "event_ui"
                        | "event_attach"
                        | "event_detach"
                        | "event_hotkey"
                        | "event_interval"
                )
            })
            .collect()
    }

    /// Get connections originating from a node
    pub fn connections_from(&self, node_id: &str) -> Vec<&Connection> {
        self.connections
            .iter()
            .filter(|c| c.from_node_id == node_id)
            .collect()
    }

    /// Get connections originating from a specific port
    pub fn connections_from_port(&self, node_id: &str, port_id: &str) -> Vec<&Connection> {
        self.connections
            .iter()
            .filter(|c| c.from_node_id == node_id && c.from_port_id == port_id)
            .collect()
    }

    /// Get connection going to a specific port
    pub fn connection_to_port(&self, node_id: &str, port_id: &str) -> Option<&Connection> {
        self.connections
            .iter()
            .find(|c| c.to_node_id == node_id && c.to_port_id == port_id)
    }

    /// Get connections going to a node
    pub fn connections_to(&self, node_id: &str) -> Vec<&Connection> {
        self.connections
            .iter()
            .filter(|c| c.to_node_id == node_id)
            .collect()
    }

    /// Find variable by ID
    pub fn find_variable(&self, id: &str) -> Option<&ScriptVariable> {
        self.variables.iter().find(|v| v.id == id)
    }

    /// Find variable by name
    pub fn find_variable_by_name(&self, name: &str) -> Option<&ScriptVariable> {
        self.variables.iter().find(|v| v.name == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_script_deserialization() {
        let json = r#"{
            "id": "test-script",
            "name": "Test Script",
            "variables": [],
            "nodes": [
                {
                    "id": "node-1",
                    "type": "event_ui",
                    "label": "UI Event",
                    "x": 100,
                    "y": 200,
                    "config": { "componentId": "btn-1", "eventType": "click" },
                    "inputs": [],
                    "outputs": [
                        { "id": "out-1", "name": "exec", "type": "flow", "direction": "output" }
                    ]
                }
            ],
            "connections": []
        }"#;

        let script: Script = serde_json::from_str(json).unwrap();
        assert_eq!(script.id, "test-script");
        assert_eq!(script.nodes.len(), 1);
        assert_eq!(script.nodes[0].node_type, "event_ui");
    }
}
