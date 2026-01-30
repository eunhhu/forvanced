//! Frida session management
//!
//! Handles Frida session lifecycle and script management with message handling.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::process::ProcessInfo;

/// Message from Frida script
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ScriptMessage {
    /// Log message from console.log
    Log {
        level: String,
        text: String,
    },
    /// Custom send() message from script
    Send {
        payload: serde_json::Value,
    },
    /// Error in script
    Error {
        description: String,
        stack: Option<String>,
        #[serde(rename = "fileName")]
        file_name: Option<String>,
        #[serde(rename = "lineNumber")]
        line_number: Option<u32>,
    },
    /// RPC response
    Rpc {
        id: u64,
        result: RpcResult,
    },
}

/// RPC call result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum RpcResult {
    Ok { value: serde_json::Value },
    Error { message: String },
}

/// Callback for receiving script messages
pub type MessageCallback = Arc<dyn Fn(String, ScriptMessage) + Send + Sync>;

/// Script handle with metadata
pub struct ScriptHandle {
    pub id: String,
    pub name: String,
    pub loaded: bool,
    /// Source code of the script
    pub source: String,
}

impl ScriptHandle {
    pub fn new(id: impl Into<String>, name: impl Into<String>, source: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            loaded: false,
            source: source.into(),
        }
    }
}

/// Frida session wrapper
pub struct FridaSession {
    pub id: String,
    pub process: ProcessInfo,
    pub scripts: Arc<RwLock<HashMap<String, ScriptHandle>>>,
    detached: Arc<RwLock<bool>>,
    /// Message callbacks
    message_callbacks: Arc<RwLock<Vec<MessageCallback>>>,
}

impl FridaSession {
    pub fn new(id: impl Into<String>, process: ProcessInfo) -> Self {
        Self {
            id: id.into(),
            process,
            scripts: Arc::new(RwLock::new(HashMap::new())),
            detached: Arc::new(RwLock::new(false)),
            message_callbacks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn is_detached(&self) -> bool {
        *self.detached.read().await
    }

    pub async fn mark_detached(&self) {
        *self.detached.write().await = true;
    }

    /// Add a script to this session
    pub async fn add_script(&self, id: String, name: String, source: String) {
        let handle = ScriptHandle::new(id.clone(), name, source);
        self.scripts.write().await.insert(id, handle);
    }

    /// Mark a script as loaded
    pub async fn mark_script_loaded(&self, script_id: &str) {
        if let Some(handle) = self.scripts.write().await.get_mut(script_id) {
            handle.loaded = true;
        }
    }

    /// Remove a script from this session
    pub async fn remove_script(&self, script_id: &str) -> Option<ScriptHandle> {
        self.scripts.write().await.remove(script_id)
    }

    /// Get all script IDs
    pub async fn get_script_ids(&self) -> Vec<String> {
        self.scripts.read().await.keys().cloned().collect()
    }

    /// Register a message callback
    pub async fn on_message(&self, callback: MessageCallback) {
        self.message_callbacks.write().await.push(callback);
    }

    /// Dispatch a message to all registered callbacks
    pub async fn dispatch_message(&self, script_id: &str, message: ScriptMessage) {
        let callbacks = self.message_callbacks.read().await;
        for callback in callbacks.iter() {
            callback(script_id.to_string(), message.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_session_lifecycle() {
        let session = FridaSession::new("test-session", ProcessInfo::new(1234, "test"));

        assert!(!session.is_detached().await);

        session.add_script("script-1".to_string(), "test".to_string(), "console.log('hi')".to_string()).await;
        session.mark_script_loaded("script-1").await;

        let ids = session.get_script_ids().await;
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0], "script-1");

        session.mark_detached().await;
        assert!(session.is_detached().await);
    }

    #[tokio::test]
    async fn test_message_callback() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let session = FridaSession::new("test-session", ProcessInfo::new(1234, "test"));
        let call_count = Arc::new(AtomicUsize::new(0));

        let count_clone = call_count.clone();
        session.on_message(Arc::new(move |_script_id, _msg| {
            count_clone.fetch_add(1, Ordering::SeqCst);
        })).await;

        session.dispatch_message("script-1", ScriptMessage::Log {
            level: "info".to_string(),
            text: "Hello".to_string(),
        }).await;

        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}
