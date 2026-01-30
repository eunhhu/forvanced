import { Component, createEffect, createSignal } from "solid-js";
import { ComponentPalette } from "./ComponentPalette";
import { DesignCanvas } from "./DesignCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { LayersPanel } from "./LayersPanel";
import { designerStore } from "@/stores/designer";
import { projectStore } from "@/stores/project";

type RightPanelTab = "properties" | "layers";

export const UIDesigner: Component = () => {
  const [rightPanelTab, setRightPanelTab] =
    createSignal<RightPanelTab>("properties");

  // Load components from project when project changes
  createEffect(() => {
    const project = projectStore.currentProject();
    if (project) {
      designerStore.loadFromProject();
    }
  });

  return (
    <div class="flex h-full">
      {/* Component Palette (Left) */}
      <ComponentPalette />

      {/* Canvas (Center) */}
      <div class="flex-1 flex flex-col min-w-0">
        <DesignCanvas />
      </div>

      {/* Right Panel with Tabs */}
      <div class="w-64 flex flex-col bg-surface border-l border-border">
        {/* Tab Header */}
        <div class="flex border-b border-border">
          <button
            class={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              rightPanelTab() === "properties"
                ? "text-accent border-b-2 border-accent bg-surface-raised"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
            }`}
            onClick={() => setRightPanelTab("properties")}
          >
            Properties
          </button>
          <button
            class={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              rightPanelTab() === "layers"
                ? "text-accent border-b-2 border-accent bg-surface-raised"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
            }`}
            onClick={() => setRightPanelTab("layers")}
          >
            Layers
          </button>
        </div>

        {/* Tab Content */}
        <div class="flex-1 overflow-hidden">
          {rightPanelTab() === "properties" ? (
            <PropertyPanel />
          ) : (
            <LayersPanel />
          )}
        </div>
      </div>
    </div>
  );
};

export default UIDesigner;
