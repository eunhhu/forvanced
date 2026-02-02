use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::sync::atomic::AtomicU32;

use forvanced_core::Project;
use forvanced_frida::FridaManager;
use serde::{Deserialize, Serialize};

const MAX_RECENT_PROJECTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProjectEntry {
    pub name: String,
    pub path: String,
    pub last_opened: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecentProjectsStore {
    pub projects: VecDeque<RecentProjectEntry>,
}

impl RecentProjectsStore {
    pub fn add(&mut self, name: String, path: String) {
        // Remove if already exists
        self.projects.retain(|p| p.path != path);

        // Add to front
        self.projects.push_front(RecentProjectEntry {
            name,
            path,
            last_opened: chrono::Utc::now().timestamp_millis(),
        });

        // Limit size
        while self.projects.len() > MAX_RECENT_PROJECTS {
            self.projects.pop_back();
        }
    }

    pub fn remove(&mut self, path: &str) {
        self.projects.retain(|p| p.path != path);
    }
}

#[derive(Clone)]
pub struct AppState {
    pub frida_manager: Arc<RwLock<Option<FridaManager>>>,
    pub current_device_id: Arc<RwLock<Option<String>>>,
    pub current_project: Arc<RwLock<Option<Project>>>,
    pub project_path: Arc<RwLock<Option<PathBuf>>>,
    pub recent_projects: Arc<RwLock<RecentProjectsStore>>,
    pub config_dir: PathBuf,
    /// Whether a build is currently in progress
    pub is_building: Arc<RwLock<bool>>,
    /// Whether the current build should be cancelled
    pub build_cancelled: Arc<RwLock<bool>>,
    /// Current build child process ID (0 if none)
    pub build_child_pid: Arc<AtomicU32>,
}

impl AppState {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("forvanced");

        // Load recent projects from disk
        let recent_projects = Self::load_recent_projects(&config_dir);

        Self {
            frida_manager: Arc::new(RwLock::new(None)),
            current_device_id: Arc::new(RwLock::new(None)),
            current_project: Arc::new(RwLock::new(None)),
            project_path: Arc::new(RwLock::new(None)),
            recent_projects: Arc::new(RwLock::new(recent_projects)),
            config_dir,
            is_building: Arc::new(RwLock::new(false)),
            build_cancelled: Arc::new(RwLock::new(false)),
            build_child_pid: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Initialize the app state asynchronously (create FridaManager)
    pub async fn initialize(&self) -> Result<(), String> {
        let manager = FridaManager::new().map_err(|e| e.to_string())?;
        *self.frida_manager.write().await = Some(manager);
        tracing::info!("FridaManager initialized");
        Ok(())
    }

    fn load_recent_projects(config_dir: &PathBuf) -> RecentProjectsStore {
        let path = config_dir.join("recent_projects.json");
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(store) = serde_json::from_str(&content) {
                    return store;
                }
            }
        }
        RecentProjectsStore::default()
    }

    pub async fn save_recent_projects(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;

        let path = self.config_dir.join("recent_projects.json");
        let store = self.recent_projects.read().await;
        let json = serde_json::to_string_pretty(&*store)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write: {}", e))?;

        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
