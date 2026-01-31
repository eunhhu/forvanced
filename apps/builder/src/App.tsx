import { Component, createSignal, Show, onMount, onCleanup } from "solid-js";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { UIDesigner } from "@/components/designer/UIDesigner";
import { ProjectPanel } from "@/components/project/ProjectPanel";
import { BuildPanel } from "@/components/build/BuildPanel";
import { ScriptEditor } from "@/components/script/ScriptEditor";
import { TestPanel } from "@/components/testing/TestPanel";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { HotkeysHelp } from "@/components/common/HotkeysHelp";
import { CommandPalette } from "@/components/common/CommandPalette";
import { SkipLinks } from "@/components/common/SkipLinks";
import { sidebarStore } from "@/stores/sidebar";
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
        id: "nav-designer",
        keys: ["Cmd", "2"],
        description: "Go to Designer",
        category: "navigation",
        action: () => setActiveTab("designer"),
      },
      {
        id: "nav-scripts",
        keys: ["Cmd", "3"],
        description: "Go to Scripts",
        category: "navigation",
        action: () => setActiveTab("scripts"),
      },
      {
        id: "nav-testing",
        keys: ["Cmd", "4"],
        description: "Go to Testing",
        category: "navigation",
        action: () => setActiveTab("testing"),
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
            scriptStore.deleteSelectedNodes();
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
          <Show when={activeTab() === "project"}>
            <ProjectPanel />
          </Show>

          <Show when={activeTab() === "designer"}>
            <UIDesigner />
          </Show>

          <Show when={activeTab() === "scripts"}>
            <ScriptEditor />
          </Show>

          <Show when={activeTab() === "testing"}>
            <TestPanel />
          </Show>

          <Show when={activeTab() === "build"}>
            <BuildPanel />
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
