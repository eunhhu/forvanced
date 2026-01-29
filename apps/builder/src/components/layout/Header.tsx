import { Component, Show } from "solid-js";
import { targetStore } from "@/stores/target";
import { projectStore } from "@/stores/project";
import { IconPlug, IconCheck, IconFolder } from "@/components/common/Icons";

export const Header: Component = () => {
  const isAttached = () => targetStore.isAttached();
  const attachedPid = () => targetStore.attachedPid();

  const projectName = () => projectStore.currentProject()?.name;
  const projectPath = () => projectStore.projectPath();
  const isDirty = () => projectStore.isDirty();

  // Extract filename from path
  const fileName = () => {
    const path = projectPath();
    if (!path) return null;
    return path.split("/").pop()?.split("\\").pop();
  };

  return (
    <header class="h-header bg-background-secondary border-b border-border flex items-center justify-between px-4 drag-region">
      <div class="flex items-center gap-4 no-drag">
        {/* Project Info */}
        <Show when={projectName()}>
          <div class="flex items-center gap-2 text-sm">
            <IconFolder class="w-4 h-4 text-accent" />
            <span class="font-medium text-foreground">{projectName()}</span>
            <Show when={isDirty()}>
              <span class="w-2 h-2 rounded-full bg-warning" title="Unsaved changes" />
            </Show>
          </div>
          <Show when={fileName()}>
            <div class="text-xs text-foreground-muted" title={projectPath() || ""}>
              {fileName()}
            </div>
          </Show>
          <div class="w-px h-4 bg-border" />
        </Show>

        {/* Adapter Info */}
        <div class="text-sm text-foreground-secondary">
          Adapter:{" "}
          <span class="text-foreground font-medium">
            {targetStore.currentAdapterId()}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 no-drag">
        <Show
          when={isAttached()}
          fallback={
            <div class="flex items-center gap-2 text-sm text-foreground-muted">
              <IconPlug class="w-4 h-4" />
              <span>Not attached</span>
            </div>
          }
        >
          <div class="flex items-center gap-2 text-sm text-success">
            <IconCheck class="w-4 h-4" />
            <span>Attached to PID {attachedPid()}</span>
          </div>
          <button
            class="btn btn-ghost text-xs"
            onClick={() => targetStore.detach()}
          >
            Detach
          </button>
        </Show>
      </div>
    </header>
  );
};
