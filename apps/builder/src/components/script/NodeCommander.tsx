import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import {
  scriptStore,
  type ScriptNodeType,
  getNodeContext,
} from "@/stores/script";
import { IconSearch, MemoryIcon, IconWorkflow, IconZap } from "@/components/common/Icons";

interface NodeCommanderProps {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  onSelect: (type: ScriptNodeType, x: number, y: number) => void;
  onClose: () => void;
}

// Recent nodes storage
const RECENT_NODES_KEY = "forvanced:recentNodes";
const MAX_RECENT = 8;

function getRecentNodes(): ScriptNodeType[] {
  try {
    const stored = localStorage.getItem(RECENT_NODES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentNode(type: ScriptNodeType) {
  try {
    const recent = getRecentNodes().filter((t) => t !== type);
    recent.unshift(type);
    localStorage.setItem(RECENT_NODES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage errors
  }
}

// Fuzzy match scoring
function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 100;

  // Starts with
  if (lowerText.startsWith(lowerQuery)) return 80;

  // Contains
  if (lowerText.includes(lowerQuery)) return 60;

  // Fuzzy match - characters in order
  let queryIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIdx]) {
      score += 10 + consecutiveBonus;
      consecutiveBonus += 5; // Bonus for consecutive matches
      queryIdx++;
    } else {
      consecutiveBonus = 0;
    }
  }

  // All query chars must be found
  if (queryIdx < lowerQuery.length) return 0;

  return score;
}

type NodeTemplate = (typeof scriptStore.nodeTemplates)[number];
type CategoryFilter = "all" | "host" | "target" | "events" | "memory" | "flow" | "variables";

