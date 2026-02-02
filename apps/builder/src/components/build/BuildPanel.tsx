import {
  Component,
  createSignal,
  Show,
  For,
  createEffect,
  untrack,
  onMount,
  onCleanup,
} from "solid-js";
import { projectStore } from "@/stores/project";

// Check if running in Tauri environment (evaluated at call time)
function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Dynamic invoke wrapper
async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    console.log(`[Mock] ${cmd}`, args);
    return getMockBuildResponse<T>(cmd, args);
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// Mock responses for build commands
function getMockBuildResponse<T>(
  cmd: string,
  args?: Record<string, unknown>,
): T {
  const mocks: Record<string, unknown> = {
    build_project: {
      project_dir: "/mock/output/project",
      executables: ["/mock/output/project/trainer.exe"],
      target: (args?.config as Record<string, unknown>)?.target || "current",
    },
    generate_project: "/mock/output/generated-project",
    preview_generated_code: {
      ui_code: `// Generated UI Code (TSX)
import { Component } from "solid-js";

export const ProjectUI: Component = () => {
  return (
    <div class="trainer-container">
      <h1>My Project</h1>
      {/* Components would be rendered here */}
    </div>
  );
};`,
      frida_script: `// Generated Frida Script
console.log("[*] Project attached!");

// Memory operations would be generated here
// Based on component bindings
`,
    },
    is_build_in_progress: false,
  };
  return (mocks[cmd] ?? null) as T;
}

import {
  PlayIcon,
  FolderOpenIcon,
  CodeIcon,
  SettingsIcon,
  IconX,
} from "@/components/common/Icons";

interface BuildConfig {
  output_dir: string;
  target: string;
  release: boolean;
  bundle_frida: boolean;
  project_path?: string;
}

interface BuildResult {
  project_dir: string;
  executables: string[];
  target: string;
}

interface PreviewCode {
  ui_code: string;
  frida_script: string;
}

interface BuildLogEvent {
  message: string;
  level: string;
  timestamp: number;
}

interface BuildState {
  is_building: boolean;
  phase: string;
  progress: number;
}

// Phase display names
const phaseNames: Record<string, string> = {
  initializing: "Initializing...",
  generating: "Generating project files...",
  installing_deps: "Installing dependencies...",
  building_frontend: "Building frontend...",
  building: "Building Tauri application...",
  finalizing: "Finalizing...",
  complete: "Build complete!",
  error: "Build failed",
};

