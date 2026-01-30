//! Runtime template management

use crate::error::BuildError;
use handlebars::Handlebars;
use serde::Serialize;

/// Template data for generating trainer app
#[derive(Debug, Clone, Serialize)]
pub struct TemplateData {
    pub project_name: String,
    /// Rust-compatible lib name (hyphens replaced with underscores)
    pub lib_name: String,
    pub project_version: String,
    pub project_description: String,
    pub window_width: u32,
    pub window_height: u32,
    pub window_title: String,
    pub theme: String,
    pub bundle_frida: bool,
    pub process_name: Option<String>,
    pub auto_attach: bool,
}

/// Template manager for runtime generation
pub struct TemplateManager {
    handlebars: Handlebars<'static>,
}

impl TemplateManager {
    pub fn new() -> Result<Self, BuildError> {
        let mut handlebars = Handlebars::new();
        handlebars.set_strict_mode(true);

        // Register built-in templates
        handlebars
            .register_template_string("package.json", PACKAGE_JSON_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("tauri.conf.json", TAURI_CONF_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("index.html", INDEX_HTML_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("main.tsx", MAIN_TSX_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("App.tsx", APP_TSX_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("engine.ts", ENGINE_TS_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("styles.css", STYLES_CSS_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("Cargo.toml", CARGO_TOML_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        handlebars
            .register_template_string("lib.rs", LIB_RS_TEMPLATE)
            .map_err(|e| BuildError::Template(e.to_string()))?;

        Ok(Self { handlebars })
    }

    pub fn render(&self, template_name: &str, data: &TemplateData) -> Result<String, BuildError> {
        self.handlebars
            .render(template_name, data)
            .map_err(|e| BuildError::Template(e.to_string()))
    }
}

impl Default for TemplateManager {
    fn default() -> Self {
        Self::new().expect("Failed to create template manager")
    }
}

// ========== Templates ==========

const PACKAGE_JSON_TEMPLATE: &str = r#"{
  "name": "{{project_name}}",
  "version": "{{project_version}}",
  "description": "{{project_description}}",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "solid-js": "^1.8.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vite-plugin-solid": "^2.8.0"
  }
}
"#;

const TAURI_CONF_TEMPLATE: &str = r#"{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "{{project_name}}",
  "version": "{{project_version}}",
  "identifier": "com.forvanced.trainer.{{project_name}}",
  "build": {
    "beforeBuildCommand": "bun run build",
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "{{window_title}}",
        "width": {{window_width}},
        "height": {{window_height}},
        "resizable": true,
        "decorations": true,
        "alwaysOnTop": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
"#;

const INDEX_HTML_TEMPLATE: &str = r#"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{window_title}}</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"#;

const MAIN_TSX_TEMPLATE: &str = r#"/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
"#;

const APP_TSX_TEMPLATE: &str = r#"import { Component, onMount, createSignal } from "solid-js";
import { cheatEngine } from "./engine";
import TrainerUI from "./TrainerUI";

const App: Component = () => {
  const [connected, setConnected] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      {{#if process_name}}
      await cheatEngine.attach("{{process_name}}");
      {{else}}
      // No target process configured - manual attach required
      {{/if}}
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <div class="app {{theme}}">
      <header class="app-header">
        <h1>{{project_name}}</h1>
        <div class="status">
          {connected() ? (
            <span class="status-connected">Connected</span>
          ) : error() ? (
            <span class="status-error">{error()}</span>
          ) : (
            <span class="status-connecting">Connecting...</span>
          )}
        </div>
      </header>
      <main class="app-content">
        <TrainerUI />
      </main>
    </div>
  );
};

export default App;
"#;

const ENGINE_TS_TEMPLATE: &str = r#"import { invoke } from "@tauri-apps/api/core";

class CheatEngine {
  private attached = false;
  private processName: string | null = null;

  async attach(processName: string): Promise<void> {
    await invoke("attach_process", { processName });
    this.attached = true;
    this.processName = processName;
  }

  async detach(): Promise<void> {
    if (this.attached) {
      await invoke("detach_process");
      this.attached = false;
      this.processName = null;
    }
  }

  async memoryRead(address: string, valueType: string): Promise<unknown> {
    return invoke("memory_read", { address, valueType });
  }

  async memoryWrite(address: string, value: string, valueType: string): Promise<void> {
    await invoke("memory_write", { address, value, valueType });
  }

  async memoryFreeze(address: string, value: string, valueType: string, intervalMs: number): Promise<void> {
    await invoke("memory_freeze", { address, value, valueType, intervalMs });
  }

  async memoryUnfreeze(address: string): Promise<void> {
    await invoke("memory_unfreeze", { address });
  }

  async patternScan(pattern: string, protection: string): Promise<string[]> {
    return invoke("pattern_scan", { pattern, protection });
  }

  async valueScan(value: string, valueType: string): Promise<string[]> {
    return invoke("value_scan", { value, valueType });
  }

  async hookFunction(address: string, options: { logEnter: boolean; logLeave: boolean }): Promise<void> {
    await invoke("hook_function", { address, ...options });
  }

  async replaceReturn(address: string, value: number): Promise<void> {
    await invoke("replace_return", { address, value });
  }

  async nopFunction(address: string): Promise<void> {
    await invoke("nop_function", { address });
  }

  async javaHookMethod(className: string, methodName: string, overload?: string): Promise<void> {
    await invoke("java_hook_method", { className, methodName, overload });
  }

  async javaModifyReturn(className: string, methodName: string, value: unknown): Promise<void> {
    await invoke("java_modify_return", { className, methodName, value });
  }

  async javaCallMethod(className: string, methodName: string, isStatic: boolean): Promise<unknown> {
    return invoke("java_call_method", { className, methodName, isStatic });
  }

  async objcHookMethod(className: string, selector: string, isClassMethod: boolean): Promise<void> {
    await invoke("objc_hook_method", { className, selector, isClassMethod });
  }

  async objcModifyReturn(className: string, selector: string, value: unknown): Promise<void> {
    await invoke("objc_modify_return", { className, selector, value });
  }

  async swiftHookFunction(mangledName: string): Promise<void> {
    await invoke("swift_hook_function", { mangledName });
  }

  async listModules(): Promise<unknown[]> {
    return invoke("list_modules");
  }

  async findExport(moduleName: string, exportName: string): Promise<string | null> {
    return invoke("find_export", { moduleName, exportName });
  }

  async executeCustom(script: string): Promise<unknown> {
    return invoke("execute_custom_script", { script });
  }
}

export const cheatEngine = new CheatEngine();
"#;

const STYLES_CSS_TEMPLATE: &str = r#":root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-surface: #0f3460;
  --text-primary: #eaeaea;
  --text-secondary: #a0a0a0;
  --accent: #e94560;
  --accent-hover: #ff6b6b;
  --success: #4ecca3;
  --error: #ff6b6b;
  --border: #2d3548;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}

.app-header h1 {
  font-size: 16px;
  font-weight: 600;
}

.status {
  font-size: 12px;
}

.status-connected {
  color: var(--success);
}

.status-connecting {
  color: var(--text-secondary);
}

.status-error {
  color: var(--error);
}

.app-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.trainer-container {
  position: relative;
  background: var(--bg-secondary);
  border-radius: 8px;
  min-height: 100%;
}

.trainer-button {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.trainer-button:hover {
  background: var(--accent-hover);
}

.trainer-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.trainer-toggle input {
  width: 40px;
  height: 20px;
  accent-color: var(--accent);
}

.trainer-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trainer-slider label {
  font-size: 12px;
  color: var(--text-secondary);
}

.trainer-slider input {
  width: 100%;
  accent-color: var(--accent);
}

.trainer-label {
  font-size: 14px;
  color: var(--text-primary);
}

.trainer-input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 14px;
}

.trainer-input:focus {
  outline: none;
  border-color: var(--accent);
}

.trainer-dropdown {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 14px;
}

.trainer-group {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.trainer-group legend {
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.trainer-spacer {
  /* Empty spacer */
}
"#;

const CARGO_TOML_TEMPLATE: &str = r#"[package]
name = "{{project_name}}"
version = "{{project_version}}"
edition = "2021"

[lib]
name = "{{lib_name}}_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = "2"

[dependencies]
tauri = { version = "2", features = ["devtools"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"

# Note: Frida integration is embedded in the generated code
# For standalone distribution, frida-rust should be added as dependency:
# frida = "0.17"
"#;

const LIB_RS_TEMPLATE: &str = r#"use tauri::Manager;

mod engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = engine::CheatEngineState::new();
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine::attach_process,
            engine::detach_process,
            engine::memory_read,
            engine::memory_write,
            engine::memory_freeze,
            engine::memory_unfreeze,
            engine::pattern_scan,
            engine::value_scan,
            engine::hook_function,
            engine::replace_return,
            engine::nop_function,
            engine::java_hook_method,
            engine::java_modify_return,
            engine::java_call_method,
            engine::objc_hook_method,
            engine::objc_modify_return,
            engine::swift_hook_function,
            engine::list_modules,
            engine::find_export,
            engine::execute_custom_script,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
"#;
