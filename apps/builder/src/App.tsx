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
import { HotkeysHelp } from "@/components/common/HotkeysHelp";
import { CommandPalette } from "@/components/common/CommandPalette";
import { SkipLinks } from "@/components/common/SkipLinks";
import { targetStore } from "@/stores/target";
import { sidebarStore } from "@/stores/sidebar";
import { errorStore } from "@/stores/error";
import { hotkeysStore, type Hotkey } from "@/stores/hotkeys";
import { projectStore } from "@/stores/project";
import { uiStore, type MainTab } from "@/stores/ui";
import { designerStore } from "@/stores/designer";
import { scriptStore } from "@/stores/script";

// Command palette state
const [isCommandPaletteOpen, setCommandPaletteOpen] = createSignal(false);

const App: Component = () => {
  // Use uiStore for activeTab so it's accessible to hotkeys
  const activeTab = uiStore.activeTab;
  const setActiveTab = uiStore.setActiveTab;
  const [initialized, setInitialized] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);

  onMount(async () => {
    // Initialize hotkey listener
    hotkeysStore.initializeHotkeyListener();

    // Register global hotkeys
    const globalHotkeys: Hotkey[] = [
      // General
      {
        id: "show-hotkeys",
        keys: ["Shift", "?"],
        description: "Show keyboard shortcuts",
        category: "general",
        action: () => hotkeysStore.toggleHelp(),
        global: true,
      },
      {
        id: "command-palette",
        keys: ["Cmd", "K"],
        description: "Open command palette",
        category: "general",
        action: () => setCommandPaletteOpen(true),
        global: true,
      },
      {
        id: "toggle-sidebar",
        keys: ["Cmd", "\\"],
        description: "Toggle sidebar",
        category: "general",
        action: () => sidebarStore.toggle(),
      },
      {
        id: "settings",
        keys: ["Cmd", ","],
        description: "Open settings",
        category: "general",
        action: () => setShowSettings(true),
      },

      // Navigation
      {
        id: "nav-project",
        keys: ["Cmd", "1"],
        description: "Go to Project",
        category: "navigation",
        action: () => setActiveTab("project"),
      },
      {
        id: "nav-target",
        keys: ["Cmd", "2"],
        description: "Go to Target",
        category: "navigation",
        action: () => setActiveTab("target"),
      },
      {
        id: "nav-designer",
        keys: ["Cmd", "3"],
        description: "Go to Designer",
        category: "navigation",
        action: () => setActiveTab("designer"),
      },
      {
        id: "nav-scripts",
        keys: ["Cmd", "4"],
        description: "Go to Scripts",
        category: "navigation",
        action: () => setActiveTab("scripts"),
      },
      {
        id: "nav-build",
        keys: ["Cmd", "5"],
        description: "Go to Build",
        category: "navigation",
        action: () => setActiveTab("build"),
      },

      // Project
      {
        id: "save-project",
        keys: ["Cmd", "S"],
        description: "Save project",
        category: "project",
        action: async () => {
          if (projectStore.projectPath()) {
            await projectStore.save();
          } else if (projectStore.currentProject()) {
            await projectStore.saveAs();
          }
        },
        enabled: () => !!projectStore.currentProject(),
      },
      {
        id: "new-project",
        keys: ["Cmd", "N"],
        description: "New project",
        category: "project",
        action: () => {
          setActiveTab("project");
          // Project creation is handled by ProjectPanel
        },
      },
      {
        id: "open-project",
        keys: ["Cmd", "O"],
        description: "Open project",
        category: "project",
        action: async () => {
          await projectStore.openFile();
        },
      },

      // Target
      {
        id: "detach-process",
        keys: ["Cmd", "D"],
        description: "Detach from process",
        category: "target",
        action: () => targetStore.detach(),
        enabled: () => targetStore.isAttached(),
      },
      {
        id: "refresh-processes",
        keys: ["Cmd", "R"],
        description: "Refresh process list",
        category: "target",
        action: () => {
          if (uiStore.activeTab() === "target") {
            targetStore.refetchProcesses();
          }
        },
        enabled: () => uiStore.activeTab() === "target",
      },

      // Designer - Delete selected components
      {
        id: "designer-delete",
        keys: ["Delete"],
        description: "Delete selected components",
        category: "designer",
        action: () => {
          if (designerStore.selectedIds().size > 0) {
            designerStore.deleteSelectedComponents();
          }
        },
        enabled: () => uiStore.activeTab() === "designer" && designerStore.selectedIds().size > 0,
      },
      // Designer - Select all components
      {
        id: "designer-select-all",
        keys: ["Cmd", "A"],
        description: "Select all components",
        category: "designer",
        action: () => {
          const allIds = designerStore.components().filter((c) => !c.parentId).map((c) => c.id);
          designerStore.selectMultiple(allIds);
        },
        enabled: () => uiStore.activeTab() === "designer",
      },

      // Script - Delete selected nodes/connections
      {
        id: "script-delete",
        keys: ["Delete"],
        description: "Delete selected nodes/connections",
        category: "script",
        action: () => {
          // Delete selected connection first
          if (scriptStore.selectedConnectionId()) {
            scriptStore.deleteConnection(scriptStore.selectedConnectionId()!);
            return;
          }
          // Then delete selected nodes
          if (scriptStore.selectedNodeIds().size > 0) {
            const selectedNodes = scriptStore.getSelectedNodes();
            // Don't delete event nodes (entry points) unless multiple selected
            const canDelete = selectedNodes.every(
              (n) => !n.type.startsWith("event_") || selectedNodes.length > 1,
            );
            if (canDelete) {
              scriptStore.deleteSelectedNodes();
            }
          }
        },
        enabled: () =>
          uiStore.activeTab() === "scripts" &&
          (scriptStore.selectedNodeIds().size > 0 || !!scriptStore.selectedConnectionId()),
      },
      // Script - Select all nodes
      {
        id: "script-select-all",
        keys: ["Cmd", "A"],
        description: "Select all nodes",
        category: "script",
        action: () => {
          const script = scriptStore.getCurrentScript();
          if (script) {
            const allIds = script.nodes.map((n) => n.id);
            scriptStore.selectMultipleNodes(allIds);
          }
        },
        enabled: () => uiStore.activeTab() === "scripts",
      },
    ];

    const unregisterHotkeys = hotkeysStore.registerHotkeys(globalHotkeys);

    // Initialize devices
    try {
      const checkDevices = async () => {
        const devices = targetStore.devices();
        if (devices && devices.length > 0) {
          await targetStore.changeDevice(devices[0].id);
          setInitialized(true);
        } else if (targetStore.devices.loading) {
          setTimeout(checkDevices, 100);
        } else {
          setInitialized(true);
        }
      };
      await checkDevices();
    } catch (err) {
      console.error("Failed to initialize:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      errorStore.showError("Initialization Failed", message);
      setInitialized(true);
    }

    onCleanup(() => {
      unregisterHotkeys();
      hotkeysStore.cleanupHotkeyListener();
    });
  });

  return (
    <div class="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Skip links for keyboard accessibility */}
      <SkipLinks />

      <Sidebar
        activeTab={activeTab()}
        onTabChange={setActiveTab}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div class="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main
          id="main-content"
          class="flex-1 overflow-hidden"
          tabIndex={-1}
          role="main"
          aria-label={`${activeTab()} panel`}
        >
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

      {/* Keyboard Shortcuts Help */}
      <HotkeysHelp />

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen()}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(tab) => {
          setActiveTab(tab as MainTab);
          setCommandPaletteOpen(false);
        }}
        onOpenSettings={() => {
          setShowSettings(true);
          setCommandPaletteOpen(false);
        }}
      />
    </div>
  );
};

export default App;
