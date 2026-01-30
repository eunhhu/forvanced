//! Forvanced Executor - Visual Script Execution Engine
//!
//! This crate provides a hybrid execution model for visual scripts:
//! - **Host nodes**: Execute in Rust (UI operations, flow control, variables)
//! - **Target nodes**: Execute via Frida RPC (memory operations, hooks)
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │  Executor (Host - Rust)                                     │
//! │  ├── ExecutionContext (variables, UI state)                 │
//! │  ├── HostNodeExecutor (flow control, math, UI ops)         │
//! │  └── RpcBridge ──────────────────────────────┐             │
//! │                                               │             │
//! │                                               ▼             │
//! │            ┌─────────────────────────────────────────┐      │
//! │            │   Target (Frida JavaScript)             │      │
//! │            │   - Memory operations                   │      │
//! │            │   - Function hooks                      │      │
//! │            │   - Native calls                        │      │
//! │            └─────────────────────────────────────────┘      │
//! └─────────────────────────────────────────────────────────────┘
//! ```

pub mod context;
pub mod error;
pub mod executor;
pub mod nodes;
pub mod rpc;
pub mod script;
pub mod value;

pub use context::ExecutionContext;
pub use error::{ExecutorError, ExecutorResult};
pub use executor::ScriptExecutor;
pub use rpc::{RpcBridge, RpcCaller, RpcRequest, RpcResponse};
pub use value::Value;

/// Node execution context classification
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeContext {
    /// Executes on the host (Rust backend)
    Host,
    /// Executes on the target (Frida JavaScript in target process)
    Target,
}

/// Classify a node type to its execution context
pub fn classify_node(node_type: &str) -> NodeContext {
    match node_type {
        // Event Listeners - Host (entry points)
        "event_ui" | "event_attach" | "event_detach" | "event_hotkey" | "event_interval" => {
            NodeContext::Host
        }

        // Constants - Host
        "const_string" | "const_number" | "const_boolean" | "const_pointer" => NodeContext::Host,

        // Flow Control - Host
        "if" | "switch" | "for_each" | "for_range" | "loop" | "break" | "continue" | "delay" => {
            NodeContext::Host
        }

        // Variables - Host
        "declare_variable" | "set_variable" | "get_variable" => NodeContext::Host,

        // Array/Object Operations - Host (pure data ops)
        "array_create" | "array_get" | "array_set" | "array_push" | "array_length"
        | "array_find" => NodeContext::Host,
        "object_get" | "object_set" | "object_keys" => NodeContext::Host,

        // Math/Logic/String - Host (pure computation)
        "math" | "compare" | "logic" => NodeContext::Host,
        "string_format" | "string_concat" | "to_string" | "parse_int" | "parse_float" => {
            NodeContext::Host
        }

        // Type Conversion - Host
        "to_pointer" => NodeContext::Host,

        // Functions - Host
        "function_define" | "function_call" | "function_return" => NodeContext::Host,

        // Output - Host (logs go to host console)
        "log" | "notify" => NodeContext::Host,

        // UI Operations - Host
        "ui_get_value" | "ui_set_value" | "ui_get_props" => NodeContext::Host,

        // Process Control - Host (calls Frida manager)
        "process_attach" | "process_detach" | "process_spawn" | "process_is_attached" => {
            NodeContext::Host
        }

        // Memory Operations - Target
        "memory_scan" | "memory_read" | "memory_write" | "memory_freeze" | "memory_alloc"
        | "memory_protect" => NodeContext::Target,

        // Pointer Operations - Target
        "pointer_add" | "pointer_read" | "pointer_write" => NodeContext::Target,

        // Module/Symbol - Target
        "get_module" | "find_symbol" | "get_base_address" | "enumerate_modules"
        | "enumerate_exports" => NodeContext::Target,

        // Native Calls - Target
        "call_native" | "native_callback" => NodeContext::Target,

        // Interceptor - Target
        "interceptor_attach" | "interceptor_replace" | "interceptor_detach" => NodeContext::Target,
        "read_arg" | "write_arg" | "read_retval" | "replace_retval" => NodeContext::Target,

        // Default to Target for unknown nodes (safer)
        _ => NodeContext::Target,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_classification() {
        // Host nodes
        assert_eq!(classify_node("event_ui"), NodeContext::Host);
        assert_eq!(classify_node("if"), NodeContext::Host);
        assert_eq!(classify_node("ui_get_value"), NodeContext::Host);
        assert_eq!(classify_node("log"), NodeContext::Host);

        // Target nodes
        assert_eq!(classify_node("memory_read"), NodeContext::Target);
        assert_eq!(classify_node("call_native"), NodeContext::Target);
        assert_eq!(classify_node("interceptor_attach"), NodeContext::Target);
    }
}
