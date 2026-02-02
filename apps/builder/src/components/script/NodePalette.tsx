import { Component, For, Show, createSignal, createMemo, createEffect } from "solid-js";
import {
  scriptStore,
  type ScriptNodeType,
  nodeCategoryInfo,
  getNodeContext,
  type NodeCategoryInfo,
} from "@/stores/script";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  IconSearch,
  IconZap,
  IconWorkflow,
  IconGitBranch,
  MemoryIcon,
  IconVariable,
  IconCalculator,
  IconFunction,
  IconTerminal,
  PlusIcon,
  IconHash,
  IconList,
  IconBox,
  IconArrowSwap,
  TrashIcon,
  CopyIcon,
  EditIcon,
} from "@/components/common/Icons";

// Context filter type
type ContextFilter = "all" | "host" | "target";

// Category icons mapped by icon name
const categoryIconMap: Record<string, Component<{ class?: string }>> = {
  hash: IconHash,
  zap: IconZap,
  workflow: IconWorkflow,
  memory: MemoryIcon,
  function: IconFunction,
  variable: IconVariable,
  list: IconList,
  box: IconBox,
  calculator: IconCalculator,
  terminal: IconTerminal,
  arrowswap: IconArrowSwap,
  gitbranch: IconGitBranch,
  cpu: IconWorkflow, // Fallback
  play: IconZap, // Fallback
  layout: IconBox, // Fallback
};

// Get category icon component
function getCategoryIcon(info: NodeCategoryInfo): Component<{ class?: string }> {
  return categoryIconMap[info.icon] ?? IconWorkflow;
}

