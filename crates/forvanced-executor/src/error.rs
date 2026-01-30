//! Error types for the executor

use thiserror::Error;

/// Result type for executor operations
pub type ExecutorResult<T> = Result<T, ExecutorError>;

/// Errors that can occur during script execution
#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Node not found: {0}")]
    NodeNotFound(String),

    #[error("Port not found: {node_id}.{port_id}")]
    PortNotFound { node_id: String, port_id: String },

    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Variable not found: {0}")]
    VariableNotFound(String),

    #[error("Function not found: {0}")]
    FunctionNotFound(String),

    #[error("UI component not found: {0}")]
    UIComponentNotFound(String),

    #[error("Type error: expected {expected}, got {actual}")]
    TypeError { expected: String, actual: String },

    #[error("Type conversion failed: cannot convert {from} to {to}")]
    ConversionError { from: String, to: String },

    #[error("Division by zero")]
    DivisionByZero,

    #[error("Index out of bounds: {index} (length: {length})")]
    IndexOutOfBounds { index: i64, length: usize },

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Loop iteration limit exceeded: {0}")]
    LoopLimitExceeded(usize),

    #[error("Execution cycle detected at node: {0}")]
    CycleDetected(String),

    #[error("Break signal")]
    BreakSignal,

    #[error("Continue signal")]
    ContinueSignal,

    #[error("Return signal")]
    ReturnSignal(Box<crate::Value>),

    #[error("Not attached to any process")]
    NotAttached,

    #[error("Already attached to process: {0}")]
    AlreadyAttached(String),

    #[error("Frida error: {0}")]
    FridaError(String),

    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("RPC timeout after {0}ms")]
    RpcTimeout(u64),

    #[error("Script compilation error: {0}")]
    CompilationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl ExecutorError {
    /// Check if this error is a control flow signal (break/continue/return)
    pub fn is_control_flow(&self) -> bool {
        matches!(
            self,
            ExecutorError::BreakSignal
                | ExecutorError::ContinueSignal
                | ExecutorError::ReturnSignal(_)
        )
    }

    /// Check if this error is recoverable
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            ExecutorError::VariableNotFound(_)
                | ExecutorError::TypeError { .. }
                | ExecutorError::IndexOutOfBounds { .. }
        )
    }
}