export const BuildPanel: Component = () => {
  const [buildTarget, setBuildTarget] = createSignal("current");
  const [releaseMode, setReleaseMode] = createSignal(true);
  const [bundleFrida, setBundleFrida] = createSignal(true);
  const [outputDir, setOutputDir] = createSignal("./dist");
  const [isBuilding, setIsBuilding] = createSignal(false);
  const [buildResult, setBuildResult] = createSignal<BuildResult | null>(null);
  const [buildError, setBuildError] = createSignal<string | null>(null);
  const [showPreview, setShowPreview] = createSignal(false);
  const [previewCode, setPreviewCode] = createSignal<PreviewCode | null>(null);
  const [previewTab, setPreviewTab] = createSignal<"ui" | "frida">("ui");

  // Build log state
  const [buildLogs, setBuildLogs] = createSignal<BuildLogEvent[]>([]);
  const [buildPhase, setBuildPhase] = createSignal<string>("");
  const [buildProgress, setBuildProgress] = createSignal<number>(0);
  const [showLogs, setShowLogs] = createSignal(false);
  let logContainerRef: HTMLDivElement | undefined;

  const buildTargets = [
    { value: "current", label: "Current Platform" },
    { value: "windows-x64", label: "Windows (x64)" },
    { value: "macos-arm64", label: "macOS (Apple Silicon)" },
    { value: "macos-x64", label: "macOS (Intel)" },
    { value: "linux-x64", label: "Linux (x64)" },
  ];

  // Subscribe to build events
  onMount(async () => {
    if (!isTauri()) return;

    try {
      const { listen } = await import("@tauri-apps/api/event");

      // Listen for build log events
      const unlistenLog = await listen<BuildLogEvent>("build-log", (event) => {
        setBuildLogs((prev) => [...prev, event.payload]);
        // Auto-scroll to bottom
        if (logContainerRef) {
          setTimeout(() => {
            logContainerRef!.scrollTop = logContainerRef!.scrollHeight;
          }, 10);
        }
      });

      // Listen for build state events
      const unlistenState = await listen<BuildState>("build-state", (event) => {
        setIsBuilding(event.payload.is_building);
        setBuildPhase(event.payload.phase);
        setBuildProgress(event.payload.progress);

        // Show logs panel when build starts
        if (event.payload.is_building && !showLogs()) {
          setShowLogs(true);
        }
      });

      onCleanup(() => {
        unlistenLog();
        unlistenState();
      });
    } catch (e) {
      console.error("Failed to set up build event listeners:", e);
    }
  });

  const handleBuild = async () => {
    const project = projectStore.currentProject();
    if (!project) {
      setBuildError("No project loaded");
      return;
    }

    // Check if project needs to be saved first
    const projectPath = projectStore.projectPath();
    if (!projectPath && projectStore.isDirty()) {
      setBuildError(
        "Please save the project before building. The output directory path is resolved relative to the project file location."
      );
      return;
    }

    setIsBuilding(true);
    setBuildError(null);
    setBuildResult(null);
    setBuildLogs([]);
    setShowLogs(true);

    try {
      const config: BuildConfig = {
        output_dir: outputDir(),
        target: buildTarget(),
        release: releaseMode(),
        bundle_frida: bundleFrida(),
        project_path: projectPath ?? undefined,
      };

      const result = await invoke<BuildResult>("build_project", { config });
      setBuildResult(result);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBuilding(false);
    }
  };

  const handleGenerateOnly = async () => {
    const project = projectStore.currentProject();
    if (!project) {
      setBuildError("No project loaded");
      return;
    }

    // Check if project needs to be saved first
    const projectPath = projectStore.projectPath();
    if (!projectPath && projectStore.isDirty()) {
      setBuildError(
        "Please save the project before generating. The output directory path is resolved relative to the project file location."
      );
      return;
    }

    setIsBuilding(true);
    setBuildError(null);
    setBuildLogs([]);
    setShowLogs(true);

    try {
      const projectDir = await invoke<string>("generate_project", {
        outputDir: outputDir(),
        projectPath: projectPath ?? undefined,
      });
      setBuildResult({
        project_dir: projectDir,
        executables: [],
        target: "generated",
      });
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBuilding(false);
    }
  };

  const handlePreview = async () => {
    if (!projectStore.currentProject()) return;

    try {
      const code = await invoke<PreviewCode>("preview_generated_code");
      setPreviewCode(code);
      setShowPreview(true);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      if (!isTauri()) {
        // Mock for browser/test environment
        setOutputDir("/mock/output/directory");
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Output Directory",
      });
      if (selected && typeof selected === "string") {
        setOutputDir(selected);
      }
    } catch (e) {
      console.error("Failed to select output directory:", e);
    }
  };

  const handleCancelBuild = async () => {
    try {
      await invoke("cancel_build");
    } catch (e) {
      console.error("Failed to cancel build:", e);
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "debug":
        return "text-gray-500";
      default:
        return "text-foreground-muted";
    }
  };

  return (
    <div class="h-full flex flex-col relative">
      {/* Build Lock Overlay with Log Panel */}
      <Show when={isBuilding()}>
        <div class="absolute inset-0 bg-black/50 z-40 flex flex-col backdrop-blur-sm">
          {/* Header with progress */}
          <div class="p-4 bg-surface/90 border-b border-border">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <div class="flex-1">
                <h3 class="font-medium">{phaseNames[buildPhase()] || "Building..."}</h3>
                <p class="text-xs text-foreground-muted">Do not close the app or modify files</p>
              </div>
              <button
                class="px-3 py-1 text-sm text-foreground-muted hover:text-error border border-border rounded hover:border-error transition-colors"
                onClick={handleCancelBuild}
              >
                Cancel
              </button>
            </div>

            {/* Progress bar */}
            <div class="w-full bg-background rounded-full h-2">
              <div
                class="bg-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${buildProgress()}%` }}
              />
            </div>
          </div>

          {/* Log Panel - takes remaining space */}
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2 bg-surface/80 border-b border-border">
              <span class="text-sm font-medium">Build Log</span>
              <span class="text-xs text-foreground-muted">{buildLogs().length} messages</span>
            </div>
            <div
              ref={logContainerRef}
              class="flex-1 overflow-y-auto bg-background/95 p-3 font-mono text-xs"
            >
              <For each={buildLogs()}>
                {(log) => (
                  <div class={`py-0.5 ${getLogColor(log.level)}`}>
                    <span class="text-foreground-muted opacity-50 mr-2">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {log.message}
                  </div>
                )}
              </For>
              <Show when={buildLogs().length === 0}>
                <div class="text-foreground-muted text-center py-8">
                  Waiting for build output...
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show
        when={projectStore.currentProject()}
        fallback={
          <div class="flex items-center justify-center h-full text-foreground-muted">
            <div class="text-center">
              <h2 class="text-lg font-medium text-foreground mb-2">Build</h2>
              <p>Load a project to build your project</p>
            </div>
          </div>
        }
      >
        {(project) => (
          <>
            {/* Build Settings */}
            <div class="p-4 border-b border-border">
              <h2 class="text-lg font-semibold mb-4">Build Project</h2>

              <div class="space-y-4">
                {/* Target Platform */}
                <div>
                  <label class="block text-sm text-foreground-muted mb-1">
                    Target Platform
                  </label>
                  <select
                    class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent disabled:opacity-50"
                    value={buildTarget()}
                    onChange={(e) => setBuildTarget(e.currentTarget.value)}
                    disabled={isBuilding()}
                  >
                    <For each={buildTargets}>
                      {(target) => (
                        <option value={target.value}>{target.label}</option>
                      )}
                    </For>
                  </select>
                </div>

                {/* Output Directory */}
                <div>
                  <label class="block text-sm text-foreground-muted mb-1">
                    Output Directory
                    <Show when={!projectStore.projectPath()}>
                      <span class="text-yellow-500 ml-1">(save project first for relative paths)</span>
                    </Show>
                  </label>
                  <div class="flex gap-2">
                    <BuildOutputDirInput
                      value={outputDir()}
                      onChange={setOutputDir}
                      disabled={isBuilding()}
                    />
                    <button
                      class="px-3 py-2 bg-surface border border-border rounded hover:bg-surface-hover transition-colors disabled:opacity-50"
                      onClick={handleSelectOutputDir}
                      disabled={isBuilding()}
                    >
                      <FolderOpenIcon class="w-4 h-4" />
                    </button>
                  </div>
                  <p class="text-xs text-foreground-muted mt-1">
                    Relative paths (like ./dist) resolve from project file location
                  </p>
                </div>

                {/* Build Options */}
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-foreground-muted">
                      Release Mode
                    </label>
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        releaseMode() ? "bg-accent" : "bg-background-secondary"
                      } disabled:opacity-50`}
                      onClick={() => setReleaseMode(!releaseMode())}
                      disabled={isBuilding()}
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          releaseMode() ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div class="flex items-center justify-between">
                    <label class="text-sm text-foreground-muted">
                      Bundle Frida Runtime
                    </label>
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        bundleFrida() ? "bg-accent" : "bg-background-secondary"
                      } disabled:opacity-50`}
                      onClick={() => setBundleFrida(!bundleFrida())}
                      disabled={isBuilding()}
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          bundleFrida() ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div class="p-4 border-b border-border space-y-2">
              <button
                class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleBuild}
                disabled={isBuilding()}
              >
                <PlayIcon class="w-5 h-5" />
                {isBuilding() ? "Building..." : "Build Project"}
              </button>

              <div class="flex gap-2">
                <button
                  class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
                  onClick={handleGenerateOnly}
                  disabled={isBuilding()}
                >
                  <SettingsIcon class="w-4 h-4" />
                  Generate Only
                </button>
                <button
                  class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
                  onClick={handlePreview}
                >
                  <CodeIcon class="w-4 h-4" />
                  Preview Code
                </button>
              </div>
            </div>

            {/* Build Log Panel - shown after build completes if there are logs */}
            <Show when={showLogs() && !isBuilding() && buildLogs().length > 0}>
              <div class="border-b border-border">
                <div class="flex items-center justify-between px-4 py-2 bg-surface/50">
                  <span class="text-sm font-medium">Build Log ({buildLogs().length} messages)</span>
                  <button
                    class="p-1 hover:bg-surface-hover rounded"
                    onClick={() => setShowLogs(false)}
                  >
                    <IconX class="w-4 h-4" />
                  </button>
                </div>
                <div
                  class="h-40 overflow-y-auto bg-background p-2 font-mono text-xs"
                >
                  <For each={buildLogs()}>
                    {(log) => (
                      <div class={`py-0.5 ${getLogColor(log.level)}`}>
                        <span class="text-foreground-muted opacity-50 mr-2">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {log.message}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Build Result */}
            <div class="flex-1 overflow-y-auto p-4">
              <Show when={buildError()}>
                <div class="p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm mb-4">
                  {buildError()}
                </div>
              </Show>

              <Show when={buildResult()}>
                {(result) => (
                  <div class="space-y-4">
                    <div class="p-4 bg-success/10 border border-success/20 rounded-lg">
                      <h3 class="font-medium text-success mb-2">
                        Build Successful!
                      </h3>
                      <p class="text-sm text-foreground-muted mb-2">
                        Project generated at:
                      </p>
                      <code class="text-xs bg-background p-2 rounded block break-all">
                        {result().project_dir}
                      </code>
                    </div>

                    <Show when={result().executables.length > 0}>
                      <div>
                        <h4 class="text-sm font-medium mb-2">
                          Built Executables
                        </h4>
                        <ul class="space-y-1">
                          <For each={result().executables}>
                            {(exe) => (
                              <li class="text-xs bg-surface p-2 rounded break-all">
                                {exe}
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>

              {/* Project Summary */}
              <Show when={!buildResult() && !buildError() && !showLogs()}>
                <div class="space-y-4">
                  <h3 class="text-sm font-medium text-foreground-muted">
                    Project Summary
                  </h3>

                  <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="p-3 bg-surface rounded-lg">
                      <div class="text-foreground-muted">Name</div>
                      <div class="font-medium">{project().name}</div>
                    </div>
                    <div class="p-3 bg-surface rounded-lg">
                      <div class="text-foreground-muted">Version</div>
                      <div class="font-medium">{project().version}</div>
                    </div>
                    <div class="p-3 bg-surface rounded-lg">
                      <div class="text-foreground-muted">Components</div>
                      <div class="font-medium">
                        {project().ui.components.length}
                      </div>
                    </div>
                    <div class="p-3 bg-surface rounded-lg">
                      <div class="text-foreground-muted">Scripts</div>
                      <div class="font-medium">
                        {project().scripts?.length ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Project path info */}
                  <Show when={projectStore.projectPath()}>
                    <div class="p-3 bg-surface rounded-lg">
                      <div class="text-foreground-muted text-xs mb-1">Project Path</div>
                      <div class="text-xs font-mono break-all">{projectStore.projectPath()}</div>
                    </div>
                  </Show>
                  <Show when={!projectStore.projectPath()}>
                    <div class="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <div class="text-yellow-500 text-sm font-medium mb-1">Unsaved Project</div>
                      <div class="text-xs text-foreground-muted">
                        Save the project to enable relative output paths (like ./dist)
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </>
        )}
      </Show>

      {/* Code Preview Modal */}
      <Show when={showPreview() && previewCode()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-surface rounded-lg shadow-xl w-[800px] max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between p-4 border-b border-border">
              <h3 class="font-medium">Generated Code Preview</h3>
              <button
                class="p-1 hover:bg-surface-hover rounded"
                onClick={() => setShowPreview(false)}
              >
                &times;
              </button>
            </div>

            <div class="flex border-b border-border">
              <button
                class={`px-4 py-2 text-sm ${
                  previewTab() === "ui"
                    ? "border-b-2 border-accent text-accent"
                    : "text-foreground-muted"
                }`}
                onClick={() => setPreviewTab("ui")}
              >
                UI Code (TSX)
              </button>
              <button
                class={`px-4 py-2 text-sm ${
                  previewTab() === "frida"
                    ? "border-b-2 border-accent text-accent"
                    : "text-foreground-muted"
                }`}
                onClick={() => setPreviewTab("frida")}
              >
                Frida Script
              </button>
            </div>

            <div class="flex-1 overflow-auto p-4">
              <pre class="text-xs font-mono bg-background p-4 rounded overflow-x-auto">
                {previewTab() === "ui"
                  ? previewCode()!.ui_code
                  : previewCode()!.frida_script}
              </pre>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// Uncontrolled text input for output directory
interface BuildOutputDirInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const BuildOutputDirInput: Component<BuildOutputDirInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value);
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <input
      type="text"
      class="flex-1 px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent disabled:opacity-50"
      value={localValue()}
      onFocus={() => setIsFocused(true)}
      onInput={(e) => {
        const val = e.currentTarget.value;
        setLocalValue(val);
        props.onChange(val);
      }}
      onBlur={() => setIsFocused(false)}
      disabled={props.disabled}
    />
  );
};

export default BuildPanel;
