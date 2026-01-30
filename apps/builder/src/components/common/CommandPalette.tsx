import {
  Component,
  createSignal,
  createEffect,
  For,
  Show,
  onCleanup,
  createMemo,
} from "solid-js";
import {
  IconSearch,
  IconFolder,
  IconLayout,
  IconWorkflow,
  IconPackage,
  IconSettings,
  SaveIcon,
  FolderOpenIcon,
  PlusIcon,
  IconKeyboard,
} from "./Icons";
import { hotkeysStore, formatHotkey } from "@/stores/hotkeys";
import { projectStore } from "@/stores/project";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: Component<{ class?: string }>;
  shortcut?: string[];
  action: () => void | Promise<void>;
  category: "navigation" | "project" | "general";
  enabled?: () => boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onOpenSettings: () => void;
}

export const CommandPalette: Component<CommandPaletteProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  // Define commands
  const commands = createMemo<Command[]>(() => [
    // Navigation
    {
      id: "nav-project",
      label: "Go to Project",
      icon: IconFolder,
      shortcut: ["Cmd", "1"],
      action: () => props.onNavigate("project"),
      category: "navigation",
    },
    {
      id: "nav-designer",
      label: "Go to Designer",
      icon: IconLayout,
      shortcut: ["Cmd", "2"],
      action: () => props.onNavigate("designer"),
      category: "navigation",
    },
    {
      id: "nav-scripts",
      label: "Go to Scripts",
      icon: IconWorkflow,
      shortcut: ["Cmd", "3"],
      action: () => props.onNavigate("scripts"),
      category: "navigation",
    },
    {
      id: "nav-build",
      label: "Go to Build",
      icon: IconPackage,
      shortcut: ["Cmd", "4"],
      action: () => props.onNavigate("build"),
      category: "navigation",
    },

    // Project
    {
      id: "new-project",
      label: "New Project",
      description: "Create a new Forvanced project",
      icon: PlusIcon,
      shortcut: ["Cmd", "N"],
      action: () => {
        props.onNavigate("project");
        props.onClose();
      },
      category: "project",
    },
    {
      id: "open-project",
      label: "Open Project",
      description: "Open an existing project",
      icon: FolderOpenIcon,
      shortcut: ["Cmd", "O"],
      action: async () => {
        await projectStore.openFile();
        props.onClose();
      },
      category: "project",
    },
    {
      id: "save-project",
      label: "Save Project",
      description: "Save current project",
      icon: SaveIcon,
      shortcut: ["Cmd", "S"],
      action: async () => {
        if (projectStore.projectPath()) {
          await projectStore.save();
        } else if (projectStore.currentProject()) {
          await projectStore.saveAs();
        }
        props.onClose();
      },
      category: "project",
      enabled: () => !!projectStore.currentProject(),
    },

    // General
    {
      id: "settings",
      label: "Open Settings",
      icon: IconSettings,
      shortcut: ["Cmd", ","],
      action: () => props.onOpenSettings(),
      category: "general",
    },
    {
      id: "hotkeys",
      label: "Keyboard Shortcuts",
      description: "View all keyboard shortcuts",
      icon: IconKeyboard,
      shortcut: ["Shift", "?"],
      action: () => {
        props.onClose();
        hotkeysStore.openHelp();
      },
      category: "general",
    },
  ]);

  // Filter commands based on query
  const filteredCommands = createMemo(() => {
    const q = query().toLowerCase().trim();
    let filtered = commands().filter((cmd) => {
      // Check if enabled
      if (cmd.enabled && !cmd.enabled()) return false;

      if (!q) return true;

      return (
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
      );
    });

    return filtered;
  });

  // Group commands by category
  const groupedCommands = createMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands()) {
      const list = groups.get(cmd.category) || [];
      list.push(cmd);
      groups.set(cmd.category, list);
    }
    return groups;
  });

  // Flat list for keyboard navigation
  const flatCommands = createMemo(() => {
    const result: Command[] = [];
    const order = ["navigation", "project", "general"];
    for (const cat of order) {
      const cmds = groupedCommands().get(cat);
      if (cmds) result.push(...cmds);
    }
    return result;
  });

  // Reset on open
  createEffect(() => {
    if (props.isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef?.focus(), 10);
    }
  });

  // Reset selection when filtered list changes
  createEffect(() => {
    flatCommands(); // trigger reactivity
    setSelectedIndex(0);
  });

  // Scroll selected item into view
  createEffect(() => {
    const index = selectedIndex();
    if (listRef) {
      const items = listRef.querySelectorAll("[data-command-item]");
      const item = items[index] as HTMLElement | undefined;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  });

  // Keyboard handling
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.isOpen) return;

    const cmds = flatCommands();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, cmds.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        const cmd = cmds[selectedIndex()];
        if (cmd) {
          cmd.action();
          props.onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
    }
  };

  createEffect(() => {
    if (props.isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
    }
  });

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    project: "Project",
    general: "General",
  };

  const categoryOrder = ["navigation", "project", "general"];

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          class="bg-background-secondary rounded-lg shadow-2xl w-[500px] max-h-[60vh] flex flex-col overflow-hidden border border-border"
        >
          {/* Search Input */}
          <div class="flex items-center gap-3 p-3 border-b border-border">
            <IconSearch class="w-5 h-5 text-foreground-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command or search..."
              class="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-foreground-muted"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              aria-label="Search commands"
              aria-autocomplete="list"
              aria-controls="command-list"
              aria-activedescendant={
                flatCommands()[selectedIndex()]?.id || undefined
              }
            />
            <kbd class="px-1.5 py-0.5 text-xs bg-background rounded border border-border text-foreground-muted">
              esc
            </kbd>
          </div>

          {/* Command List */}
          <div
            ref={listRef}
            id="command-list"
            role="listbox"
            class="flex-1 overflow-y-auto p-2"
          >
            <Show
              when={flatCommands().length > 0}
              fallback={
                <div class="p-4 text-center text-foreground-muted text-sm">
                  No commands found
                </div>
              }
            >
              <For each={categoryOrder}>
                {(category) => {
                  const cmds = () => groupedCommands().get(category);
                  return (
                    <Show when={cmds()?.length}>
                      <div class="mb-2">
                        <div class="px-2 py-1 text-xs font-medium text-foreground-muted uppercase tracking-wider">
                          {categoryLabels[category]}
                        </div>
                        <For each={cmds()}>
                          {(cmd) => {
                            const globalIndex = () =>
                              flatCommands().indexOf(cmd);
                            const isSelected = () =>
                              selectedIndex() === globalIndex();
                            return (
                              <button
                                id={cmd.id}
                                data-command-item
                                role="option"
                                aria-selected={isSelected()}
                                class={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                  isSelected()
                                    ? "bg-accent text-white"
                                    : "hover:bg-background-tertiary"
                                }`}
                                onClick={() => {
                                  cmd.action();
                                  props.onClose();
                                }}
                                onMouseEnter={() =>
                                  setSelectedIndex(globalIndex())
                                }
                              >
                                <cmd.icon
                                  class={`w-4 h-4 flex-shrink-0 ${isSelected() ? "text-white" : "text-foreground-secondary"}`}
                                />
                                <div class="flex-1 min-w-0">
                                  <div
                                    class={`text-sm font-medium ${isSelected() ? "text-white" : "text-foreground"}`}
                                  >
                                    {cmd.label}
                                  </div>
                                  <Show when={cmd.description}>
                                    <div
                                      class={`text-xs truncate ${isSelected() ? "text-white/70" : "text-foreground-muted"}`}
                                    >
                                      {cmd.description}
                                    </div>
                                  </Show>
                                </div>
                                <Show when={cmd.shortcut}>
                                  <kbd
                                    class={`px-1.5 py-0.5 text-xs rounded border ${
                                      isSelected()
                                        ? "bg-white/20 border-white/30 text-white"
                                        : "bg-background border-border text-foreground-muted"
                                    }`}
                                  >
                                    {formatHotkey(cmd.shortcut!)}
                                  </kbd>
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  );
                }}
              </For>
            </Show>
          </div>

          {/* Footer hint */}
          <div class="px-3 py-2 border-t border-border flex items-center gap-4 text-xs text-foreground-muted">
            <span class="flex items-center gap-1">
              <kbd class="px-1 py-0.5 bg-background rounded border border-border">
                ↑↓
              </kbd>
              to navigate
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1 py-0.5 bg-background rounded border border-border">
                ↵
              </kbd>
              to select
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1 py-0.5 bg-background rounded border border-border">
                esc
              </kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default CommandPalette;
