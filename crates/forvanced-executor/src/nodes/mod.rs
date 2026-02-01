//! Node executor implementations
//!
//! This module contains the execution logic for all Host nodes.
//! Target nodes are executed via RPC in the Frida script context.

pub mod constants;
pub mod device;
pub mod flow;
pub mod math;
pub mod variables;
pub mod arrays;
pub mod objects;
pub mod strings;
pub mod output;
pub mod ui;

use crate::context::ExecutionContext;
use crate::error::ExecutorResult;
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use std::collections::HashMap;

/// Result of executing a node
#[derive(Debug)]
pub struct NodeOutput {
    /// Output values by port name
    pub values: HashMap<String, Value>,
    /// Which flow output to follow (for flow nodes)
    pub flow_output: Option<String>,
}

impl NodeOutput {
    /// Create output with just values (no flow)
    pub fn values(values: HashMap<String, Value>) -> Self {
        Self {
            values,
            flow_output: None,
        }
    }

    /// Create output with single value
    pub fn single(name: &str, value: Value) -> Self {
        let mut values = HashMap::new();
        values.insert(name.to_string(), value);
        Self {
            values,
            flow_output: None,
        }
    }

    /// Create output with flow
    pub fn flow(flow_output: &str) -> Self {
        Self {
            values: HashMap::new(),
            flow_output: Some(flow_output.to_string()),
        }
    }

    /// Create output with values and flow
    pub fn with_flow(mut self, flow_output: &str) -> Self {
        self.flow_output = Some(flow_output.to_string());
        self
    }

    /// Empty output (no values, default flow)
    pub fn empty() -> Self {
        Self {
            values: HashMap::new(),
            flow_output: Some("exec".to_string()),
        }
    }
}

/// Trait for executing a single node
#[async_trait]
pub trait NodeExecutor: Send + Sync {
    /// Execute the node with given inputs
    async fn execute(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
        ctx: &mut ExecutionContext,
    ) -> ExecutorResult<NodeOutput>;
}

/// Get the appropriate executor for a node type
pub fn get_executor(node_type: &str) -> Option<Box<dyn NodeExecutor>> {
    match node_type {
        // Constants
        "const_string" => Some(Box::new(constants::ConstStringExecutor)),
        "const_number" => Some(Box::new(constants::ConstNumberExecutor)),
        "const_boolean" => Some(Box::new(constants::ConstBooleanExecutor)),
        "const_pointer" => Some(Box::new(constants::ConstPointerExecutor)),

        // Variables
        "declare_variable" => Some(Box::new(variables::DeclareVariableExecutor)),
        "set_variable" => Some(Box::new(variables::SetVariableExecutor)),
        "get_variable" => Some(Box::new(variables::GetVariableExecutor)),

        // Flow Control
        "if" => Some(Box::new(flow::IfExecutor)),
        "switch" => Some(Box::new(flow::SwitchExecutor)),
        "delay" => Some(Box::new(flow::DelayExecutor)),
        "break" => Some(Box::new(flow::BreakExecutor)),
        "continue" => Some(Box::new(flow::ContinueExecutor)),
        // Note: for_each, for_range, loop are handled specially in the executor

        // Math/Logic
        "math" => Some(Box::new(math::MathExecutor)),
        "compare" => Some(Box::new(math::CompareExecutor)),
        "logic" => Some(Box::new(math::LogicExecutor)),

        // Arrays
        "array_create" => Some(Box::new(arrays::ArrayCreateExecutor)),
        "array_get" => Some(Box::new(arrays::ArrayGetExecutor)),
        "array_set" => Some(Box::new(arrays::ArraySetExecutor)),
        "array_push" => Some(Box::new(arrays::ArrayPushExecutor)),
        "array_length" => Some(Box::new(arrays::ArrayLengthExecutor)),
        "array_find" => Some(Box::new(arrays::ArrayFindExecutor)),

        // Objects
        "object_get" => Some(Box::new(objects::ObjectGetExecutor)),
        "object_set" => Some(Box::new(objects::ObjectSetExecutor)),
        "object_keys" => Some(Box::new(objects::ObjectKeysExecutor)),

        // Strings
        "string_format" => Some(Box::new(strings::StringFormatExecutor)),
        "string_concat" => Some(Box::new(strings::StringConcatExecutor)),
        "to_string" => Some(Box::new(strings::ToStringExecutor)),
        "parse_int" => Some(Box::new(strings::ParseIntExecutor)),
        "parse_float" => Some(Box::new(strings::ParseFloatExecutor)),
        "to_pointer" => Some(Box::new(strings::ToPointerExecutor)),

        // Output
        "log" => Some(Box::new(output::LogExecutor)),
        "notify" => Some(Box::new(output::NotifyExecutor)),

        // UI Operations
        "ui_get_value" => Some(Box::new(ui::UIGetValueExecutor)),
        "ui_set_value" => Some(Box::new(ui::UISetValueExecutor)),
        "ui_get_props" => Some(Box::new(ui::UIGetPropsExecutor)),

        // Device Management
        "device_enumerate" => Some(Box::new(device::DeviceEnumerateExecutor)),
        "device_select" => Some(Box::new(device::DeviceSelectExecutor)),
        "device_get_current" => Some(Box::new(device::DeviceGetCurrentExecutor)),
        "process_enumerate" => Some(Box::new(device::ProcessEnumerateExecutor)),
        "application_enumerate" => Some(Box::new(device::ApplicationEnumerateExecutor)),

        // Event nodes don't have executors - they're entry points
        "event_ui" | "event_attach" | "event_detach" | "event_hotkey" | "event_interval"
        | "event_hook" | "event_memory_watch" => None,

        // Target nodes are handled by RPC
        _ => None,
    }
}

/// Check if a node type is a loop node (needs special handling)
pub fn is_loop_node(node_type: &str) -> bool {
    matches!(node_type, "for_each" | "for_range" | "loop")
}

/// Check if a node type is an event node (entry point)
pub fn is_event_node(node_type: &str) -> bool {
    matches!(
        node_type,
        "event_ui" | "event_attach" | "event_detach" | "event_hotkey" | "event_interval"
        | "event_hook" | "event_memory_watch"
    )
}
