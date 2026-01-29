import { Component, Show, createMemo } from "solid-js";
import { scriptStore } from "@/stores/script";
import { NodeCanvas } from "./NodeCanvas";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { PlusIcon } from "@/components/common/Icons";

export const ScriptEditor: Component = () => {
  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  const handleCreateScript = () => {
    const name = `Script ${scriptStore.scripts().length + 1}`;
    scriptStore.createScript(name);
  };

  return (
    <div class="flex h-full">
      {/* Node Palette (Left) */}
      <NodePalette />

      {/* Canvas (Center) */}
      <div class="flex-1 flex flex-col min-w-0">
        <Show
          when={currentScript()}
          fallback={
            <div class="flex-1 flex items-center justify-center bg-background">
              <div class="text-center">
                <p class="text-foreground-muted mb-4">No script selected</p>
                <button
                  class="btn btn-primary flex items-center gap-2"
                  onClick={handleCreateScript}
                >
                  <PlusIcon class="w-4 h-4" />
                  Create Script
                </button>
              </div>
            </div>
          }
        >
          <NodeCanvas />
        </Show>
      </div>

      {/* Node Inspector (Right) */}
      <NodeInspector />
    </div>
  );
};

export default ScriptEditor;
