use std::path::PathBuf;
use tauri::State;
use tokio::fs;
use tracing::{debug, info};

use forvanced_core::Project;

use crate::state::RecentProjectEntry;
use crate::AppState;

const PROJECT_EXTENSION: &str = "forvanced";

#[tauri::command]
pub async fn create_project(name: String) -> Result<Project, String> {
    info!("Creating new project: {}", name);
    let project = Project::new(name);
    Ok(project)
}

#[tauri::command]
pub async fn save_project(
    state: State<'_, AppState>,
    project: Project,
    path: Option<String>,
) -> Result<String, String> {
    let save_path = match path {
        Some(p) => PathBuf::from(p),
        None => {
            // Use project name as default filename
            let filename = format!("{}.{}", sanitize_filename(&project.name), PROJECT_EXTENSION);
            let documents = dirs::document_dir()
                .ok_or_else(|| "Could not find documents directory".to_string())?;
            documents.join("Forvanced").join(filename)
        }
    };

    // Create parent directory if needed
    if let Some(parent) = save_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Serialize and save
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;

    fs::write(&save_path, json)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let path_str = save_path.to_string_lossy().to_string();
    info!("Project saved to: {}", path_str);

    // Update current project in state
    let project_name = project.name.clone();
    *state.current_project.write().await = Some(project);
    *state.project_path.write().await = Some(save_path.clone());

    // Add to recent projects
    state
        .recent_projects
        .write()
        .await
        .add(project_name, path_str.clone());
    let _ = state.save_recent_projects().await;

    Ok(path_str)
}

#[tauri::command]
pub async fn load_project(state: State<'_, AppState>, path: String) -> Result<Project, String> {
    info!("Loading project from: {}", path);

    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err("Project file not found".to_string());
    }

    let content = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let project: Project = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse project file: {}", e))?;

    // Update state
    let project_name = project.name.clone();
    let path_str = path.to_string_lossy().to_string();
    *state.current_project.write().await = Some(project.clone());
    *state.project_path.write().await = Some(path);

    // Add to recent projects
    state
        .recent_projects
        .write()
        .await
        .add(project_name, path_str);
    let _ = state.save_recent_projects().await;

    Ok(project)
}

#[tauri::command]
pub async fn get_current_project(state: State<'_, AppState>) -> Result<Option<Project>, String> {
    debug!("get_current_project called");
    let project = state.current_project.read().await.clone();
    Ok(project)
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    project: Project,
) -> Result<(), String> {
    debug!("update_project called");
    *state.current_project.write().await = Some(project);
    Ok(())
}

#[tauri::command]
pub async fn close_project(state: State<'_, AppState>) -> Result<(), String> {
    info!("Closing current project");
    *state.current_project.write().await = None;
    *state.project_path.write().await = None;
    Ok(())
}

#[tauri::command]
pub async fn get_recent_projects(
    state: State<'_, AppState>,
) -> Result<Vec<RecentProjectEntry>, String> {
    let store = state.recent_projects.read().await;
    Ok(store.projects.iter().cloned().collect())
}

#[tauri::command]
pub async fn remove_recent_project(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    state.recent_projects.write().await.remove(&path);
    state.save_recent_projects().await
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}
