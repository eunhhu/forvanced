import { Component, createSignal, createResource, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ProjectUI } from "./components/ProjectUI";

// Types matching backend
interface ProjectConfig {
  name: string;
  target_process: string | null;
  components: UIComponent[];
  scripts: Script[];
  canvas: CanvasSettings;
}

interface CanvasSettings {
  width: number;
  height: number;
  padding: number;
  gap: number;
}

interface UIComponent {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  parentId?: string;
  children?: string[];
  zIndex: number;
  visible?: boolean;
  widthMode?: string;
  heightMode?: string;
}

interface Script {
  id: string;
  name: string;
  nodes: ScriptNode[];
  connections: ScriptConnection[];
}

interface ScriptNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface ScriptConnection {
  id: string;
  sourceNode: string;
  sourcePort: string;
  targetNode: string;
  targetPort: string;
}

// Connection state
type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

const App: Component = () => {
  const [connectionState, setConnectionState] = createSignal<ConnectionState>("disconnected");
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [processName, setProcessName] = createSignal("");

  // Fetch project config from backend
  const [config] = createResource(async () => {
    try {
      const result = await invoke<ProjectConfig>("get_project_config");
      // If there's a target process, try to auto-connect
      if (result.target_process) {
        setProcessName(result.target_process);
      }
      return result;
    } catch (e) {
      console.error("Failed to load project config:", e);
      throw e;
    }
  });

  const handleConnect = async () => {
    const name = processName().trim();
    if (!name) {
      setErrorMessage("Please enter a process name");
      return;
    }

    setConnectionState("connecting");
    setErrorMessage(null);

    try {
      await invoke("attach_process", { processName: name });
      setConnectionState("connected");
    } catch (e) {
      console.error("Failed to attach:", e);
      setConnectionState("error");
      setErrorMessage(String(e));
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("detach_process");
      setConnectionState("disconnected");
    } catch (e) {
      console.error("Failed to detach:", e);
    }
  };

  return (
    <div class="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Title bar */}
      <div class="h-8 bg-background-secondary border-b border-border flex items-center justify-between px-3 shrink-0 drag-region">
        <span class="text-xs font-medium text-foreground no-drag">
          {config()?.name ?? "Project"}
        </span>
        <div class="flex items-center gap-2 no-drag">
          <Show when={connectionState() === "connected"}>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-success" />
              <span class="text-xs text-foreground-muted">Connected</span>
            </div>
          </Show>
          <Show when={connectionState() === "disconnected" || connectionState() === "error"}>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-foreground-muted" />
              <span class="text-xs text-foreground-muted">Disconnected</span>
            </div>
          </Show>
          <Show when={connectionState() === "connecting"}>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span class="text-xs text-foreground-muted">Connecting...</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Connection panel (shown when disconnected) */}
      <Show when={connectionState() !== "connected"}>
        <div class="p-4 border-b border-border bg-surface shrink-0">
          <div class="flex flex-col gap-3">
            <div class="flex gap-2">
              <input
                type="text"
                class="flex-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
                placeholder="Process name (e.g., game.exe)"
                value={processName()}
                onInput={(e) => setProcessName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                disabled={connectionState() === "connecting"}
              />
              <button
                class="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                onClick={handleConnect}
                disabled={connectionState() === "connecting"}
              >
                {connectionState() === "connecting" ? "Connecting..." : "Connect"}
              </button>
            </div>
            <Show when={errorMessage()}>
              <div class="text-xs text-error bg-error/10 px-3 py-2 rounded">
                {errorMessage()}
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* Connected: show disconnect option */}
      <Show when={connectionState() === "connected"}>
        <div class="px-4 py-2 border-b border-border bg-surface shrink-0 flex items-center justify-between">
          <span class="text-xs text-foreground-muted">
            Connected to: <span class="text-foreground">{processName()}</span>
          </span>
          <button
            class="text-xs text-foreground-muted hover:text-error transition-colors"
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </div>
      </Show>

      {/* Main content */}
      <div class="flex-1 overflow-auto">
        <Show when={config()} fallback={
          <div class="flex items-center justify-center h-full">
            <span class="text-foreground-muted">Loading...</span>
          </div>
        }>
          {(cfg) => (
            <ProjectUI
              config={cfg()}
              isConnected={connectionState() === "connected"}
            />
          )}
        </Show>
      </div>
    </div>
  );
};

export default App;
