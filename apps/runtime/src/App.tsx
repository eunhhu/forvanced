import { Component, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProjectUI } from "./components/ProjectUI";

// Notification type from backend
interface NotificationEvent {
  title: string;
  message: string;
  level: string;
}

interface Toast {
  id: number;
  title: string;
  message: string;
  level: string;
}

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

const App: Component = () => {
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  let toastId = 0;

  // Listen for notification events from backend
  onMount(async () => {
    const unlisten = await listen<NotificationEvent>("notification", (event) => {
      const id = ++toastId;
      const toast: Toast = {
        id,
        title: event.payload.title,
        message: event.payload.message,
        level: event.payload.level,
      };
      setToasts((prev) => [...prev, toast]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    });

    onCleanup(() => {
      unlisten();
    });
  });

  // Fetch project config from backend
  const [config] = createResource(async () => {
    try {
      const result = await invoke<ProjectConfig>("get_project_config");
      return result;
    } catch (e) {
      console.error("Failed to load project config:", e);
      throw e;
    }
  });

  const getToastColor = (level: string) => {
    switch (level) {
      case "error": return "bg-red-600";
      case "warning": return "bg-yellow-600";
      case "success": return "bg-green-600";
      default: return "bg-blue-600";
    }
  };

  return (
    <div class="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Title bar */}
      <div class="h-8 bg-background-secondary border-b border-border flex items-center justify-between px-3 shrink-0 drag-region">
        <span class="text-xs font-medium text-foreground no-drag">
          {config()?.name ?? "Project"}
        </span>
      </div>

      {/* Main content */}
      <div class="flex-1 overflow-auto">
        <Show when={config()} fallback={
          <div class="flex items-center justify-center h-full">
            <span class="text-foreground-muted">Loading...</span>
          </div>
        }>
          {(cfg) => (
            <ProjectUI config={cfg()} />
          )}
        </Show>
      </div>

      {/* Toast notifications */}
      <div class="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        <For each={toasts()}>
          {(toast) => (
            <div
              class={`${getToastColor(toast.level)} text-white px-4 py-3 rounded-lg shadow-lg max-w-sm animate-slide-in`}
            >
              <div class="font-medium text-sm">{toast.title}</div>
              <div class="text-xs opacity-90">{toast.message}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default App;
