//! Forvanced Runtime - Generated project app
//!
//! This is the runtime that executes the project built by Forvanced Builder.
//! It renders the UI components and executes Frida scripts.

mod commands;
mod state;

use state::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("forvanced=debug".parse().unwrap()))
        .init();

    tracing::info!("Starting Forvanced Runtime");

    let app_state = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_project_config,
            commands::attach_process,
            commands::detach_process,
            commands::execute_action,
            commands::trigger_ui_event,
            commands::get_component_value,
            commands::set_component_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
