export interface ProcessInfo {
  pid: number;
  name: string;
  path?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  device_type: "local" | "usb" | "remote";
}

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
    attach_to_process: `mock-session-${args?.pid || "unknown"}`,
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

export async function attachToProcess(pid: number): Promise<string> {
  return invoke<string>("attach_to_process", { pid });
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
