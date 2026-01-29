import { Component, createSignal, Show, onMount } from "solid-js";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ProcessList } from "@/components/process/ProcessList";
import { UIDesigner } from "@/components/designer/UIDesigner";
import { ProjectPanel } from "@/components/project/ProjectPanel";
import { BuildPanel } from "@/components/build/BuildPanel";
import { ScriptEditor } from "@/components/script/ScriptEditor";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { targetStore } from "@/stores/target";

const App: Component = () => {
  const [activeTab, setActiveTab] = createSignal("project");
  const [initialized, setInitialized] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);

  onMount(async () => {
    try {
      // Initialize the default adapter
      await targetStore.changeAdapter("local_pc");
      setInitialized(true);
    } catch (err) {
      console.error("Failed to initialize:", err);
      setError(err instanceof Error ? err.message : String(err));
      setInitialized(true); // Still show UI even on error
    }
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
    </div>
  );
};

export default App;
