export interface ProcessInfo {
  pid: number;
  name: string;
  path?: string;
}

export interface ApplicationInfo {
  identifier: string;
  name: string;
  pid?: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  device_type: "local" | "usb" | "remote";
}

export type AttachMode = "pid" | "name" | "identifier";

// Check if running in Tauri environment (Tauri 2.0 uses __TAURI_INTERNALS__)
function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Dynamic import for Tauri API
async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    // Return mock data in browser environment (for E2E tests)
    console.log(`[Mock] ${cmd}`, args);
    return getMockResponse<T>(cmd, args);
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// Mock responses for browser/test environment
function getMockResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  const mocks: Record<string, unknown> = {
    // Device commands
    list_devices: [
      { id: "local", name: "Local System", device_type: "local" },
      { id: "usb-iphone", name: "iPhone (USB)", device_type: "usb" },
      { id: "usb-android", name: "Pixel 8 (USB)", device_type: "usb" },
    ],
    select_device: undefined,
    get_current_device: "local",
    add_remote_device: {
      id: `remote-${args?.address || "unknown"}`,
      name: `Remote @ ${args?.address || "unknown"}`,
      device_type: "remote",
    },
    // Process commands
    enumerate_processes: [
      { pid: 1, name: "launchd" },
      { pid: 100, name: "WindowServer" },
      { pid: 200, name: "Finder", path: "/System/Library/CoreServices/Finder.app" },
      { pid: 300, name: "Safari", path: "/Applications/Safari.app" },
      { pid: 400, name: "Terminal", path: "/Applications/Utilities/Terminal.app" },
      { pid: 500, name: "Xcode", path: "/Applications/Xcode.app" },
      { pid: 600, name: "Code", path: "/Applications/Visual Studio Code.app" },
      { pid: 700, name: "Discord", path: "/Applications/Discord.app" },
      { pid: 800, name: "Chrome", path: "/Applications/Google Chrome.app" },
      { pid: 900, name: "ExampleGame", path: "/Users/user/Games/ExampleGame.app" },
    ],
    enumerate_applications: [
      { identifier: "com.apple.mobilesafari", name: "Safari", pid: 1001 },
      { identifier: "com.spotify.client", name: "Spotify", pid: 1002 },
      { identifier: "com.instagram.ios", name: "Instagram" },
      { identifier: "com.example.targetgame", name: "Target Game", pid: 1003 },
    ],
    attach_to_process: `mock-session-${args?.pid || "unknown"}`,
    attach_by_name: `mock-session-name-${args?.name || "unknown"}`,
    attach_by_identifier: `mock-session-id-${args?.identifier || "unknown"}`,
    spawn_and_attach: `mock-session-spawn-${args?.identifier || "unknown"}`,
    detach_from_process: undefined,
    inject_script: `mock-script-${Date.now()}`,
    unload_script: undefined,
    // Project commands
    create_project: {
      id: `project-${Date.now()}`,
      name: args?.name || "New Project",
      version: "1.0.0",
      description: null,
      author: null,
      config: {
        target: {
          process_name: null,
          process_patterns: [],
          adapter_type: "local_pc",
          adapter_config: {},
          auto_attach: false,
        },
        build: {
          output_name: null,
          targets: ["windows"],
          icon: null,
          bundle_frida: false,
        },
        hotkeys: { enabled: true, bindings: [] },
      },
      ui: { components: [], width: 400, height: 500, theme: "dark" },
      scripts: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    save_project: undefined,
    load_project: {
      id: `project-${Date.now()}`,
      name: "Loaded Project",
      version: "1.0.0",
      description: null,
      author: null,
      config: {
        target: {
          process_name: null,
          process_patterns: [],
          adapter_type: "local_pc",
          adapter_config: {},
          auto_attach: false,
        },
        build: {
          output_name: null,
          targets: ["windows"],
          icon: null,
          bundle_frida: false,
        },
        hotkeys: { enabled: true, bindings: [] },
      },
      ui: { components: [], width: 400, height: 500, theme: "dark" },
      scripts: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    get_recent_projects: [],
    remove_recent_project: undefined,
  };

  return (mocks[cmd] ?? null) as T;
}

// Device commands
export async function listDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("list_devices");
}

export async function selectDevice(deviceId: string): Promise<void> {
  return invoke<void>("select_device", { deviceId });
}

export async function getCurrentDevice(): Promise<string | null> {
  return invoke<string | null>("get_current_device");
}

export async function addRemoteDevice(address: string): Promise<DeviceInfo> {
  return invoke<DeviceInfo>("add_remote_device", { address });
}

// Process commands
export async function enumerateProcesses(): Promise<ProcessInfo[]> {
  return invoke<ProcessInfo[]>("enumerate_processes");
}

export async function enumerateApplications(): Promise<ApplicationInfo[]> {
  return invoke<ApplicationInfo[]>("enumerate_applications");
}

export async function attachToProcess(pid: number): Promise<string> {
  return invoke<string>("attach_to_process", { pid });
}