// Get category color classes
function getCategoryColorClass(info: NodeCategoryInfo, variant: "text" | "bg" | "border"): string {
  const colorMap: Record<string, Record<string, string>> = {
    pink: { text: "text-pink-400", bg: "bg-pink-500/20", border: "border-pink-500/50" },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/50" },
    blue: { text: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/50" },
    purple: { text: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/50" },
    violet: { text: "text-violet-400", bg: "bg-violet-500/20", border: "border-violet-500/50" },
    green: { text: "text-green-400", bg: "bg-green-500/20", border: "border-green-500/50" },
    yellow: { text: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/50" },
    indigo: { text: "text-indigo-400", bg: "bg-indigo-500/20", border: "border-indigo-500/50" },
    sky: { text: "text-sky-400", bg: "bg-sky-500/20", border: "border-sky-500/50" },
    orange: { text: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/50" },
    teal: { text: "text-teal-400", bg: "bg-teal-500/20", border: "border-teal-500/50" },
    lime: { text: "text-lime-400", bg: "bg-lime-500/20", border: "border-lime-500/50" },
    red: { text: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/50" },
    rose: { text: "text-rose-400", bg: "bg-rose-500/20", border: "border-rose-500/50" },
    cyan: { text: "text-cyan-400", bg: "bg-cyan-500/20", border: "border-cyan-500/50" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/50" },
    slate: { text: "text-slate-400", bg: "bg-slate-500/20", border: "border-slate-500/50" },
    gray: { text: "text-gray-400", bg: "bg-gray-500/20", border: "border-gray-500/50" },
  };
  return colorMap[info.color]?.[variant] ?? colorMap.blue[variant];
}

// Recent nodes storage key
const RECENT_NODES_KEY = "forvanced:recentNodes";
const MAX_RECENT_NODES = 5;

// Get recent nodes from localStorage
function getRecentNodes(): ScriptNodeType[] {
  try {
    const stored = localStorage.getItem(RECENT_NODES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Add node to recent list
function addToRecentNodes(nodeType: ScriptNodeType) {
  const recent = getRecentNodes().filter((t) => t !== nodeType);
  recent.unshift(nodeType);
  const trimmed = recent.slice(0, MAX_RECENT_NODES);
  localStorage.setItem(RECENT_NODES_KEY, JSON.stringify(trimmed));
}

// Script item with inline action buttons
const ScriptItem: Component<{ script: { id: string; name: string } }> = (props) => {
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal("");

  const isSelected = () => scriptStore.currentScriptId() === props.script.id;

  const handleStartRename = (e: MouseEvent) => {
    e.stopPropagation();
    setRenameValue(props.script.name);
    setIsRenaming(true);
  };

  const handleRenameSubmit = () => {
    const newName = renameValue().trim();
    if (newName && newName !== props.script.name) {
      scriptStore.renameScript(props.script.id, newName);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  };

  const handleDuplicate = (e: MouseEvent) => {
    e.stopPropagation();
    scriptStore.duplicateScript(props.script.id);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete script "${props.script.name}"?`)) {
      scriptStore.deleteScript(props.script.id);
    }
  };

  return (
    <Show
      when={!isRenaming()}
      fallback={
        <input
          type="text"
          class="w-full px-2 py-1 text-xs rounded bg-surface border border-accent outline-none text-foreground"
          value={renameValue()}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleRenameKeyDown}
          autofocus
        />
      }
    >
      <div
        class={`group flex items-center gap-1 px-1 py-0.5 rounded transition-colors cursor-pointer ${
          isSelected() ? "bg-accent text-white" : "hover:bg-surface-hover"
        }`}
        onClick={() => scriptStore.setCurrentScriptId(props.script.id)}
      >
        <span class="flex-1 px-1 py-1 text-xs truncate">{props.script.name}</span>
        <div
          class={`flex items-center gap-0.5 ${isSelected() ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <button
            class={`p-0.5 rounded ${isSelected() ? "hover:bg-white/20" : "hover:bg-surface-alt"}`}
            onClick={handleStartRename}
            title="Rename (F2)"
          >
            <EditIcon class="w-3 h-3" />
          </button>
          <button
            class={`p-0.5 rounded ${isSelected() ? "hover:bg-white/20" : "hover:bg-surface-alt"}`}
            onClick={handleDuplicate}
            title="Duplicate (Cmd+D)"
          >
            <CopyIcon class="w-3 h-3" />
          </button>
          <button
            class={`p-0.5 rounded ${isSelected() ? "hover:bg-white/20 text-red-300" : "hover:bg-surface-alt text-error"}`}
            onClick={handleDelete}
            title="Delete"
          >
            <TrashIcon class="w-3 h-3" />
          </button>
        </div>
      </div>
    </Show>
  );
};

// Node item component with context badge
const NodeItem: Component<{
  node: { type: ScriptNodeType; label: string; description: string; category: string };
  onDragStart: (e: DragEvent, type: ScriptNodeType) => void;
  showContextBadge?: boolean;
}> = (props) => {
  const nodeContext = () => getNodeContext(props.node.type);
  const isTarget = () => nodeContext() === "target";

  return (
    <div
      class={`mx-2 mb-1 px-2 py-1.5 rounded border cursor-grab hover:border-accent/50 transition-all group ${
        isTarget()
          ? "bg-gradient-to-r from-red-950/30 to-background border-red-500/30 hover:border-red-400/50"
          : "bg-background border-border/50"
      }`}
      draggable={true}
      onDragStart={(e) => {
        props.onDragStart(e, props.node.type);
        addToRecentNodes(props.node.type);
      }}
    >
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium flex-1">{props.node.label}</span>
        <Show when={props.showContextBadge !== false}>
          <span
            class={`text-[8px] px-1 py-0.5 rounded font-medium ${
              isTarget()
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            }`}
            title={
              isTarget()
                ? "Runs in target process (requires Frida)"
                : "Runs locally (no Frida required)"
            }
          >
            {isTarget() ? "TARGET" : "HOST"}
          </span>
        </Show>
      </div>
      <div class="text-[10px] text-foreground-muted truncate mt-0.5">
        {props.node.description}
      </div>
    </div>
  );
};

export const NodePalette: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [contextFilter, setContextFilter] = createSignal<ContextFilter>("all");
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(
    new Set(["Constants", "Events", "Flow", "Variable"])
  );
  const [recentNodes, setRecentNodes] = createSignal<ScriptNodeType[]>(getRecentNodes());
  const [showRecent, setShowRecent] = createSignal(true);

  // Refresh recent nodes on mount and when nodes are added
  createEffect(() => {
    setRecentNodes(getRecentNodes());
  });

  const categories = createMemo(() => scriptStore.getNodeCategories());

  // Filter by search and context
  const filteredCategories = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const filter = contextFilter();

    return categories()
      .map((cat) => {
        const catInfo = nodeCategoryInfo[cat.category];

        // Filter nodes within category
        const filteredNodes = cat.nodes.filter((n) => {
          // Search filter
          const matchesSearch =
            !query ||
            n.label.toLowerCase().includes(query) ||
            n.description.toLowerCase().includes(query) ||
            n.type.toLowerCase().includes(query);

          // Context filter
          const nodeContext = getNodeContext(n.type);
          const matchesContext =
            filter === "all" ||
            (filter === "host" && nodeContext === "host") ||
            (filter === "target" && nodeContext === "target");

          return matchesSearch && matchesContext;
        });

        return {
          ...cat,
          nodes: filteredNodes,
          info: catInfo,
        };
      })
      .filter((cat) => cat.nodes.length > 0);
  });

  // Get recent nodes templates
  const recentNodeTemplates = createMemo(() => {
    const recent = recentNodes();
    return recent
      .map((type) => scriptStore.nodeTemplates.find((t) => t.type === type))
      .filter(Boolean);
  });

  const toggleCategory = (category: string) => {
    const expanded = new Set(expandedCategories());
    if (expanded.has(category)) {
      expanded.delete(category);
    } else {
      expanded.add(category);
    }
    setExpandedCategories(expanded);
  };

  const handleDragStart = (e: DragEvent, type: ScriptNodeType) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("nodeType", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const hasScript = createMemo(() => scriptStore.getCurrentScript() !== null);

  // Keyboard shortcut to focus search
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('[data-search-input]');
      input?.focus();
    }
  };

  return (
    <div class="w-60 border-r border-border bg-surface flex flex-col" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div class="p-3 border-b border-border">
        <h3 class="font-medium text-sm">Nodes</h3>
        <p class="text-xs text-foreground-muted mt-0.5">Drag to canvas</p>
      </div>

      {/* Search */}
      <div class="p-2 border-b border-border">
        <div class="relative">
          <IconSearch class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            type="text"
            data-search-input
            placeholder="Search nodes... (Cmd+F)"
            class="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>

        {/* Context filter tabs */}
        <div class="flex mt-2 gap-1 p-0.5 bg-background rounded-lg border border-border">
          <button
            class={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
              contextFilter() === "all"
                ? "bg-accent text-white"
                : "text-foreground-muted hover:bg-surface-hover"
            }`}
            onClick={() => setContextFilter("all")}
          >
            All
          </button>
          <button
            class={`flex-1 px-2 py-1 text-[10px] rounded transition-colors flex items-center justify-center gap-1 ${
              contextFilter() === "host"
                ? "bg-blue-600 text-white"
                : "text-foreground-muted hover:bg-surface-hover"
            }`}
            onClick={() => setContextFilter("host")}
            title="Host nodes run locally without Frida"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Host
          </button>
          <button
            class={`flex-1 px-2 py-1 text-[10px] rounded transition-colors flex items-center justify-center gap-1 ${
              contextFilter() === "target"
                ? "bg-red-600 text-white"
                : "text-foreground-muted hover:bg-surface-hover"
            }`}
            onClick={() => setContextFilter("target")}
            title="Target nodes require Frida connection"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-red-400" />
            Target
          </button>
        </div>
      </div>

      {/* Categories */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={hasScript()}
          fallback={
            <div class="p-4 text-center text-foreground-muted text-xs">
              Create a script to use nodes
            </div>
          }
        >
          {/* Recent nodes section */}
          <Show when={recentNodeTemplates().length > 0 && !searchQuery() && contextFilter() === "all"}>
            <div class="border-b border-border">
              <button
                class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
                onClick={() => setShowRecent(!showRecent())}
              >
                <Show when={showRecent()} fallback={<ChevronRightIcon class="w-3 h-3" />}>
                  <ChevronDownIcon class="w-3 h-3" />
                </Show>
                <span class="text-xs font-medium text-foreground-muted">Recent</span>
                <span class="text-[10px] text-foreground-muted ml-auto">
                  {recentNodeTemplates().length}
                </span>
              </button>
              <Show when={showRecent()}>
                <div class="pb-2 max-h-32 overflow-y-auto">
                  <For each={recentNodeTemplates()}>
                    {(node) => (
                      <NodeItem
                        node={node!}
                        onDragStart={handleDragStart}
                        showContextBadge={true}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* Category list */}
          <For each={filteredCategories()}>
            {(cat) => {
              const info = () => cat.info ?? nodeCategoryInfo.Flow;
              const IconComp = getCategoryIcon(info());
              const isExpanded = () =>
                expandedCategories().has(cat.category) || searchQuery() !== "";
              const isTargetCategory = () => info().context === "target";

              return (
                <div class="border-b border-border last:border-b-0">
                  {/* Category header */}
                  <button
                    class={`w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors ${
                      isTargetCategory() ? "bg-red-950/10" : ""
                    }`}
                    onClick={() => toggleCategory(cat.category)}
                  >
                    <Show when={isExpanded()} fallback={<ChevronRightIcon class="w-3 h-3" />}>
                      <ChevronDownIcon class="w-3 h-3" />
                    </Show>
                    <IconComp class={`w-3.5 h-3.5 ${getCategoryColorClass(info(), "text")}`} />
                    <span class="text-xs font-medium">{cat.category}</span>
                    {/* Category context indicator */}
                    <span
                      class={`text-[8px] px-1 rounded ${
                        isTargetCategory()
                          ? "bg-red-500/20 text-red-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {isTargetCategory() ? "T" : "H"}
                    </span>
                    <span class="text-[10px] text-foreground-muted ml-auto">
                      {cat.nodes.length}
                    </span>
                  </button>

                  {/* Nodes in category */}
                  <Show when={isExpanded()}>
                    <div class="pb-2">
                      <For each={cat.nodes}>
                        {(node) => (
                          <NodeItem
                            node={node}
                            onDragStart={handleDragStart}
                            showContextBadge={false}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>

          <Show when={filteredCategories().length === 0}>
            <div class="p-4 text-center text-foreground-muted text-xs">
              No nodes found
              <Show when={contextFilter() !== "all"}>
                <button
                  class="block mx-auto mt-2 text-accent hover:underline"
                  onClick={() => setContextFilter("all")}
                >
                  Show all nodes
                </button>
              </Show>
            </div>
          </Show>
        </Show>
      </div>

      {/* Legend */}
      <div class="px-3 py-2 border-t border-border text-[10px] text-foreground-muted">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-blue-500" />
            <span>Host (local)</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-red-500" />
            <span>Target (Frida)</span>
          </div>
        </div>
      </div>

      {/* Script list */}
      <div class="border-t border-border">
        <div class="p-2">
          <div class="flex items-center justify-between mb-2 px-1">
            <div class="text-[10px] font-medium text-foreground-muted uppercase tracking-wider">
              Scripts
            </div>
            <button
              class="p-0.5 hover:bg-surface-hover rounded"
              onClick={() => {
                const name = `Script ${scriptStore.scripts().length + 1}`;
                scriptStore.createScript(name);
              }}
              title="Add Script"
            >
              <PlusIcon class="w-3 h-3" />
            </button>
          </div>
          <For each={scriptStore.scripts()}>
            {(script) => <ScriptItem script={script} />}
          </For>
          <Show when={scriptStore.scripts().length === 0}>
            <div class="px-2 py-1 text-[10px] text-foreground-muted">No scripts yet</div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default NodePalette;
