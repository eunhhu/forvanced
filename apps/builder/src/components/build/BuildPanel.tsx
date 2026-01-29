import { Component, createSignal, Show, For } from "solid-js";
import { projectStore } from "@/stores/project";

// Check if running in Tauri environment (evaluated at call time)
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Dynamic invoke wrapper
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.log(`[Mock] ${cmd}`, args);
    return getMockBuildResponse<T>(cmd, args);
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// Mock responses for build commands
function getMockBuildResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  const mocks: Record<string, unknown> = {
    build_trainer: {
      project_dir: "/mock/output/trainer",
      executables: ["/mock/output/trainer/trainer.exe"],
      target: (args?.config as Record<string, unknown>)?.target || "current",
    },
    generate_trainer_project: "/mock/output/generated-project",
    preview_generated_code: {
      ui_code: `// Generated UI Code (TSX)
import { Component } from "solid-js";

export const TrainerUI: Component = () => {
  return (
    <div class="trainer-container">
      <h1>My Trainer</h1>
      {/* Components would be rendered here */}
    </div>
  );
};`,
      frida_script: `// Generated Frida Script
console.log("[*] Trainer attached!");

// Memory operations would be generated here
// Based on component bindings
`,
    },
  };
  return (mocks[cmd] ?? null) as T;
}
import {
  PlayIcon,
  FolderOpenIcon,
  CodeIcon,
  SettingsIcon,
} from "@/components/common/Icons";

interface BuildConfig {
  output_dir: string;
  target: string;
  release: boolean;
  bundle_frida: boolean;
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

  const buildTargets = [
    { value: "current", label: "Current Platform" },
    { value: "windows-x64", label: "Windows (x64)" },
    { value: "macos-arm64", label: "macOS (Apple Silicon)" },
    { value: "macos-x64", label: "macOS (Intel)" },
    { value: "linux-x64", label: "Linux (x64)" },
  ];

  const handleBuild = async () => {
    if (!projectStore.currentProject()) {
      setBuildError("No project loaded");
      return;
    }

    setIsBuilding(true);
    setBuildError(null);
    setBuildResult(null);

    try {
      const config: BuildConfig = {
        output_dir: outputDir(),
        target: buildTarget(),
        release: releaseMode(),
        bundle_frida: bundleFrida(),
      };

      const result = await invoke<BuildResult>("build_trainer", { config });
      setBuildResult(result);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBuilding(false);
    }
  };

  const handleGenerateOnly = async () => {
    if (!projectStore.currentProject()) {
      setBuildError("No project loaded");
      return;
    }

    setIsBuilding(true);
    setBuildError(null);

    try {
      const projectDir = await invoke<string>("generate_trainer_project", {
        outputDir: outputDir(),
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

  return (
    <div class="h-full flex flex-col">
      <Show
        when={projectStore.currentProject()}
        fallback={
          <div class="flex items-center justify-center h-full text-foreground-muted">
            <div class="text-center">
              <h2 class="text-lg font-medium text-foreground mb-2">Build</h2>
              <p>Load a project to build your trainer</p>
            </div>
          </div>
        }
      >
        {(project) => (
          <>
            {/* Build Settings */}
            <div class="p-4 border-b border-border">
              <h2 class="text-lg font-semibold mb-4">Build Trainer</h2>

              <div class="space-y-4">
                {/* Target Platform */}
                <div>
                  <label class="block text-sm text-foreground-muted mb-1">
                    Target Platform
                  </label>
                  <select
                    class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent"
                    value={buildTarget()}
                    onChange={(e) => setBuildTarget(e.currentTarget.value)}
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
                  </label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      class="flex-1 px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent"
                      value={outputDir()}
                      onInput={(e) => setOutputDir(e.currentTarget.value)}
                    />
                    <button
                      class="px-3 py-2 bg-surface border border-border rounded hover:bg-surface-hover transition-colors"
                      onClick={handleSelectOutputDir}
                    >
                      <FolderOpenIcon class="w-4 h-4" />
                    </button>
                  </div>
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
                      }`}
                      onClick={() => setReleaseMode(!releaseMode())}
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
                      }`}
                      onClick={() => setBundleFrida(!bundleFrida())}
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
                {isBuilding() ? "Building..." : "Build Trainer"}
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
              <Show when={!buildResult() && !buildError()}>
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
                      <div class="text-foreground-muted">Actions</div>
                      <div class="font-medium">
                        {project().ui.components.reduce(
                          (sum, c) => sum + c.bindings.length,
                          0
                        )}
                      </div>
                    </div>
                  </div>

                  <div class="p-3 bg-surface rounded-lg">
                    <div class="text-foreground-muted text-sm mb-1">
                      Target Process
                    </div>
                    <div class="font-medium">
                      {project().config.target.process_name || "Not configured"}
                    </div>
                  </div>
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

export default BuildPanel;
