use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::error::{AdapterError, Result};
use crate::local_pc::LocalPCAdapter;
use crate::traits::TargetAdapter;

pub struct AdapterRegistry {
    adapters: HashMap<String, Arc<RwLock<Box<dyn TargetAdapter>>>>,
    current_adapter_id: Option<String>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        Self {
            adapters: HashMap::new(),
            current_adapter_id: None,
        }
    }

    pub fn with_defaults() -> Self {
        let mut registry = Self::new();

        // Register built-in adapters
        registry.register(Box::new(LocalPCAdapter::new()));

        registry
    }

    pub fn register(&mut self, adapter: Box<dyn TargetAdapter>) {
        let id = adapter.adapter_id().to_string();
        self.adapters
            .insert(id, Arc::new(RwLock::new(adapter)));
    }

    pub fn get(&self, adapter_id: &str) -> Option<Arc<RwLock<Box<dyn TargetAdapter>>>> {
        self.adapters.get(adapter_id).cloned()
    }

    pub fn list_adapters(&self) -> Vec<String> {
        self.adapters.keys().cloned().collect()
    }

    pub async fn select_adapter(&mut self, adapter_id: &str) -> Result<()> {
        if !self.adapters.contains_key(adapter_id) {
            return Err(AdapterError::DeviceNotFound(format!(
                "Adapter '{}' not found",
                adapter_id
            )));
        }

        // Disconnect current adapter if any
        if let Some(current_id) = &self.current_adapter_id {
            if let Some(adapter) = self.adapters.get(current_id) {
                adapter.write().await.disconnect().await?;
            }
        }

        // Connect new adapter
        if let Some(adapter) = self.adapters.get(adapter_id) {
            adapter.write().await.connect().await?;
        }

        self.current_adapter_id = Some(adapter_id.to_string());
        Ok(())
    }

    pub fn current_adapter(&self) -> Option<Arc<RwLock<Box<dyn TargetAdapter>>>> {
        self.current_adapter_id
            .as_ref()
            .and_then(|id| self.adapters.get(id).cloned())
    }

    pub fn current_adapter_id(&self) -> Option<&str> {
        self.current_adapter_id.as_deref()
    }
}

impl Default for AdapterRegistry {
    fn default() -> Self {
        Self::with_defaults()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_defaults() {
        let registry = AdapterRegistry::with_defaults();
        assert!(registry.list_adapters().contains(&"local_pc".to_string()));
    }
}
