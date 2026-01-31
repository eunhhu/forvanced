import { Component, Show } from "solid-js";
import { projectStore } from "@/stores/project";
import { IconFolder } from "@/components/common/Icons";

export const Header: Component = () => {
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
          <div
            class="flex items-center gap-2 text-sm"
            aria-label="Current project"
          >
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
        </Show>

        <Show when={!projectName()}>
          <div class="text-sm text-foreground-muted">No project loaded</div>
        </Show>
      </div>

      {/* Placeholder for future status indicators */}
      <div class="flex items-center gap-2 no-drag" />
    </header>
  );
};
