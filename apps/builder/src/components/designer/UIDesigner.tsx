import { Component, createEffect } from "solid-js";
import { ComponentPalette } from "./ComponentPalette";
import { DesignCanvas } from "./DesignCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { designerStore } from "@/stores/designer";
import { projectStore } from "@/stores/project";

export const UIDesigner: Component = () => {
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

      {/* Property Panel (Right) - Always visible for stable layout */}
      <PropertyPanel />
    </div>
  );
};

export default UIDesigner;
