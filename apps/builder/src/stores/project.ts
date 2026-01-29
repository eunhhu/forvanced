import { createSignal, createRoot } from "solid-js";

// Check if running in Tauri environment (evaluated at call time)
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Dynamic invoke wrapper
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.log(`[Mock] ${cmd}`, args);
    return getMockProjectResponse<T>(cmd, args);
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// Mock responses for project commands
function getMockProjectResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  const now = Date.now();
  const mocks: Record<string, unknown> = {
    create_project: {
      id: `project-${now}`,
      name: args?.name || "New Project",
      description: null,
      version: "1.0.0",
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
        hotkeys: {
          enabled: true,
          bindings: [],
        },
      },
      ui: {
        components: [],
        width: 400,
        height: 500,
        theme: "dark",
      },
      created_at: now,
      updated_at: now,
    },
    save_project: args?.path || `/tmp/project-${now}.forvanced`,
    load_project: {
      id: `loaded-${now}`,
      name: "Loaded Project",
      description: null,
      version: "1.0.0",
      author: null,
      config: {
        target: { process_name: null, process_patterns: [], adapter_type: "local_pc", adapter_config: {}, auto_attach: false },
        build: { output_name: null, targets: ["windows"], icon: null, bundle_frida: false },
        hotkeys: { enabled: true, bindings: [] },
      },
      ui: { components: [], width: 400, height: 500, theme: "dark" },
      created_at: now,
      updated_at: now,
    },
    close_project: undefined,
    update_project: undefined,
    get_recent_projects: [
      { name: "Example Project", path: "/mock/example.forvanced", last_opened: Date.now() - 86400000 },
      { name: "My Trainer", path: "/mock/trainer.forvanced", last_opened: Date.now() - 172800000 },
    ],
    remove_recent_project: undefined,
  };
  return (mocks[cmd] ?? null) as T;
}

// Recent project entry type
export interface RecentProjectEntry {
  name: string;
  path: string;
  last_opened: number;
}

// Dynamic dialog helpers
async function saveDialogTauri(defaultName: string): Promise<string | null> {
  if (!isTauri()) {
    return `/mock/path/${defaultName}.forvanced`;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: `${defaultName}.forvanced`,
    filters: [{ name: "Forvanced Project", extensions: ["forvanced"] }],
  });
}

async function openDialogTauri(): Promise<string | null> {
  if (!isTauri()) {
    return null; // In test mode, open dialog returns null
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    multiple: false,
    filters: [{ name: "Forvanced Project", extensions: ["forvanced"] }],
  });
  return result as string | null;
}

// Project types (matching Rust schema)
export interface Project {
  id: string;
  name: string;
  description: string | null;
  version: string;
  author: string | null;
  config: ProjectConfig;
  ui: UILayout;
  created_at: number;
  updated_at: number;
}

export interface ProjectConfig {
  target: TargetConfig;
  build: BuildConfig;
  hotkeys: HotkeyConfig;
}

export interface TargetConfig {
  process_name: string | null;
  process_patterns: string[];
  adapter_type: string;
  adapter_config: unknown;
  auto_attach: boolean;
}

export interface BuildConfig {
  output_name: string | null;
  targets: string[];
  icon: string | null;
  bundle_frida: boolean;
}

export interface HotkeyConfig {
  enabled: boolean;
  bindings: HotkeyBinding[];
}

export interface HotkeyBinding {
  key: string;
  modifiers: string[];
  action_id: string;
}

export interface UILayout {
  components: UIComponent[];
  width: number;
  height: number;
  theme: string;
}

// Simplified UIComponent - actions are now handled by visual scripts with Event Listener nodes
export interface UIComponent {
  id: string;
  type: ComponentType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  // Note: bindings removed - use visual scripts with event_ui nodes instead
}

export type ComponentType =
  | "button"
  | "toggle"
  | "slider"
  | "label"
  | "input"
  | "dropdown"
  | "group"
  | "spacer";

// Legacy types kept for backward compatibility with old project files
export interface ActionBinding {
  id: string;
  event: ComponentEvent;
  action: FridaAction;
}

export type ComponentEvent = "onClick" | "onToggle" | "onChange" | "onSlide";

