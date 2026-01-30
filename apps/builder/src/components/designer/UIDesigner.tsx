import { Component, createEffect, createSignal, createMemo, on, untrack } from "solid-js";
import { ComponentPalette } from "./ComponentPalette";
import { DesignCanvas, setCanvasWidth, setCanvasHeight } from "./DesignCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { LayersPanel } from "./LayersPanel";
import { designerStore } from "@/stores/designer";
import { projectStore } from "@/stores/project";

type RightPanelTab = "properties" | "layers";

export const UIDesigner: Component = () => {
  const [rightPanelTab, setRightPanelTab] =
    createSignal<RightPanelTab>("properties");

  // Extract only the values we care about to minimize reactivity
  const projectId = createMemo(() => projectStore.currentProject()?.id);
  const projectUiWidth = createMemo(() => projectStore.currentProject()?.ui?.width ?? 400);
  const projectUiHeight = createMemo(() => projectStore.currentProject()?.ui?.height ?? 500);

  // Load from project when project ID changes
  createEffect(
    on(projectId, (id, prevId) => {
      if (id && id !== prevId) {
        // Use untrack to read values without adding dependencies
        const project = untrack(() => projectStore.currentProject());
        if (project) {
          designerStore.loadFromProject();
          // Set canvas size from project
          setCanvasWidth(untrack(projectUiWidth));
          setCanvasHeight(untrack(projectUiHeight));
        }
      }
    }),
  );

  // Update canvas size when UI size settings change (from settings panel)
  createEffect(
    on(
      () => [projectUiWidth(), projectUiHeight()] as const,
      ([w, h]) => {
        if (w > 0) setCanvasWidth(w);
        if (h > 0) setCanvasHeight(h);
      },
      { defer: true },
    ),
  );

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
