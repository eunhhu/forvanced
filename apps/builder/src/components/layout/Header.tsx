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
    <header
      class="h-header bg-background-secondary border-b border-border flex items-center justify-between px-4 drag-region"
      role="banner"
    >
      <div class="flex items-center gap-4 no-drag">
        {/* Project Info */}
        <Show when={projectName()}>
          <div class="flex items-center gap-2 text-sm" aria-label="Current project">
            <IconFolder class="w-4 h-4 text-accent" aria-hidden="true" />
            <span class="font-medium text-foreground">{projectName()}</span>
            <Show when={isDirty()}>
              <span
                class="w-2 h-2 rounded-full bg-warning"
                title="Unsaved changes"
                role="status"
                aria-label="Project has unsaved changes"
              />
            </Show>
          </div>
          <Show when={fileName()}>
            <div
              class="text-xs text-foreground-muted"
              title={projectPath() || ""}
            >
              {fileName()}
            </div>
          </Show>
          <div class="w-px h-4 bg-border" aria-hidden="true" />
        </Show>

        {/* Device Info */}
        <div class="text-sm text-foreground-secondary" aria-label="Current device">
          Device:{" "}
          <span class="text-foreground font-medium">
            {targetStore.currentDeviceId() || "None"}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 no-drag" role="status" aria-live="polite">
        <Show
          when={isAttached()}
          fallback={
            <div class="flex items-center gap-2 text-sm text-foreground-muted" aria-label="Not attached to any process">
              <IconPlug class="w-4 h-4" aria-hidden="true" />
              <span>Not attached</span>
            </div>
          }
        >
          <div class="flex items-center gap-2 text-sm text-success" aria-label={`Attached to process ${attachedPid()}`}>
            <IconCheck class="w-4 h-4" aria-hidden="true" />
            <span>Attached to PID {attachedPid()}</span>
          </div>
          <button
            type="button"
            class="btn btn-ghost text-xs"
            onClick={() => targetStore.detach()}
            aria-label="Detach from current process"
          >
            Detach
          </button>
        </Show>
      </div>
    </header>
  );
};
