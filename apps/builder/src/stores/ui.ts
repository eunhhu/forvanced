import { createSignal, createRoot } from "solid-js";

// Tab types
export type MainTab = "project" | "designer" | "scripts" | "build";

function createUIStore() {
  // Active main tab
  const [activeTab, setActiveTab] = createSignal<MainTab>("project");

  // Focus tracking - which panel has focus for keyboard shortcuts
  // "designer" = UI Designer canvas has focus
  // "scripts" = Script Editor canvas has focus
  // "none" = No specific canvas has focus
  const [focusedPanel, setFocusedPanel] = createSignal<
    "designer" | "scripts" | "none"
  >("none");

  return {
    // State
    activeTab,
    focusedPanel,

    // Actions
    setActiveTab,
    setFocusedPanel,

    // Helpers
    isDesignerActive: () => activeTab() === "designer",
    isScriptsActive: () => activeTab() === "scripts",
  };
}

export const uiStore = createRoot(createUIStore);
