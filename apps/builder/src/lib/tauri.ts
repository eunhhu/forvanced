export interface ProcessInfo {
  pid: number;
  name: string;
  path?: string;
}

export interface AdapterInfo {
  id: string;
  name: string;
  connected: boolean;
}

// Check if running in Tauri environment (evaluated at call time, not module load time)
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Dynamic import for Tauri API
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
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
    enumerate_processes: [
      { pid: 1234, name: "example.exe", path: "/usr/bin/example" },
      { pid: 5678, name: "game.exe", path: "C:\\Games\\game.exe" },
      { pid: 9012, name: "process.app", path: "/Applications/process.app" },
    ],
    attach_to_process: `mock-session-${args?.pid || "unknown"}`,
    detach_from_process: undefined,
    list_adapters: [
      { id: "local_pc", name: "Local PC", connected: true },
      { id: "usb_device", name: "USB Device", connected: false },
    ],
    select_adapter: undefined,
    get_current_adapter: "local_pc",
    inject_script: `mock-script-${Date.now()}`,
    unload_script: undefined,
    // Project commands
    create_project: { name: args?.name || "New Project", version: "1.0.0", ui: { components: [] }, scripts: [] },
    save_project: undefined,
    load_project: { name: "Loaded Project", version: "1.0.0", ui: { components: [] }, scripts: [] },
    get_recent_projects: [],
    remove_recent_project: undefined,
  };

  return (mocks[cmd] ?? null) as T;
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

// Adapter commands
export async function listAdapters(): Promise<AdapterInfo[]> {
  return invoke<AdapterInfo[]>("list_adapters");
}

export async function selectAdapter(adapterId: string): Promise<void> {
  return invoke<void>("select_adapter", { adapterId });
}

export async function getCurrentAdapter(): Promise<string | null> {
  return invoke<string | null>("get_current_adapter");
}

// Script commands
export async function injectScript(
  sessionId: string,
  script: string
): Promise<string> {
  return invoke<string>("inject_script", { sessionId, script });
}

export async function unloadScript(
  sessionId: string,
  scriptId: string
): Promise<void> {
  return invoke<void>("unload_script", { sessionId, scriptId });
}
