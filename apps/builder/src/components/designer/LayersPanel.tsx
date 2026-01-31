import { Component, For, Show, createMemo, createSignal } from "solid-js";
import {
  designerStore,
  UIComponent,
  ComponentType,
} from "../../stores/designer";
import {
  IconButton,
  IconToggle,
  IconSlider,
  IconLabel,
  IconInput,
  IconDropdown,
  IconGroup,
  IconSpacer,
  IconStack,
  IconPage,
  IconScroll,
  IconDivider,
  IconCard,
  IconEye,
  IconEyeOff,
  IconLock,
  IconUnlock,
  IconArrowUp,
  IconArrowDown,
  IconArrowUpToLine,
  IconArrowDownToLine,
  IconCornerDownRight,
  IconCornerLeftUp,
  ChevronDownIcon,
  ChevronRightIcon,
  IconBox,
} from "../common/Icons";

// Component type icon mapping
const ComponentIconMap: Record<ComponentType, Component<{ class?: string }>> = {
  button: IconButton,
  toggle: IconToggle,
  slider: IconSlider,
  label: IconLabel,
  input: IconInput,
  dropdown: IconDropdown,
  group: IconGroup,
  spacer: IconSpacer,
  stack: IconStack,
  page: IconPage,
  scroll: IconScroll,
  divider: IconDivider,
  card: IconCard,
  container: IconBox,
};

