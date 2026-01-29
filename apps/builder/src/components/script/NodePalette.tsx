import { Component, For, Show, createSignal, createMemo } from "solid-js";
import { scriptStore, type ScriptNodeType } from "@/stores/script";
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
} from "@/components/common/Icons";

// Category icons
const categoryIcons: Record<string, Component<{ class?: string }>> = {
  Flow: IconWorkflow,
  Memory: MemoryIcon,
  Pointer: MemoryIcon,
  Module: IconFunction,
  Variable: IconVariable,
  Math: IconCalculator,
  String: IconTerminal,
  Native: IconTerminal,
  Interceptor: IconZap,
  Output: IconGitBranch,
  Function: IconFunction,
};

// Category colors for visual distinction
const categoryColors: Record<string, string> = {
  Flow: "text-blue-400",
  Memory: "text-purple-400",
  Pointer: "text-violet-400",
  Module: "text-green-400",
  Variable: "text-yellow-400",
  Math: "text-orange-400",
  String: "text-teal-400",
  Native: "text-red-400",
  Interceptor: "text-rose-400",
  Output: "text-cyan-400",
  Function: "text-amber-400",
};

export const NodePalette: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(
    new Set(["Flow", "Memory"])
  );

  const categories = createMemo(() => scriptStore.getNodeCategories());

  const filteredCategories = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return categories();

    return categories()
      .map((cat) => ({
        ...cat,
        nodes: cat.nodes.filter(
          (n) =>
            n.label.toLowerCase().includes(query) ||
            n.description.toLowerCase().includes(query)
        ),
      }))
      .filter((cat) => cat.nodes.length > 0);
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

  return (
    <div class="w-56 border-r border-border bg-surface flex flex-col">
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
            placeholder="Search nodes..."
            class="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
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
          <For each={filteredCategories()}>
            {(cat) => {
              const Icon = categoryIcons[cat.category] ?? IconWorkflow;
              const isExpanded = () =>
                expandedCategories().has(cat.category) || searchQuery() !== "";

              return (
                <div class="border-b border-border last:border-b-0">
                  {/* Category header */}
                  <button
                    class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
                    onClick={() => toggleCategory(cat.category)}
                  >
                    <Show
                      when={isExpanded()}
                      fallback={<ChevronRightIcon class="w-3 h-3" />}
                    >
                      <ChevronDownIcon class="w-3 h-3" />
                    </Show>
                    <Icon class={`w-3.5 h-3.5 ${categoryColors[cat.category]}`} />
                    <span class="text-xs font-medium">{cat.category}</span>
                    <span class="text-[10px] text-foreground-muted ml-auto">
                      {cat.nodes.length}
                    </span>
                  </button>

                  {/* Nodes in category */}
                  <Show when={isExpanded()}>
                    <div class="pb-2">
                      <For each={cat.nodes}>
                        {(node) => (
                          <div
                            class="mx-2 mb-1 px-2 py-1.5 bg-background rounded border border-border/50 cursor-grab hover:border-accent/50 transition-colors"
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, node.type)}
                          >
                            <div class="text-xs font-medium">{node.label}</div>
                            <div class="text-[10px] text-foreground-muted truncate">
                              {node.description}
                            </div>
                          </div>
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
            </div>
          </Show>
        </Show>
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
            {(script) => (
              <button
                class={`w-full px-2 py-1.5 text-left text-xs rounded transition-colors ${
                  scriptStore.currentScriptId() === script.id
                    ? "bg-accent text-white"
                    : "hover:bg-surface-hover"
                }`}
                onClick={() => scriptStore.setCurrentScriptId(script.id)}
              >
                {script.name}
              </button>
            )}
          </For>
          <Show when={scriptStore.scripts().length === 0}>
            <div class="px-2 py-1 text-[10px] text-foreground-muted">
              No scripts yet
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default NodePalette;
