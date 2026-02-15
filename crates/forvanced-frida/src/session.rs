//! Frida session management
//!
//! Handles Frida session lifecycle and script management with message handling.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;

use crate::process::ProcessInfo;

/// Session lifecycle state
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    /// Session created but not yet actively used
    Created,
    /// Session is actively attached and usable
    Active,
    /// Session has been detached
    Detached,
}

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
    state: Arc<RwLock<SessionState>>,
    created_at: Instant,
    last_activity: Arc<RwLock<Instant>>,
    /// Message callbacks
    message_callbacks: Arc<RwLock<Vec<MessageCallback>>>,
}

impl FridaSession {
    pub fn new(id: impl Into<String>, process: ProcessInfo) -> Self {
        let now = Instant::now();
        Self {
            id: id.into(),
            process,
            scripts: Arc::new(RwLock::new(HashMap::new())),
            state: Arc::new(RwLock::new(SessionState::Created)),
            created_at: now,
            last_activity: Arc::new(RwLock::new(now)),
            message_callbacks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Get the current session state
    pub async fn state(&self) -> SessionState {
        *self.state.read().await
    }

    /// Set the session state
    pub async fn set_state(&self, new_state: SessionState) {
        *self.state.write().await = new_state;
        self.touch().await;
    }

    pub async fn is_detached(&self) -> bool {
        *self.state.read().await == SessionState::Detached
    }

    pub async fn mark_detached(&self) {
        *self.state.write().await = SessionState::Detached;
    }

    /// Update last activity timestamp
    pub async fn touch(&self) {
        *self.last_activity.write().await = Instant::now();
    }

    /// Check if session has exceeded the given timeout since last activity
    pub fn created_at(&self) -> Instant {
        self.created_at
    }

    pub async fn is_expired(&self, timeout: Duration) -> bool {
        self.last_activity.read().await.elapsed() > timeout
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
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn make_session() -> FridaSession {
        FridaSession::new("test-session", ProcessInfo::new(1234, "test"))
    }

    #[tokio::test]
    async fn test_session_lifecycle() {
        let session = make_session();

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
        let session = make_session();
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

    // --- SessionState tests ---

    #[tokio::test]
    async fn test_session_initial_state_is_created() {
        let session = make_session();
        assert_eq!(session.state().await, SessionState::Created);
    }

    #[tokio::test]
    async fn test_session_state_transitions() {
        let session = make_session();

        assert_eq!(session.state().await, SessionState::Created);

        session.set_state(SessionState::Active).await;
        assert_eq!(session.state().await, SessionState::Active);
        assert!(!session.is_detached().await);

        session.set_state(SessionState::Detached).await;
        assert_eq!(session.state().await, SessionState::Detached);
        assert!(session.is_detached().await);
    }

    #[tokio::test]
    async fn test_session_mark_detached_sets_state() {
        let session = make_session();
        session.set_state(SessionState::Active).await;

        session.mark_detached().await;
        assert_eq!(session.state().await, SessionState::Detached);
    }

    // --- Activity / expiry tests ---

    #[tokio::test]
    async fn test_session_touch_updates_activity() {
        let session = make_session();
        tokio::time::sleep(Duration::from_millis(10)).await;
        session.touch().await;
        // After touch, session should not be expired for a long timeout
        assert!(!session.is_expired(Duration::from_secs(10)).await);
    }

    #[tokio::test]
    async fn test_session_is_expired() {
        let session = make_session();
        // With a very short timeout, session should quickly expire
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(session.is_expired(Duration::from_millis(5)).await);
    }

    #[tokio::test]
    async fn test_session_created_at() {
        let before = Instant::now();
        let session = make_session();
        let after = Instant::now();

        assert!(session.created_at() >= before);
        assert!(session.created_at() <= after);
    }

    // --- Multi-script tests ---

    #[tokio::test]
    async fn test_session_multiple_scripts() {
        let session = make_session();

        session.add_script("s1".into(), "script1".into(), "code1".into()).await;
        session.add_script("s2".into(), "script2".into(), "code2".into()).await;
        session.add_script("s3".into(), "script3".into(), "code3".into()).await;

        let mut ids = session.get_script_ids().await;
        ids.sort();
        assert_eq!(ids, vec!["s1", "s2", "s3"]);

        // Remove one
        let removed = session.remove_script("s2").await;
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().name, "script2");

        let mut ids = session.get_script_ids().await;
        ids.sort();
        assert_eq!(ids, vec!["s1", "s3"]);
    }

    #[tokio::test]
    async fn test_session_mark_script_loaded_nonexistent() {
        let session = make_session();
        // Should not panic when marking a nonexistent script
        session.mark_script_loaded("nonexistent").await;
    }

    #[tokio::test]
    async fn test_session_remove_nonexistent_script() {
        let session = make_session();
        let result = session.remove_script("nonexistent").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_session_script_loaded_state() {
        let session = make_session();
        session.add_script("s1".into(), "test".into(), "code".into()).await;

        // Before marking loaded
        {
            let scripts = session.scripts.read().await;
            assert!(!scripts.get("s1").unwrap().loaded);
        }

        session.mark_script_loaded("s1").await;

        // After marking loaded
        {
            let scripts = session.scripts.read().await;
            assert!(scripts.get("s1").unwrap().loaded);
        }
    }

    // --- Callback tests ---

    #[tokio::test]
    async fn test_session_multiple_callbacks() {
        let session = make_session();

        let count1 = Arc::new(AtomicUsize::new(0));
        let count2 = Arc::new(AtomicUsize::new(0));

        let c1 = count1.clone();
        session.on_message(Arc::new(move |_, _| { c1.fetch_add(1, Ordering::SeqCst); })).await;

        let c2 = count2.clone();
        session.on_message(Arc::new(move |_, _| { c2.fetch_add(1, Ordering::SeqCst); })).await;

        session.dispatch_message("s1", ScriptMessage::Log {
            level: "info".into(),
            text: "test".into(),
        }).await;

        assert_eq!(count1.load(Ordering::SeqCst), 1);
        assert_eq!(count2.load(Ordering::SeqCst), 1);

        // Dispatch again
        session.dispatch_message("s1", ScriptMessage::Send {
            payload: serde_json::json!({"key": "value"}),
        }).await;

        assert_eq!(count1.load(Ordering::SeqCst), 2);
        assert_eq!(count2.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_session_dispatch_no_callbacks() {
        let session = make_session();
        // Should not panic when dispatching with no callbacks
        session.dispatch_message("s1", ScriptMessage::Log {
            level: "info".into(),
            text: "no listeners".into(),
        }).await;
    }

    #[tokio::test]
    async fn test_callback_receives_correct_script_id() {
        let session = make_session();
        let received_id = Arc::new(std::sync::Mutex::new(String::new()));

        let id_clone = received_id.clone();
        session.on_message(Arc::new(move |script_id, _| {
            *id_clone.lock().unwrap() = script_id;
        })).await;

        session.dispatch_message("my-script-42", ScriptMessage::Log {
            level: "debug".into(),
            text: "test".into(),
        }).await;

        assert_eq!(*received_id.lock().unwrap(), "my-script-42");
    }

    // --- ScriptHandle tests ---

    #[test]
    fn test_script_handle_new() {
        let handle = ScriptHandle::new("id1", "test_script", "console.log('hi')");
        assert_eq!(handle.id, "id1");
        assert_eq!(handle.name, "test_script");
        assert_eq!(handle.source, "console.log('hi')");
        assert!(!handle.loaded);
    }

    // --- SessionState serde tests ---

    #[test]
    fn test_session_state_serde() {
        let json = serde_json::to_string(&SessionState::Created).unwrap();
        assert_eq!(json, "\"created\"");

        let json = serde_json::to_string(&SessionState::Active).unwrap();
        assert_eq!(json, "\"active\"");

        let json = serde_json::to_string(&SessionState::Detached).unwrap();
        assert_eq!(json, "\"detached\"");

        // Deserialize
        let state: SessionState = serde_json::from_str("\"active\"").unwrap();
        assert_eq!(state, SessionState::Active);
    }

    // --- ScriptMessage serde tests ---

    #[test]
    fn test_script_message_serde_log() {
        let msg = ScriptMessage::Log {
            level: "info".into(),
            text: "hello world".into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "log");
        assert_eq!(json["level"], "info");
        assert_eq!(json["text"], "hello world");

        // Round-trip
        let deserialized: ScriptMessage = serde_json::from_value(json).unwrap();
        match deserialized {
            ScriptMessage::Log { level, text } => {
                assert_eq!(level, "info");
                assert_eq!(text, "hello world");
            }
            _ => panic!("Expected Log variant"),
        }
    }

    #[test]
    fn test_script_message_serde_send() {
        let msg = ScriptMessage::Send {
            payload: serde_json::json!({"key": "value", "num": 42}),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "send");
        assert_eq!(json["payload"]["key"], "value");
    }

    #[test]
    fn test_script_message_serde_error() {
        let msg = ScriptMessage::Error {
            description: "something broke".into(),
            stack: Some("at line 1".into()),
            file_name: Some("agent.js".into()),
            line_number: Some(42),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "error");
        assert_eq!(json["description"], "something broke");
        assert_eq!(json["stack"], "at line 1");
        assert_eq!(json["fileName"], "agent.js");
        assert_eq!(json["lineNumber"], 42);
    }

    #[test]
    fn test_script_message_serde_rpc() {
        let msg = ScriptMessage::Rpc {
            id: 99,
            result: RpcResult::Ok { value: serde_json::json!(123) },
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "rpc");
        assert_eq!(json["id"], 99);
        assert_eq!(json["result"]["status"], "ok");
        assert_eq!(json["result"]["value"], 123);
    }

    #[test]
    fn test_rpc_result_serde_error() {
        let result = RpcResult::Error { message: "fail".into() };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["status"], "error");
        assert_eq!(json["message"], "fail");
    }

    // --- Session metadata tests ---

    #[test]
    fn test_session_id_and_process() {
        let session = FridaSession::new("sess-123", ProcessInfo::new(9999, "my_app"));
        assert_eq!(session.id, "sess-123");
        assert_eq!(session.process.pid, 9999);
        assert_eq!(session.process.name, "my_app");
    }
}
