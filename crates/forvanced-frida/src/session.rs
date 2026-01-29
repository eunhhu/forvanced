use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::process::ProcessInfo;

pub struct FridaSession {
    pub id: String,
    pub process: ProcessInfo,
    pub scripts: Arc<RwLock<HashMap<String, ScriptHandle>>>,
    detached: Arc<RwLock<bool>>,
}

pub struct ScriptHandle {
    pub id: String,
    pub name: String,
    pub loaded: bool,
}

impl FridaSession {
    pub fn new(id: impl Into<String>, process: ProcessInfo) -> Self {
        Self {
            id: id.into(),
            process,
            scripts: Arc::new(RwLock::new(HashMap::new())),
            detached: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn is_detached(&self) -> bool {
        *self.detached.read().await
    }

    pub async fn mark_detached(&self) {
        *self.detached.write().await = true;
    }

    pub async fn add_script(&self, id: String, name: String) {
        let handle = ScriptHandle {
            id: id.clone(),
            name,
            loaded: false,
        };
        self.scripts.write().await.insert(id, handle);
    }

    pub async fn remove_script(&self, script_id: &str) -> Option<ScriptHandle> {
        self.scripts.write().await.remove(script_id)
    }

    pub async fn get_script_ids(&self) -> Vec<String> {
        self.scripts.read().await.keys().cloned().collect()
    }
}
