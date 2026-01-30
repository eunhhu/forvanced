import { Component, For, Show, createMemo } from "solid-js";
import { designerStore, UIComponent, ComponentType } from "../../stores/designer";

// Icons for component types
const ComponentIcons: Record<ComponentType, string> = {
  button: "🔘",
  toggle: "🔀",
  slider: "🎚️",
  label: "🏷️",
  input: "📝",
  dropdown: "📋",
  group: "📁",
  spacer: "⬜",
  stack: "📚",
  page: "📄",
  scroll: "📜",
  divider: "➖",
  card: "🃏",
};

// Layer item component (recursive for hierarchy)
const LayerItem: Component<{
  component: UIComponent;
  depth: number;
}> = (props) => {
  const isSelected = createMemo(
    () => designerStore.selectedId() === props.component.id,
  );
  const hasChildren = createMemo(
    () => (props.component.children?.length ?? 0) > 0,
  );
  const isExpanded = createMemo(() =>
    designerStore.isExpanded(props.component.id),
  );
  const children = createMemo(() =>
    designerStore.getChildren(props.component.id),
  );
  const isVisible = createMemo(() => props.component.visible !== false);
  const isLocked = createMemo(() => props.component.locked === true);

  const handleSelect = (e: MouseEvent) => {
    e.stopPropagation();
    designerStore.setSelectedId(props.component.id);
  };

  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    designerStore.toggleExpanded(props.component.id);
  };

  const handleToggleVisibility = (e: MouseEvent) => {
    e.stopPropagation();
    designerStore.toggleVisibility(props.component.id);
  };

  const handleToggleLock = (e: MouseEvent) => {
    e.stopPropagation();
    designerStore.toggleLock(props.component.id);
  };

  return (
    <div class="select-none">
      {/* Layer row */}
      <div
        class={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface-hover rounded text-sm ${
          isSelected() ? "bg-accent/20 text-accent" : "text-text-secondary"
        }`}
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* Expand/collapse button */}
        <button
          class={`w-4 h-4 flex items-center justify-center text-xs ${
            hasChildren() ? "opacity-100" : "opacity-0"
          }`}
          onClick={handleToggleExpand}
          disabled={!hasChildren()}
        >
          {isExpanded() ? "▼" : "▶"}
        </button>

        {/* Component icon */}
        <span class="w-4 text-center">
          {ComponentIcons[props.component.type] || "📦"}
        </span>

        {/* Component label */}
        <span
          class={`flex-1 truncate ${!isVisible() ? "opacity-40 line-through" : ""}`}
        >
          {props.component.label || props.component.type}
        </span>

        {/* Visibility toggle */}
        <button
          class={`w-5 h-5 flex items-center justify-center text-xs rounded hover:bg-surface-active ${
            isVisible() ? "text-text-secondary" : "text-text-tertiary"
          }`}
          onClick={handleToggleVisibility}
          title={isVisible() ? "Hide" : "Show"}
        >
          {isVisible() ? "👁" : "👁‍🗨"}
        </button>

        {/* Lock toggle */}
        <button
          class={`w-5 h-5 flex items-center justify-center text-xs rounded hover:bg-surface-active ${
            isLocked() ? "text-warning" : "text-text-tertiary"
          }`}
          onClick={handleToggleLock}
          title={isLocked() ? "Unlock" : "Lock"}
        >
          {isLocked() ? "🔒" : "🔓"}
        </button>
      </div>

      {/* Children */}
      <Show when={hasChildren() && isExpanded()}>
        <div class="border-l border-border ml-4">
          <For each={children()}>
            {(child) => <LayerItem component={child} depth={props.depth + 1} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

// Main Layers Panel
export const LayersPanel: Component = () => {
  const rootComponents = createMemo(() => designerStore.getRootComponents());
  const selectedId = createMemo(() => designerStore.selectedId());
  const hasSelection = createMemo(() => selectedId() !== null);

  const handleBringToFront = () => {
    const id = selectedId();
    if (id) designerStore.bringToFront(id);
  };

  const handleSendToBack = () => {
    const id = selectedId();
    if (id) designerStore.sendToBack(id);
  };

  const handleBringForward = () => {
    const id = selectedId();
    if (id) designerStore.bringForward(id);
  };

  const handleSendBackward = () => {
    const id = selectedId();
    if (id) designerStore.sendBackward(id);
  };

  return (
    <div class="flex flex-col h-full bg-surface overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 class="text-sm font-medium text-text-primary">Layers</h3>
        <span class="text-xs text-text-tertiary">
          {designerStore.components().length}
        </span>
      </div>

      {/* Z-index controls toolbar */}
      <div class="flex items-center gap-1 px-2 py-1 border-b border-border bg-surface-raised">
        <button
          class="px-2 py-1 text-xs rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleBringToFront}
          disabled={!hasSelection()}
          title="Bring to Front"
        >
          ⬆⬆
        </button>
        <button
          class="px-2 py-1 text-xs rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleBringForward}
          disabled={!hasSelection()}
          title="Bring Forward"
        >
          ⬆
        </button>
        <button
          class="px-2 py-1 text-xs rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleSendBackward}
          disabled={!hasSelection()}
          title="Send Backward"
        >
          ⬇
        </button>
        <button
          class="px-2 py-1 text-xs rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleSendToBack}
          disabled={!hasSelection()}
          title="Send to Back"
        >
          ⬇⬇
        </button>
      </div>

      {/* Layer tree */}
      <div class="flex-1 overflow-y-auto py-1">
        <Show
          when={rootComponents().length > 0}
          fallback={
            <div class="px-3 py-4 text-xs text-text-tertiary text-center">
              No components yet.
              <br />
              Drag components from the palette.
            </div>
          }
        >
          <For each={rootComponents()}>
            {(component) => <LayerItem component={component} depth={0} />}
          </For>
        </Show>
      </div>

      {/* Footer - selected info */}
      <Show when={hasSelection()}>
        <div class="px-3 py-2 border-t border-border text-xs text-text-tertiary">
          <div class="flex justify-between">
            <span>z-index:</span>
            <span class="text-text-secondary">
              {designerStore.getSelectedComponent()?.zIndex ?? "-"}
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default LayersPanel;