// Layer item component (recursive for hierarchy)
const LayerItem: Component<{
  component: UIComponent;
  depth: number;
  onSetParent?: (newParentId: string) => void;
  settingParentFor?: string[]; // Array of component IDs being reparented
}> = (props) => {
  // Use multi-selection system
  const isSelected = createMemo(
    () => designerStore.isSelected(props.component.id),
  );
  const isPrimarySelected = createMemo(
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

  // Check if this is a container type
  const isContainer = createMemo(() =>
    ["group", "stack", "page", "scroll", "card"].includes(props.component.type),
  );

  // Check if we're setting parent for this component (any in the array)
  const isSettingParent = createMemo(
    () => (props.settingParentFor ?? []).includes(props.component.id),
  );

  // Can be parent target (not self, not descendant of any setting parent)
  const canBeParentTarget = createMemo(() => {
    const settingFor = props.settingParentFor ?? [];
    if (settingFor.length === 0) return false;
    // Can't be target if this component is one of the ones being reparented
    if (settingFor.includes(props.component.id)) return false;
    // Can't be target if this component is a descendant of any being reparented
    for (const id of settingFor) {
      if (designerStore.isDescendantOf(props.component.id, id)) return false;
    }
    return isContainer();
  });

  const handleSelect = (e: MouseEvent) => {
    e.stopPropagation();
    const settingFor = props.settingParentFor ?? [];
    if (settingFor.length > 0 && canBeParentTarget()) {
      props.onSetParent?.(props.component.id);
    } else {
      // Use Shift+click for multi-select (Adobe style)
      const addToSelection = e.shiftKey;
      designerStore.selectComponent(props.component.id, addToSelection);
    }
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

  const IconComponent = ComponentIconMap[props.component.type] || IconBox;

  // Selection style based on primary/secondary selection
  const getSelectionClass = () => {
    if (isPrimarySelected()) {
      return "bg-accent/30 text-accent";
    }
    if (isSelected()) {
      return "bg-accent/15 text-accent/80";
    }
    if (isSettingParent()) {
      return "bg-warning/20 text-warning";
    }
    if (canBeParentTarget()) {
      return "bg-success/10 text-success hover:bg-success/20";
    }
    return "text-text-secondary";
  };

  return (
    <div class="select-none">
      {/* Layer row */}
      <div
        class={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface-hover rounded text-sm ${getSelectionClass()}`}
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* Expand/collapse button */}
        <button
          class={`w-4 h-4 flex items-center justify-center ${
            hasChildren() ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={handleToggleExpand}
          disabled={!hasChildren()}
        >
          {isExpanded() ? (
            <ChevronDownIcon class="w-3 h-3" />
          ) : (
            <ChevronRightIcon class="w-3 h-3" />
          )}
        </button>

        {/* Component icon */}
        <span class="w-4 h-4 flex items-center justify-center">
          <IconComponent class="w-3.5 h-3.5" />
        </span>

        {/* Component label */}
        <span
          class={`flex-1 truncate ${!isVisible() ? "opacity-40 line-through" : ""}`}
        >
          {props.component.label || props.component.type}
        </span>

        {/* Parent indicator */}
        <Show when={props.component.parentId}>
          <span class="w-4 h-4 flex items-center justify-center text-text-tertiary" title="Has parent">
            <IconCornerDownRight class="w-3 h-3" />
          </span>
        </Show>

        {/* Visibility toggle */}
        <button
          class={`w-5 h-5 flex items-center justify-center rounded hover:bg-surface-active ${
            isVisible() ? "text-text-secondary" : "text-text-tertiary"
          }`}
          onClick={handleToggleVisibility}
          title={isVisible() ? "Hide" : "Show"}
        >
          {isVisible() ? (
            <IconEye class="w-3.5 h-3.5" />
          ) : (
            <IconEyeOff class="w-3.5 h-3.5" />
          )}
        </button>

        {/* Lock toggle */}
        <button
          class={`w-5 h-5 flex items-center justify-center rounded hover:bg-surface-active ${
            isLocked() ? "text-warning" : "text-text-tertiary"
          }`}
          onClick={handleToggleLock}
          title={isLocked() ? "Unlock" : "Lock"}
        >
          {isLocked() ? (
            <IconLock class="w-3.5 h-3.5" />
          ) : (
            <IconUnlock class="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Children */}
      <Show when={hasChildren() && isExpanded()}>
        <div class="border-l border-border ml-4">
          <For each={children()}>
            {(child) => (
              <LayerItem
                component={child}
                depth={props.depth + 1}
                onSetParent={props.onSetParent}
                settingParentFor={props.settingParentFor}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// Main Layers Panel
export const LayersPanel: Component = () => {
  // Changed to array to support multi-selection parenting
  const [settingParentFor, setSettingParentFor] = createSignal<string[]>([]);

  const rootComponents = createMemo(() => designerStore.getRootComponents());
  const selectedId = createMemo(() => designerStore.selectedId());
  const selectedCount = createMemo(() => designerStore.selectedIds().size);
  const hasSelection = createMemo(() => selectedCount() > 0);
  const hasMultiSelection = createMemo(() => selectedCount() > 1);
  const selectedComponent = createMemo(() =>
    designerStore.getSelectedComponent(),
  );

  // Check if any selected component has a parent
  const hasParent = createMemo(() => {
    const selectedComps = designerStore.getSelectedComponents();
    return selectedComps.some((c) => !!c.parentId);
  });

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

  const handleStartSetParent = () => {
    // Get all selected component IDs
    const ids = Array.from(designerStore.selectedIds());
    if (ids.length > 0) {
      setSettingParentFor(ids);
    }
  };

  const handleCancelSetParent = () => {
    setSettingParentFor([]);
  };

  const handleSetParent = (newParentId: string) => {
    const childIds = settingParentFor();
    if (childIds.length > 0) {
      // Reparent all selected components
      for (const childId of childIds) {
        // Skip if trying to set self as parent or if target is descendant
        if (childId !== newParentId && !designerStore.isDescendantOf(newParentId, childId)) {
          designerStore.reparentComponent(childId, newParentId);
        }
      }
      setSettingParentFor([]);
    }
  };

  const handleRemoveParent = () => {
    // Remove parent for all selected components that have parents
    const ids = Array.from(designerStore.selectedIds());
    for (const id of ids) {
      const comp = designerStore.components().find((c) => c.id === id);
      if (comp?.parentId) {
        designerStore.reparentComponent(id, null);
      }
    }
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

      {/* Order controls toolbar (stack layout: up = top of screen) */}
      <div class="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-surface-raised">
        <button
          class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleBringToFront}
          disabled={!hasSelection()}
          title="Move to Top"
        >
          <IconArrowUpToLine class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleBringForward}
          disabled={!hasSelection()}
          title="Move Up"
        >
          <IconArrowUp class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleSendBackward}
          disabled={!hasSelection()}
          title="Move Down"
        >
          <IconArrowDown class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={handleSendToBack}
          disabled={!hasSelection()}
          title="Move to Bottom"
        >
          <IconArrowDownToLine class="w-3.5 h-3.5" />
        </button>

        <div class="w-px h-4 bg-border mx-1" />

        {/* Parent/Child controls */}
        <Show when={settingParentFor().length === 0}>
          <button
            class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={handleStartSetParent}
            disabled={!hasSelection()}
            title="Set Parent"
          >
            <IconCornerDownRight class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={handleRemoveParent}
            disabled={!hasSelection() || !hasParent()}
            title="Remove from Parent"
          >
            <IconCornerLeftUp class="w-3.5 h-3.5" />
          </button>
        </Show>

        <Show when={settingParentFor().length > 0}>
          <span class="text-xs text-warning px-2">
            {settingParentFor().length > 1
              ? `Select parent for ${settingParentFor().length} items...`
              : "Select parent..."}
          </span>
          <button
            class="px-2 py-1 text-xs rounded bg-surface-hover hover:bg-surface-active"
            onClick={handleCancelSetParent}
          >
            Cancel
          </button>
        </Show>
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
            {(component) => (
              <LayerItem
                component={component}
                depth={0}
                onSetParent={handleSetParent}
                settingParentFor={settingParentFor()}
              />
            )}
          </For>
        </Show>
      </div>

      {/* Footer - selected info */}
      <Show when={hasSelection()}>
        <div class="px-3 py-2 border-t border-border text-xs text-text-tertiary">
          <Show
            when={hasMultiSelection()}
            fallback={
              <>
                <div class="flex justify-between">
                  <span>z-index:</span>
                  <span class="text-text-secondary">
                    {selectedComponent()?.zIndex ?? "-"}
                  </span>
                </div>
                <Show when={selectedComponent()?.parentId}>
                  <div class="flex justify-between mt-1">
                    <span>parent:</span>
                    <span class="text-text-secondary truncate max-w-[100px]">
                      {designerStore
                        .components()
                        .find((c) => c.id === selectedComponent()?.parentId)?.label ||
                        "unknown"}
                    </span>
                  </div>
                </Show>
              </>
            }
          >
            <div class="flex justify-between">
              <span>Selected:</span>
              <span class="text-accent">
                {selectedCount()} components
              </span>
            </div>
            <div class="text-[10px] text-text-tertiary mt-1">
              Shift+Click to add/remove
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default LayersPanel;
