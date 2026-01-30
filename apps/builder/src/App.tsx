import { Component, createSignal, Show, onMount, onCleanup } from "solid-js";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ProcessList } from "@/components/process/ProcessList";
import { UIDesigner } from "@/components/designer/UIDesigner";
import { ProjectPanel } from "@/components/project/ProjectPanel";
import { BuildPanel } from "@/components/build/BuildPanel";
import { ScriptEditor } from "@/components/script/ScriptEditor";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { targetStore } from "@/stores/target";
import { sidebarStore } from "@/stores/sidebar";
import { errorStore } from "@/stores/error";

const App: Component = () => {
  const [activeTab, setActiveTab] = createSignal("project");
  const [initialized, setInitialized] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);

  onMount(async () => {
    try {
      // Wait for devices to load, then select the first one
      const checkDevices = async () => {
        const devices = targetStore.devices();
        if (devices && devices.length > 0) {
          // Select the first device (usually "local")
          await targetStore.changeDevice(devices[0].id);
          setInitialized(true);
        } else if (targetStore.devices.loading) {
          // Still loading, wait a bit and try again
          setTimeout(checkDevices, 100);
        } else {
          // No devices available, still show UI
          setInitialized(true);
        }
      };
      await checkDevices();
    } catch (err) {
      console.error("Failed to initialize:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      errorStore.showError("Initialization Failed", message);
      setInitialized(true); // Still show UI even on error
    }

    // Keyboard shortcut for sidebar toggle
    // macOS: Cmd+\, Windows/Linux: Ctrl+\
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = sidebarStore.isMacOS();
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      if (modifierKey && e.key === "\\") {
        e.preventDefault();
        sidebarStore.toggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <div class="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        activeTab={activeTab()}
        onTabChange={setActiveTab}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div class="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main class="flex-1 overflow-hidden">
          <Show
            when={initialized()}
            fallback={
              <div class="flex items-center justify-center h-full">
                <div class="text-foreground-muted">Initializing...</div>
              </div>
            }
          >
            <Show when={error()}>
              <div class="m-4 p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
                Failed to initialize: {error()}
              </div>
            </Show>

            <Show when={activeTab() === "project"}>
              <ProjectPanel />
            </Show>

            <Show when={activeTab() === "target"}>
              <ProcessList />
            </Show>

            <Show when={activeTab() === "designer"}>
              <UIDesigner />
            </Show>

            <Show when={activeTab() === "scripts"}>
              <ScriptEditor />
            </Show>

            <Show when={activeTab() === "build"}>
              <BuildPanel />
            </Show>
          </Show>
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings()}
        onClose={() => setShowSettings(false)}
      />

      {/* Global Error Alerts */}
      <ErrorAlert />
    </div>
  );
};

export default App;