export async function attachByName(name: string): Promise<string> {
  return invoke<string>("attach_by_name", { name });
}

export async function attachByIdentifier(identifier: string): Promise<string> {
  return invoke<string>("attach_by_identifier", { identifier });
}

export async function spawnAndAttach(identifier: string): Promise<string> {
  return invoke<string>("spawn_and_attach", { identifier });
}

export async function detachFromProcess(sessionId: string): Promise<void> {
  return invoke<void>("detach_from_process", { sessionId });
}

// Script commands
export async function injectScript(
  sessionId: string,
  script: string,
): Promise<string> {
  return invoke<string>("inject_script", { sessionId, script });
}

export async function unloadScript(
  sessionId: string,
  scriptId: string,
): Promise<void> {
  return invoke<void>("unload_script", { sessionId, scriptId });
}

// RPC commands
export async function callRpc(
  sessionId: string,
  scriptId: string,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  return invoke<unknown>("call_rpc", { sessionId, scriptId, method, args });
}

// Message types from Frida scripts
export type FridaMessageType = "log" | "send" | "error" | "rpc";

export interface FridaLogMessage {
  type: "log";
  level: string;
  text: string;
}

export interface FridaSendMessage {
  type: "send";
  payload: unknown;
}

export interface FridaErrorMessage {
  type: "error";
  description: string;
  stack?: string;
  fileName?: string;
  lineNumber?: number;
}

export interface FridaRpcMessage {
  type: "rpc";
  id: number;
  result: {
    status: "ok" | "error";
    value?: unknown;
    message?: string;
  };
}

export type FridaMessage =
  | FridaLogMessage
  | FridaSendMessage
  | FridaErrorMessage
  | FridaRpcMessage;

export interface FridaMessageEvent {
  sessionId: string;
  scriptId: string;
  message: FridaMessage;
}

// Subscribe to Frida messages for a session
export async function subscribeToMessages(sessionId: string): Promise<void> {
  return invoke<void>("subscribe_to_messages", { sessionId });
}

// Listen for Frida message events
export async function onFridaMessage(
  callback: (event: FridaMessageEvent) => void,
): Promise<() => void> {
  if (!isTauri()) {
    console.log("[Mock] onFridaMessage subscribed");
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<FridaMessageEvent>("frida-message", (event) => {
    callback(event.payload);
  });

  return unlisten;
}

// Simulate a Frida message (mock mode only, for testing)
export async function simulateFridaMessage(
  sessionId: string,
  scriptId: string,
  messageType: FridaMessageType,
  payload: Record<string, unknown>,
): Promise<void> {
  return invoke<void>("simulate_frida_message", {
    sessionId,
    scriptId,
    messageType,
    payload,
  });
}

// ============================================
// Script Executor Commands
// ============================================

export interface ScriptData {
  id: string;
  name: string;
  description?: string;
  variables: VariableData[];
  nodes: NodeData[];
  connections: ConnectionData[];
}

export interface VariableData {
  id: string;
  name: string;
  valueType: string;
  defaultValue: unknown;
}

export interface NodeData {
  id: string;
  nodeType: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  inputs: PortData[];
  outputs: PortData[];
}

export interface PortData {
  id: string;
  name: string;
  portType: string;
  valueType?: string;
  direction: string;
}

export interface ConnectionData {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface ExecutionResult {
  success: boolean;
  variables: Record<string, unknown>;
  logs: string[];
  error?: string;
}

/**
 * Execute a visual script from the Rust backend.
 * Host nodes run in Rust, target nodes are sent to Frida via RPC.
 */
export async function executeScript(
  script: ScriptData,
  eventNodeId: string,
  eventValue: unknown = null,
  componentId?: string,
): Promise<ExecutionResult> {
  return invoke<ExecutionResult>("execute_script", {
    script,
    eventNodeId,
    eventValue,
    componentId,
  });
}

/**
 * Set the Frida session for target node execution.
 * Must be called after attaching to a process and injecting a Frida agent script.
 */
export async function setExecutorSession(
  sessionId: string,
  scriptId: string,
): Promise<void> {
  return invoke<void>("set_executor_session", { sessionId, scriptId });
}

/**
 * Clear the executor session.
 */
export async function clearExecutorSession(): Promise<void> {
  return invoke<void>("clear_executor_session");
}

/**
 * Set a UI component value (syncs frontend state to backend).
 */
export async function setUiValue(
  componentId: string,
  value: unknown,
): Promise<void> {
  return invoke<void>("set_ui_value", { componentId, value });
}

/**
 * Get a UI component value from the backend.
 */
export async function getUiValue(componentId: string): Promise<unknown> {
  return invoke<unknown>("get_ui_value", { componentId });
}

/**
 * Get all UI component values from the backend.
 */
export async function getAllUiValues(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("get_all_ui_values");
}

/**
 * Batch set multiple UI component values.
 */
export async function setUiValuesBatch(
  values: Record<string, unknown>,
): Promise<void> {
  return invoke<void>("set_ui_values_batch", { values });
}
