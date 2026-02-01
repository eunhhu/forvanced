//! Device management node executors
//!
//! These nodes run on the Host and provide device/process enumeration.
//! In the builder context, they return mock data since the real Frida
//! operations are handled by the frontend's Tauri commands.

use crate::context::ExecutionContext;
use crate::error::ExecutorResult;
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

use super::{NodeExecutor, NodeOutput};

/// Enumerate available Frida devices
pub struct DeviceEnumerateExecutor;

#[async_trait]
impl NodeExecutor for DeviceEnumerateExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        ctx.add_log("Enumerating devices...".to_string());

        // Return mock devices - real enumeration is done via Tauri commands
        let devices = Value::Array(vec![
            Value::Object({
                let mut m = HashMap::new();
                m.insert("id".to_string(), Value::String("local".to_string()));
                m.insert("name".to_string(), Value::String("Local System".to_string()));
                m.insert("type".to_string(), Value::String("local".to_string()));
                m
            }),
            Value::Object({
                let mut m = HashMap::new();
                m.insert("id".to_string(), Value::String("usb-device".to_string()));
                m.insert("name".to_string(), Value::String("USB Device".to_string()));
                m.insert("type".to_string(), Value::String("usb".to_string()));
                m
            }),
        ]);

        let count = match &devices {
            Value::Array(arr) => Value::Integer(arr.len() as i64),
            _ => Value::Integer(0),
        };

        ctx.add_log(format!("Found {} devices", count));

        let mut values = HashMap::new();
        values.insert("devices".to_string(), devices);
        values.insert("count".to_string(), count);

        Ok(NodeOutput::values(values).with_flow("exec"))
    }
}

/// Select a Frida device
pub struct DeviceSelectExecutor;

#[async_trait]
impl NodeExecutor for DeviceSelectExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let selection_mode = node.config.get("selectionMode")
            .and_then(|v| v.as_str())
            .unwrap_or("type");

        let device_type = node.config.get("deviceType")
            .and_then(|v| v.as_str())
            .unwrap_or("local");

        let device_id = inputs.get("deviceId")
            .map(|v| v.to_string())
            .unwrap_or_default();

        ctx.add_log(format!("Selecting device: mode={}, type={}, id={}", selection_mode, device_type, device_id));

        // Mock success - return local device
        let mock_device = Value::Object({
            let mut m = HashMap::new();
            m.insert("id".to_string(), Value::String("local".to_string()));
            m.insert("name".to_string(), Value::String("Local System".to_string()));
            m.insert("type".to_string(), Value::String("local".to_string()));
            m
        });

        let mut values = HashMap::new();
        values.insert("device".to_string(), mock_device);
        values.insert("error".to_string(), Value::Null);

        Ok(NodeOutput::values(values).with_flow("success"))
    }
}

/// Get current device
pub struct DeviceGetCurrentExecutor;

#[async_trait]
impl NodeExecutor for DeviceGetCurrentExecutor {
    async fn execute(
        &self,
        _node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        _ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        // Mock: return local device
        let mock_device = Value::Object({
            let mut m = HashMap::new();
            m.insert("id".to_string(), Value::String("local".to_string()));
            m.insert("name".to_string(), Value::String("Local System".to_string()));
            m.insert("type".to_string(), Value::String("local".to_string()));
            m
        });

        let mut values = HashMap::new();
        values.insert("device".to_string(), mock_device);
        values.insert("hasDevice".to_string(), Value::Boolean(true));

        Ok(NodeOutput::values(values))
    }
}

/// Enumerate processes on current device
pub struct ProcessEnumerateExecutor;

#[async_trait]
impl NodeExecutor for ProcessEnumerateExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let scope = node.config.get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("minimal");

        ctx.add_log(format!("Enumerating processes (scope: {})", scope));

        // Mock processes
        let processes = Value::Array(vec![
            Value::Object({
                let mut m = HashMap::new();
                m.insert("pid".to_string(), Value::Integer(1));
                m.insert("name".to_string(), Value::String("init".to_string()));
                m
            }),
            Value::Object({
                let mut m = HashMap::new();
                m.insert("pid".to_string(), Value::Integer(100));
                m.insert("name".to_string(), Value::String("ExampleApp".to_string()));
                m
            }),
            Value::Object({
                let mut m = HashMap::new();
                m.insert("pid".to_string(), Value::Integer(200));
                m.insert("name".to_string(), Value::String("TargetGame".to_string()));
                m
            }),
        ]);

        let count = match &processes {
            Value::Array(arr) => Value::Integer(arr.len() as i64),
            _ => Value::Integer(0),
        };

        ctx.add_log(format!("Found {} processes", count));

        let mut values = HashMap::new();
        values.insert("processes".to_string(), processes);
        values.insert("count".to_string(), count);

        Ok(NodeOutput::values(values).with_flow("exec"))
    }
}

/// Enumerate applications on current device
pub struct ApplicationEnumerateExecutor;

#[async_trait]
impl NodeExecutor for ApplicationEnumerateExecutor {
    async fn execute(
        &self,
        node: &ScriptNode,
        _inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput> {
        let scope = node.config.get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("minimal");

        ctx.add_log(format!("Enumerating applications (scope: {})", scope));

        // Mock applications
        let applications = Value::Array(vec![
            Value::Object({
                let mut m = HashMap::new();
                m.insert("identifier".to_string(), Value::String("com.example.app".to_string()));
                m.insert("name".to_string(), Value::String("Example App".to_string()));
                m
            }),
            Value::Object({
                let mut m = HashMap::new();
                m.insert("identifier".to_string(), Value::String("com.game.target".to_string()));
                m.insert("name".to_string(), Value::String("Target Game".to_string()));
                m
            }),
        ]);

        let count = match &applications {
            Value::Array(arr) => Value::Integer(arr.len() as i64),
            _ => Value::Integer(0),
        };

        ctx.add_log(format!("Found {} applications", count));

        let mut values = HashMap::new();
        values.insert("applications".to_string(), applications);
        values.insert("count".to_string(), count);

        Ok(NodeOutput::values(values).with_flow("exec"))
    }
}