export type FridaAction =
  | { type: "memory_read"; address: string; value_type: ValueType }
  | { type: "memory_write"; address: string; value: string; value_type: ValueType }
  | { type: "memory_freeze"; address: string; value: string; value_type: ValueType; interval_ms: number }
  | { type: "memory_unfreeze"; address: string }
  | { type: "pattern_scan"; pattern: string; protection: string }
  | { type: "value_scan"; value: string; value_type: ValueType }
  | { type: "hook_function"; address: string; log_enter: boolean; log_leave: boolean }
  | { type: "replace_return"; address: string; return_value: string }
  | { type: "nop_function"; address: string }
  | { type: "java_hook_method"; class_name: string; method_name: string; overload: string | null }
  | { type: "java_modify_return"; class_name: string; method_name: string; return_value: string }
  | { type: "java_call_method"; class_name: string; method_name: string; is_static: boolean }
  | { type: "objc_hook_method"; class_name: string; selector: string; is_class_method: boolean }
  | { type: "objc_modify_return"; class_name: string; selector: string; return_value: string }
  | { type: "swift_hook_function"; mangled_name: string }
  | { type: "list_modules" }
  | { type: "find_export"; module_name: string; export_name: string }
  | { type: "custom"; script: string };

export type ValueType =
  | "int8"
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "int64"
  | "uint64"
  | "float"
  | "double"
  | "pointer"
  | "string";

function createProjectStore() {
  const [currentProject, setCurrentProject] = createSignal<Project | null>(null);
  const [projectPath, setProjectPath] = createSignal<string | null>(null);
  const [isDirty, setIsDirty] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [recentProjects, setRecentProjects] = createSignal<RecentProjectEntry[]>([]);

  async function createNew(name: string): Promise<Project> {
    setIsLoading(true);
    setError(null);
    try {
      const project = await invoke<Project>("create_project", { name });
      setCurrentProject(project);
      setProjectPath(null);
      setIsDirty(true);
      return project;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }

  async function save(path?: string): Promise<string> {
    const project = currentProject();
    if (!project) throw new Error("No project to save");

    setIsLoading(true);
    setError(null);
    try {
      const savedPath = await invoke<string>("save_project", {
        project,
        path: path ?? projectPath(),
      });
      setProjectPath(savedPath);
      setIsDirty(false);
      return savedPath;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }

  async function saveAs(): Promise<string | null> {
    const project = currentProject();
    if (!project) throw new Error("No project to save");

    const path = await saveDialog(project.name);
    if (!path) return null;

    return save(path);
  }

  async function load(path: string): Promise<Project> {
    setIsLoading(true);
    setError(null);
    try {
      const project = await invoke<Project>("load_project", { path });
      setCurrentProject(project);
      setProjectPath(path);
      setIsDirty(false);
      return project;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }

  async function openFile(): Promise<Project | null> {
    const path = await openDialog();
    if (!path) return null;
    return load(path);
  }

  async function close() {
    setIsLoading(true);
    try {
      await invoke("close_project");
      setCurrentProject(null);
      setProjectPath(null);
      setIsDirty(false);
    } finally {
      setIsLoading(false);
    }
  }

  // Debounce timer for backend sync
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  function updateProject(updates: Partial<Project>) {
    const project = currentProject();
    if (!project) return;

    const updated = {
      ...project,
      ...updates,
      updated_at: Date.now(),
    };
    setCurrentProject(updated);
    setIsDirty(true);

    // Debounced sync to backend (500ms delay)
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      invoke("update_project", { project: updated }).catch(console.error);
      syncTimer = null;
    }, 500);
  }

  function updateUI(ui: UILayout) {
    updateProject({ ui });
  }

  function updateConfig(config: Partial<ProjectConfig>) {
    const project = currentProject();
    if (!project) return;
    updateProject({
      config: { ...project.config, ...config },
    });
  }

  async function fetchRecentProjects(): Promise<RecentProjectEntry[]> {
    try {
      const projects = await invoke<RecentProjectEntry[]>("get_recent_projects");
      setRecentProjects(projects);
      return projects;
    } catch (e) {
      console.error("Failed to fetch recent projects:", e);
      return [];
    }
  }

  async function removeRecentProject(path: string): Promise<void> {
    try {
      await invoke("remove_recent_project", { path });
      setRecentProjects((prev) => prev.filter((p) => p.path !== path));
    } catch (e) {
      console.error("Failed to remove recent project:", e);
    }
  }

  async function openRecentProject(path: string): Promise<Project | null> {
    return load(path);
  }

  return {
    currentProject,
    projectPath,
    isDirty,
    isLoading,
    error,
    recentProjects,
    createNew,
    save,
    saveAs,
    load,
    openFile,
    close,
    updateProject,
    updateUI,
    updateConfig,
    fetchRecentProjects,
    removeRecentProject,
    openRecentProject,
  };
}

// Dialog helpers (use the dynamic wrappers)
async function saveDialog(defaultName: string): Promise<string | null> {
  return saveDialogTauri(defaultName);
}

async function openDialog(): Promise<string | null> {
  return openDialogTauri();
}

export const projectStore = createRoot(createProjectStore);
