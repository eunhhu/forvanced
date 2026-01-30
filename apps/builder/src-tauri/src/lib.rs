mod commands;
mod state;

use tauri::Manager;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub use commands::ExecutorState;
pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Forvanced Builder");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            // Initialize app state
            let state = AppState::new();
            app.manage(state.clone());

            // Initialize executor state
            let executor_state = ExecutorState::new();
            app.manage(executor_state);

            // Initialize async tasks (connect default adapter)
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = state_clone.initialize().await {
                    tracing::error!("Failed to initialize app state: {}", e);
                }
            });

            info!("Forvanced Builder initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Device commands
            commands::list_devices,
            commands::select_device,
            commands::get_current_device,
            commands::add_remote_device,
            // Process commands
            commands::enumerate_processes,
            commands::enumerate_applications,
            commands::attach_to_process,
            commands::attach_by_name,
            commands::attach_by_identifier,
            commands::spawn_and_attach,
            commands::detach_from_process,
            commands::inject_script,
            commands::unload_script,
            // Project commands
            commands::create_project,
            commands::save_project,
            commands::load_project,
            commands::get_current_project,
            commands::update_project,
            commands::close_project,
            commands::get_recent_projects,
            commands::remove_recent_project,
            // Build commands
            commands::generate_trainer_project,
            commands::build_trainer,
            commands::get_build_targets,
            commands::preview_generated_code,
            // Executor commands
            commands::execute_script,
            commands::set_executor_session,
            commands::clear_executor_session,
            commands::set_ui_value,
            commands::get_ui_value,
            commands::get_all_ui_values,
            commands::set_ui_values_batch,
            // RPC and message commands
            commands::call_rpc,
            commands::subscribe_to_messages,
            #[cfg(feature = "mock")]
            commands::simulate_frida_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
