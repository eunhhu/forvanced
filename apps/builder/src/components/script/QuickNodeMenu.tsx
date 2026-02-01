import { Component, For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import {
  scriptStore,
  type ScriptNodeType,
  getNodeContext,
} from "@/stores/script";
import { IconSearch, MemoryIcon, IconWorkflow } from "@/components/common/Icons";

interface QuickNodeMenuProps {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  onSelect: (type: ScriptNodeType, x: number, y: number) => void;
  onClose: () => void;
}

// Recent nodes storage key
const RECENT_NODES_KEY = "forvanced:recentNodes";

function getRecentNodes(): ScriptNodeType[] {
  try {
    const stored = localStorage.getItem(RECENT_NODES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export const QuickNodeMenu: Component<QuickNodeMenuProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // All node templates
  const allNodes = createMemo(() => scriptStore.nodeTemplates);

  // Filtered nodes based on search
  type NodeTemplate = (typeof scriptStore.nodeTemplates)[number];

  const filteredNodes = createMemo((): NodeTemplate[] => {
    const query = searchQuery().toLowerCase().trim();

    if (!query) {
      // Show recent nodes first, then common nodes
      const recent = getRecentNodes();
      const recentTemplates = recent
        .map((type) => allNodes().find((t) => t.type === type))
        .filter((t): t is NodeTemplate => t !== undefined);

      // Common starter nodes
      const commonTypes: ScriptNodeType[] = [
        "event_ui",
        "if",
        "log",
        "const_string",
        "const_number",
        "set_variable",
        "get_variable",
        "memory_read",
        "memory_write",
        "call_native",
      ];

      const commonTemplates = commonTypes
        .filter((type) => !recent.includes(type))
        .map((type) => allNodes().find((t) => t.type === type))
        .filter((t): t is NodeTemplate => t !== undefined);

      return [...recentTemplates, ...commonTemplates].slice(0, 12);
    }

    // Filter by search
    return allNodes()
      .filter((n) =>
        n.label.toLowerCase().includes(query) ||
        n.type.toLowerCase().includes(query) ||
        n.description.toLowerCase().includes(query) ||
        n.category.toLowerCase().includes(query)
      )
      .slice(0, 12);
  });

  // Reset selected index when results change
  createEffect(() => {
    filteredNodes();
    setSelectedIndex(0);
  });

  // Focus input on mount
  onMount(() => {
    inputRef?.focus();

    // Click outside to close
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    const nodes = filteredNodes();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, nodes.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        const selected = nodes[selectedIndex()];
        if (selected) {
          handleSelect(selected.type);
        }
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else {
          setSelectedIndex((i) => Math.min(i + 1, nodes.length - 1));
        }
        break;
    }
  };

  const handleSelect = (type: ScriptNodeType) => {
    props.onSelect(type, props.canvasX, props.canvasY);
    props.onClose();
  };

  return (
    <div
      ref={menuRef}
      class="fixed z-50 w-72 bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: `${props.x}px`,
        top: `${props.y}px`,
        "max-height": "400px",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div class="p-2 border-b border-border">
        <div class="relative">
          <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search nodes..."
            class="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:border-accent"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>
        <div class="flex items-center gap-2 mt-1.5 text-[10px] text-foreground-muted">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>

      {/* Results */}
      <div class="max-h-72 overflow-y-auto">
        <Show
          when={filteredNodes().length > 0}
          fallback={
            <div class="p-4 text-center text-foreground-muted text-sm">
              No nodes found
            </div>
          }
        >
          <div class="p-1">
            <For each={filteredNodes()}>
              {(node, index) => {
                const isTarget = () => getNodeContext(node.type) === "target";
                const isSelected = () => index() === selectedIndex();

                return (
                  <button
                    class={`w-full px-2 py-1.5 rounded-md text-left transition-colors flex items-center gap-2 ${
                      isSelected()
                        ? "bg-accent text-white"
                        : "hover:bg-surface-hover"
                    }`}
                    onClick={() => handleSelect(node.type)}
                    onMouseEnter={() => setSelectedIndex(index())}
                  >
                    {/* Context icon */}
                    <Show
                      when={isTarget()}
                      fallback={
                        <IconWorkflow class={`w-3.5 h-3.5 flex-shrink-0 ${
                          isSelected() ? "text-white" : "text-blue-400"
                        }`} />
                      }
                    >
                      <MemoryIcon class={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected() ? "text-white" : "text-red-400"
                      }`} />
                    </Show>

                    {/* Node info */}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium truncate">{node.label}</span>
                        <span class={`text-[9px] px-1 py-0.5 rounded ${
                          isSelected()
                            ? "bg-white/20"
                            : isTarget()
                              ? "bg-red-500/20 text-red-400"
                              : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {isTarget() ? "T" : "H"}
                        </span>
                      </div>
                      <div class={`text-[10px] truncate ${
                        isSelected() ? "text-white/70" : "text-foreground-muted"
                      }`}>
                        {node.category} · {node.description}
                      </div>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Footer hint */}
      <div class="px-3 py-1.5 border-t border-border text-[10px] text-foreground-muted flex items-center justify-between">
        <span>Press Space on canvas to open</span>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-0.5">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Host
          </span>
          <span class="flex items-center gap-0.5">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
            Target
          </span>
        </div>
      </div>
    </div>
  );
};

export default QuickNodeMenu;
