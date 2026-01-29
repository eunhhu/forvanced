import {
  Component,
  Show,
  createSignal,
  For,
  onMount,
  createEffect,
  untrack,
} from "solid-js";
import { projectStore } from "@/stores/project";
import {
  IconFolder,
  PlusIcon,
  FolderOpenIcon,
  SaveIcon,
  TrashIcon,
} from "@/components/common/Icons";

export const ProjectPanel: Component = () => {
  const [showNewModal, setShowNewModal] = createSignal(false);
  const [newProjectName, setNewProjectName] = createSignal("");

  const handleCreateProject = async () => {
    const name = newProjectName().trim();
    if (!name) return;

    try {
      await projectStore.createNew(name);
      setNewProjectName("");
      setShowNewModal(false);
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  };

  const handleOpenProject = async () => {
    try {
      await projectStore.openFile();
    } catch (e) {
      console.error("Failed to open project:", e);
    }
  };

  const handleSaveProject = async () => {
    try {
      if (projectStore.projectPath()) {
        await projectStore.save();
      } else {
        await projectStore.saveAs();
      }
    } catch (e) {
      console.error("Failed to save project:", e);
    }
  };

  return (
    <div class="h-full flex flex-col">
      <Show
        when={projectStore.currentProject()}
        fallback={
          <WelcomeScreen
            onNew={() => setShowNewModal(true)}
            onOpen={handleOpenProject}
          />
        }
      >
        {(project) => (
          <>
            {/* Project Header */}
            <div class="p-4 border-b border-border">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-semibold flex items-center gap-2">
                    {project().name}
                    <Show when={projectStore.isDirty()}>
                      <span
                        class="w-2 h-2 rounded-full bg-warning"
                        title="Unsaved changes"
                      />
                    </Show>
                  </h2>
                  <p class="text-sm text-foreground-muted">
                    {projectStore.projectPath() ?? "Not saved yet"}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="p-2 hover:bg-surface-hover rounded transition-colors"
                    onClick={handleSaveProject}
                    title="Save Project"
                  >
                    <SaveIcon class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Project Info */}
            <div class="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Basic Info */}
              <ProjectSection title="Project Info">
                <div class="space-y-3">
                  <ProjectField
                    label="Name"
                    value={project().name}
                    onChange={(v) => projectStore.updateProject({ name: v })}
                  />
                  <ProjectField
                    label="Description"
                    value={project().description ?? ""}
                    onChange={(v) =>
                      projectStore.updateProject({ description: v || null })
                    }
                    multiline
                  />
                  <ProjectField
                    label="Version"
                    value={project().version}
                    onChange={(v) => projectStore.updateProject({ version: v })}
                  />
                  <ProjectField
                    label="Author"
                    value={project().author ?? ""}
                    onChange={(v) =>
                      projectStore.updateProject({ author: v || null })
                    }
                  />
                </div>
              </ProjectSection>

              {/* Target Settings */}
              <ProjectSection title="Target Settings">
                <div class="space-y-3">
                  <ProjectField
                    label="Process Name"
                    value={project().config.target.process_name ?? ""}
                    onChange={(v) =>
                      projectStore.updateConfig({
                        target: {
                          ...project().config.target,
                          process_name: v || null,
                        },
                      })
                    }
                    placeholder="e.g., game.exe"
                  />
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-foreground-muted">
                      Auto Attach
                    </label>
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        project().config.target.auto_attach
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        projectStore.updateConfig({
                          target: {
                            ...project().config.target,
                            auto_attach: !project().config.target.auto_attach,
                          },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          project().config.target.auto_attach
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-foreground-muted">Adapter</label>
                    <select
                      class="px-2 py-1 text-sm bg-background border border-border rounded"
                      value={project().config.target.adapter_type}
                      onChange={(e) =>
                        projectStore.updateConfig({
                          target: {
                            ...project().config.target,
                            adapter_type: e.currentTarget.value,
                          },
                        })
                      }
                    >
                      <option value="local_pc">Local PC</option>
                      <option value="usb_device">USB Device</option>
                      <option value="emulator">Emulator</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                </div>
              </ProjectSection>

              {/* Window Settings */}
              <ProjectSection title="Window Settings">
                <div class="space-y-3">
                  <WindowSizeInput
                    label="Width"
                    value={project().ui.width}
                    min={100}
                    max={1920}
                    onChange={(val) => {
                      projectStore.updateUI({
                        ...project().ui,
                        width: val,
                      });
                    }}
                  />
                  <WindowSizeInput
                    label="Height"
                    value={project().ui.height}
                    min={100}
                    max={1080}
                    onChange={(val) => {
                      projectStore.updateUI({
                        ...project().ui,
                        height: val,
                      });
                    }}
                  />
                  <ThemeSelect
                    value={project().ui.theme}
                    onChange={(val) => {
                      projectStore.updateUI({
                        ...project().ui,
                        theme: val,
                      });
                    }}
                  />
                </div>
              </ProjectSection>

              {/* Build Settings */}
              <ProjectSection title="Build Settings">
                <div class="space-y-3">
                  <ProjectField
                    label="Output Name"
                    value={project().config.build.output_name ?? ""}
                    onChange={(v) =>
                      projectStore.updateConfig({
                        build: {
                          ...project().config.build,
                          output_name: v || null,
                        },
                      })
                    }
                    placeholder="Trainer name"
                  />
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-foreground-muted">
                      Bundle Frida
                    </label>
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        project().config.build.bundle_frida
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        projectStore.updateConfig({
                          build: {
                            ...project().config.build,
                            bundle_frida: !project().config.build.bundle_frida,
                          },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          project().config.build.bundle_frida
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </ProjectSection>

              {/* Stats */}
              <ProjectSection title="Statistics">
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="p-3 bg-background rounded-lg">
                    <div class="text-foreground-muted">Components</div>
                    <div class="text-xl font-semibold">
                      {project().ui.components.length}
                    </div>
                  </div>
                  <div class="p-3 bg-background rounded-lg">
                    <div class="text-foreground-muted">Actions</div>
                    <div class="text-xl font-semibold">
                      {project().ui.components.reduce(
                        (sum, c) => sum + c.bindings.length,
                        0,
                      )}
                    </div>
                  </div>
                </div>
              </ProjectSection>
            </div>
          </>
        )}
      </Show>

      {/* New Project Modal */}
      <Show when={showNewModal()}>
        <div
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) =>
            e.target === e.currentTarget && setShowNewModal(false)
          }
          onKeyDown={(e) => e.key === "Escape" && setShowNewModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            class="bg-surface rounded-lg shadow-xl w-96 p-4"
          >
            <h3 class="font-medium mb-4">New Project</h3>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent"
              placeholder="Project name"
              value={newProjectName()}
              onInput={(e) => setNewProjectName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") setShowNewModal(false);
              }}
              autofocus
            />
            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-3 py-1.5 text-sm hover:bg-surface-hover rounded transition-colors"
                onClick={() => setShowNewModal(false)}
              >
                Cancel
              </button>
              <button
                class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors"
                onClick={handleCreateProject}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

interface WelcomeScreenProps {
  onNew: () => void;
  onOpen: () => void;
}

const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  const [isLoadingRecent, setIsLoadingRecent] = createSignal(false);

  onMount(async () => {
    setIsLoadingRecent(true);
    try {
      await projectStore.fetchRecentProjects();
    } finally {
      setIsLoadingRecent(false);
    }
  });

  const handleOpenRecent = async (path: string) => {
    try {
      await projectStore.openRecentProject(path);
    } catch (e) {
      console.error("Failed to open recent project:", e);
    }
  };

  const handleRemoveRecent = async (e: MouseEvent, path: string) => {
    e.stopPropagation();
    await projectStore.removeRecentProject(path);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="w-full max-w-2xl">
          {/* Header */}
          <div class="text-center mb-8">
            <div class="w-16 h-16 mx-auto mb-6 rounded-2xl bg-accent/10 flex items-center justify-center">
              <IconFolder class="w-8 h-8 text-accent" />
            </div>
            <h2 class="text-xl font-semibold mb-2">Welcome to Forvanced</h2>
            <p class="text-foreground-muted">
              Create a new trainer project or open an existing one to get
              started.
            </p>
          </div>

          {/* Actions */}
          <div class="flex justify-center gap-3 mb-8">
            <button
              class="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              onClick={props.onNew}
            >
              <PlusIcon class="w-5 h-5" />
              New Project
            </button>
            <button
              class="flex items-center justify-center gap-2 px-6 py-3 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              onClick={props.onOpen}
            >
              <FolderOpenIcon class="w-5 h-5" />
              Open Project
            </button>
          </div>

          {/* Recent Projects */}
          <Show
            when={projectStore.recentProjects().length > 0 || isLoadingRecent()}
          >
            <div class="bg-surface rounded-lg border border-border">
              <div class="px-4 py-3 border-b border-border">
                <h3 class="text-sm font-medium text-foreground-muted">
                  Recent Projects
                </h3>
              </div>
              <div class="max-h-64 overflow-y-auto">
                <Show
                  when={!isLoadingRecent()}
                  fallback={
                    <div class="p-4 text-center text-foreground-muted text-sm">
                      Loading recent projects...
                    </div>
                  }
                >
                  <For each={projectStore.recentProjects()}>
                    {(project) => (
                      <div
                        class="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-left group cursor-pointer"
                        onClick={() => handleOpenRecent(project.path)}
                      >
                        <div class="flex-1 min-w-0">
                          <div class="font-medium truncate">{project.name}</div>
                          <div class="text-xs text-foreground-muted truncate">
                            {project.path}
                          </div>
                        </div>
                        <div class="flex items-center gap-3 ml-4">
                          <span class="text-xs text-foreground-muted">
                            {formatDate(project.last_opened)}
                          </span>
                          <button
                            class="p-1 opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error rounded transition-all"
                            onClick={(e) => handleRemoveRecent(e, project.path)}
                            title="Remove from recent"
                          >
                            <TrashIcon class="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

interface ProjectSectionProps {
  title: string;
  children: any;
}

const ProjectSection: Component<ProjectSectionProps> = (props) => {
  return (
    <div>
      <h3 class="text-sm font-medium text-foreground-muted mb-3">
        {props.title}
      </h3>
      <div class="bg-surface rounded-lg p-4">{props.children}</div>
    </div>
  );
};

interface ProjectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

const ProjectField: Component<ProjectFieldProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value);
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <div class="flex items-start justify-between gap-4">
      <label class="text-sm text-foreground-muted pt-1.5">{props.label}</label>
      <Show
        when={props.multiline}
        fallback={
          <input
            type="text"
            class="flex-1 max-w-[200px] px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent"
            value={localValue()}
            placeholder={props.placeholder}
            onFocus={() => setIsFocused(true)}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setLocalValue(val);
              props.onChange(val);
            }}
            onBlur={() => setIsFocused(false)}
          />
        }
      >
        <textarea
          class="flex-1 max-w-[200px] px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent resize-none"
          rows={2}
          value={localValue()}
          placeholder={props.placeholder}
          onFocus={() => setIsFocused(true)}
          onInput={(e) => {
            const val = e.currentTarget.value;
            setLocalValue(val);
            props.onChange(val);
          }}
          onBlur={() => setIsFocused(false)}
        />
      </Show>
    </div>
  );
};

// Theme select component - properly controlled
interface ThemeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const ThemeSelect: Component<ThemeSelectProps> = (props) => {
  // Use local signal to properly control the select
  const [localValue, setLocalValue] = createSignal(props.value);

  // Sync with external value changes
  const updateFromProps = () => {
    if (localValue() !== props.value) {
      setLocalValue(props.value);
    }
  };

  // Check on every render
  updateFromProps();

  return (
    <div class="flex items-center justify-between">
      <label class="text-sm text-foreground-muted">Theme</label>
      <select
        class="px-2 py-1 text-sm bg-background border border-border rounded"
        value={localValue()}
        onChange={(e) => {
          const newValue = e.currentTarget.value;
          setLocalValue(newValue);
          props.onChange(newValue);
        }}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </div>
  );
};

// Window size input - uses createEffect for proper reactivity
interface WindowSizeInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

const WindowSizeInput: Component<WindowSizeInputProps> = (props) => {
  // Local signal for the input value (string for input handling)
  const [localValue, setLocalValue] = createSignal(String(props.value || 400));
  const [isFocused, setIsFocused] = createSignal(false);

  // Sync from props when not focused (external changes)
  // Use untrack for isFocused to prevent infinite loop
  createEffect(() => {
    const propsVal = props.value;
    if (untrack(() => !isFocused()) && propsVal > 0) {
      setLocalValue(String(propsVal));
    }
  });

  const handleBlur = () => {
    setIsFocused(false);
    const val = Number(localValue());
    if (!isNaN(val) && val > 0) {
      const clamped = Math.max(props.min, Math.min(props.max, val));
      setLocalValue(String(clamped));
      props.onChange(clamped);
    } else {
      // Reset to current store value if invalid
      setLocalValue(String(props.value || 400));
    }
  };

  return (
    <div class="flex items-center justify-between gap-4">
      <label class="text-sm text-foreground-muted">{props.label}</label>
      <input
        type="number"
        class="w-24 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent"
        min={props.min}
        max={props.max}
        value={localValue()}
        onFocus={() => setIsFocused(true)}
        onInput={(e) => setLocalValue(e.currentTarget.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
};

export default ProjectPanel;