export const NodeCommander: Component<NodeCommanderProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [categoryFilter, setCategoryFilter] = createSignal<CategoryFilter>("all");

  // Category filter options
  const categoryFilters: { value: CategoryFilter; label: string; shortcut: string }[] = [
    { value: "all", label: "All", shortcut: "" },
    { value: "host", label: "Host", shortcut: "@h" },
    { value: "target", label: "Target", shortcut: "@t" },
    { value: "events", label: "Events", shortcut: "@e" },
    { value: "memory", label: "Memory", shortcut: "@m" },
    { value: "flow", label: "Flow", shortcut: "@f" },
    { value: "variables", label: "Variables", shortcut: "@v" },
  ];

  // Parse query for category prefix
  const parsedQuery = createMemo(() => {
    const query = searchQuery().trim();

    // Check for category prefix
    for (const filter of categoryFilters) {
      if (filter.shortcut && query.startsWith(filter.shortcut)) {
        return {
          filter: filter.value,
          search: query.slice(filter.shortcut.length).trim(),
        };
      }
    }

    return { filter: categoryFilter(), search: query };
  });

  // All node templates
  const allNodes = createMemo(() => scriptStore.nodeTemplates);

  // Filtered and scored nodes
  const filteredNodes = createMemo((): NodeTemplate[] => {
    const { filter, search } = parsedQuery();
    let nodes = [...allNodes()];

    // Apply category filter
    if (filter !== "all") {
      nodes = nodes.filter((n) => {
        const context = getNodeContext(n.type);
        switch (filter) {
          case "host":
            return context === "host";
          case "target":
            return context === "target";
          case "events":
            return n.category === "Events";
          case "memory":
            return n.category === "Memory" || n.category === "Pointer";
          case "flow":
            return n.category === "Flow";
          case "variables":
            return n.category === "Variable";
          default:
            return true;
        }
      });
    }

    if (!search) {
      // No search query - show recent first, then by category
      const recent = getRecentNodes();
      const recentNodes = recent
        .map((type) => nodes.find((n) => n.type === type))
        .filter((n): n is NodeTemplate => n !== undefined);

      const otherNodes = nodes
        .filter((n) => !recent.includes(n.type))
        .sort((a, b) => {
          // Sort by category, then by label
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.label.localeCompare(b.label);
        });

      return [...recentNodes, ...otherNodes].slice(0, 20);
    }

    // Score and sort nodes by search relevance
    const scored = nodes.map((node) => {
      const labelScore = fuzzyScore(search, node.label);
      const typeScore = fuzzyScore(search, node.type) * 0.8;
      const descScore = fuzzyScore(search, node.description) * 0.5;
      const catScore = fuzzyScore(search, node.category) * 0.6;

      return {
        node,
        score: Math.max(labelScore, typeScore, descScore, catScore),
      };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.node)
      .slice(0, 20);
  });

  // Reset selected index when results change
  createEffect(() => {
    filteredNodes();
    setSelectedIndex(0);
  });

  // Scroll selected item into view
  createEffect(() => {
    const index = selectedIndex();
    if (listRef) {
      const items = listRef.querySelectorAll("[data-node-item]");
      const item = items[index] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
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
    addRecentNode(type);
    props.onSelect(type, props.canvasX, props.canvasY);
    props.onClose();
  };

  // Get icon for node
  const getNodeIcon = (node: NodeTemplate) => {
    if (node.type.startsWith("event_")) {
      return IconZap;
    }
    return getNodeContext(node.type) === "target" ? MemoryIcon : IconWorkflow;
  };

  return (
    <div
      ref={menuRef}
      class="fixed z-50 w-96 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm"
      style={{
        left: `${props.x}px`,
        top: `${props.y}px`,
        "max-height": "480px",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div class="p-3 border-b border-border bg-surface/80">
        <div class="relative">
          <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search nodes... (@h host, @t target, @e events)"
            class="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>

        {/* Category pills */}
        <div class="flex items-center gap-1.5 mt-2 overflow-x-auto pb-0.5">
          <For each={categoryFilters}>
            {(filter) => {
              const isActive = () => parsedQuery().filter === filter.value;
              return (
                <button
                  class={`px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap transition-colors ${
                    isActive()
                      ? "bg-accent text-white"
                      : "bg-background hover:bg-surface-hover text-foreground-muted"
                  }`}
                  onClick={() => {
                    if (filter.shortcut) {
                      setSearchQuery(filter.shortcut + " ");
                    } else {
                      setSearchQuery("");
                    }
                    setCategoryFilter(filter.value);
                    inputRef?.focus();
                  }}
                >
                  {filter.label}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Results */}
      <div ref={listRef} class="max-h-80 overflow-y-auto">
        <Show
          when={filteredNodes().length > 0}
          fallback={
            <div class="p-6 text-center text-foreground-muted">
              <div class="text-sm">No nodes found</div>
              <div class="text-xs mt-1">Try a different search term or category</div>
            </div>
          }
        >
          {/* Recent section header */}
          <Show when={!parsedQuery().search && getRecentNodes().length > 0}>
            <div class="px-3 pt-2 pb-1">
              <span class="text-[10px] font-medium text-foreground-muted uppercase tracking-wider">
                Recent
              </span>
            </div>
          </Show>

          <div class="p-1.5">
            <For each={filteredNodes()}>
              {(node, index) => {
                const isTarget = () => getNodeContext(node.type) === "target";
                const isEvent = () => node.type.startsWith("event_");
                const isSelected = () => index() === selectedIndex();
                const isRecent = () => !parsedQuery().search && getRecentNodes().includes(node.type);
                const Icon = getNodeIcon(node);

                // Show category divider for non-recent nodes
                const showCategoryDivider = () => {
                  if (parsedQuery().search) return false;
                  const recentCount = getRecentNodes().filter((t) =>
                    filteredNodes().some((n) => n.type === t)
                  ).length;
                  if (index() === recentCount && recentCount > 0) return true;
                  return false;
                };

                return (
                  <>
                    <Show when={showCategoryDivider()}>
                      <div class="px-2 pt-3 pb-1">
                        <span class="text-[10px] font-medium text-foreground-muted uppercase tracking-wider">
                          All Nodes
                        </span>
                      </div>
                    </Show>
                    <button
                      data-node-item
                      class={`w-full px-3 py-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                        isSelected()
                          ? "bg-accent text-white shadow-lg shadow-accent/20"
                          : "hover:bg-surface-hover"
                      }`}
                      onClick={() => handleSelect(node.type)}
                      onMouseEnter={() => setSelectedIndex(index())}
                    >
                      {/* Icon */}
                      <div
                        class={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected()
                            ? "bg-white/20"
                            : isEvent()
                              ? "bg-emerald-500/20"
                              : isTarget()
                                ? "bg-red-500/20"
                                : "bg-blue-500/20"
                        }`}
                      >
                        <Icon
                          class={`w-4 h-4 ${
                            isSelected()
                              ? "text-white"
                              : isEvent()
                                ? "text-emerald-400"
                                : isTarget()
                                  ? "text-red-400"
                                  : "text-blue-400"
                          }`}
                        />
                      </div>

                      {/* Node info */}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium truncate">{node.label}</span>
                          {/* Context badge */}
                          <span
                            class={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                              isSelected()
                                ? "bg-white/20 text-white"
                                : isTarget()
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {isTarget() ? "TARGET" : "HOST"}
                          </span>
                          {/* Recent indicator */}
                          <Show when={isRecent() && !isSelected()}>
                            <span class="text-[9px] text-foreground-muted">•</span>
                          </Show>
                        </div>
                        <div
                          class={`text-xs truncate ${
                            isSelected() ? "text-white/70" : "text-foreground-muted"
                          }`}
                        >
                          <span class="font-medium">{node.category}</span>
                          <span class="mx-1">·</span>
                          <span>{node.description}</span>
                        </div>
                      </div>

                      {/* Keyboard hint for selected */}
                      <Show when={isSelected()}>
                        <div class="text-[10px] text-white/60 flex-shrink-0">↵</div>
                      </Show>
                    </button>
                  </>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div class="px-3 py-2 border-t border-border bg-surface/80 flex items-center justify-between text-[10px] text-foreground-muted">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="px-1 py-0.5 bg-background rounded border border-border">↑↓</kbd>
            Navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 py-0.5 bg-background rounded border border-border">↵</kbd>
            Select
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 py-0.5 bg-background rounded border border-border">Esc</kbd>
            Close
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-blue-500" />
            Host
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-red-500" />
            Target
          </span>
        </div>
      </div>
    </div>
  );
};

export default NodeCommander;
