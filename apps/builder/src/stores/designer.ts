import { createSignal, createRoot, createEffect } from "solid-js";
import { projectStore } from "./project";

// UI Component Types
export type ComponentType =
  // Basic Controls
  | "button"
  | "toggle"
  | "slider"
  | "label"
  | "input"
  | "dropdown"
  // Layout Components
  | "group"
  | "spacer"
  | "stack" // Auto stack layout (horizontal/vertical)
  | "page" // Page container with tabs
  | "scroll" // Scrollable container
  | "divider" // Visual separator
  | "card"; // Card container with optional header

// Layout direction for stack
export type LayoutDirection = "horizontal" | "vertical";

// Alignment options
export type Alignment = "start" | "center" | "end" | "stretch" | "space-between";

// Sizing mode for responsive components
export type SizingMode = "fixed" | "fill" | "hug";
// fixed: use exact width/height values
// fill: expand to fill available space in parent (flex-grow: 1)
// hug: shrink to fit content (width/height become min values)

// Page tab definition
export interface PageTab {
  id: string;
  label: string;
}

// Frida Action Categories
export type FridaActionCategory =
  | "memory"
  | "hook"
  | "scanner"
  | "java"
  | "objc"
  | "swift"
  | "process";

// Frida Action Types
export interface FridaAction {
  id: string;
  category: FridaActionCategory;
  name: string;
  description: string;
  params: FridaActionParam[];
}

export interface FridaActionParam {
  name: string;
  type:
    | "address"
    | "value"
    | "string"
    | "number"
    | "boolean"
    | "pattern"
    | "select";
  label: string;
  options?: { value: string; label: string }[]; // For select type
  defaultValue?: string | number | boolean;
  required?: boolean;
}

// Component Event Types
export type ComponentEvent = "onClick" | "onToggle" | "onChange" | "onSlide";

// Action Binding (connects UI event to Frida action)
export interface ActionBinding {
  id: string;
  event: ComponentEvent;
  actionId: string;
  params: Record<string, string | number | boolean>;
}

// UI Component (simplified - no more action bindings, just declaration)
// Actions are now handled by visual scripts with Event Listener nodes
export interface UIComponent {
  id: string;
  type: ComponentType;
  label: string;
  x: number; // Relative to parent if parentId exists, otherwise absolute to canvas
  y: number; // Relative to parent if parentId exists, otherwise absolute to canvas
  width: number;
  height: number;
  props: Record<string, unknown>;
  // Parent-child relationship for layout components
  parentId?: string;
  children?: string[]; // Child component IDs (ordered for z-index within parent)
  // Layer management
  zIndex: number; // Explicit z-index for rendering order
  visible?: boolean; // Visibility toggle (default true)
  locked?: boolean; // Lock toggle for editing (default false)
  collapsed?: boolean; // Collapsed state in layers panel
  // Sizing modes for responsive layout
  widthMode?: SizingMode; // default: "fixed"
  heightMode?: SizingMode; // default: "fixed"
  // Note: bindings removed - use visual scripts with event_ui nodes instead
}

// Designer State
function createDesignerStore() {
  const [components, setComponents] = createSignal<UIComponent[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  // Multi-selection support
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

  // Track the component type being dragged from palette (workaround for WebView dataTransfer issues)
  const [draggingComponentType, setDraggingComponentType] =
    createSignal<ComponentType | null>(null);

  // Layers panel expanded nodes
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(
    new Set(),
  );

  // Component runtime values (for UI-Script binding)
  const [componentValues, setComponentValues] = createSignal<
    Map<string, unknown>
  >(new Map());

  // Counter for generating unique z-index
  let nextZIndex = 1;

  // Flag to prevent sync loop when loading from project
  let isLoadingFromProject = false;

  // Get selected component (primary selection)
  function getSelectedComponent(): UIComponent | null {
    const id = selectedId();
    if (!id) return null;
    return components().find((c) => c.id === id) ?? null;
  }

  // Get all selected components (for multi-selection)
  function getSelectedComponents(): UIComponent[] {
    const ids = selectedIds();
    return components().filter((c) => ids.has(c.id));
  }

  // Check if component is selected
  function isSelected(id: string): boolean {
    return selectedIds().has(id);
  }

  // Select single component (clears multi-selection)
  function selectComponent(id: string | null, addToSelection = false) {
    if (!id) {
      setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }

    if (addToSelection) {
      // Toggle selection when adding
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
          // Update primary selection
          if (selectedId() === id) {
            const remaining = Array.from(newSet);
            setSelectedId(remaining.length > 0 ? remaining[0] : null);
          }
        } else {
          newSet.add(id);
          setSelectedId(id); // Update primary selection
        }
        return newSet;
      });
    } else {
      // Replace selection
      setSelectedId(id);
      setSelectedIds(new Set([id]));
    }
  }

  // Select multiple components (for box selection)
  function selectMultiple(ids: string[], addToSelection = false) {
    if (ids.length === 0 && !addToSelection) {
      setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }

    if (addToSelection) {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        for (const id of ids) {
          newSet.add(id);
        }
        return newSet;
      });
      if (ids.length > 0 && !selectedId()) {
        setSelectedId(ids[0]);
      }
    } else {
      setSelectedIds(new Set(ids));
      setSelectedId(ids.length > 0 ? ids[0] : null);
    }
  }

  // Move multiple selected components
  function moveSelectedComponents(dx: number, dy: number) {
    const ids = selectedIds();
    if (ids.size === 0) return;

    setComponents((prev) =>
      prev.map((c) =>
        ids.has(c.id)
          ? { ...c, x: Math.max(0, c.x + dx), y: Math.max(0, c.y + dy) }
          : c,
      ),
    );
  }

  // Delete all selected components
  function deleteSelectedComponents() {
    const ids = Array.from(selectedIds());
    if (ids.length === 0) return;

    // Delete in reverse order to handle children properly
    for (const id of ids) {
      deleteComponent(id);
    }
    setSelectedIds(new Set());
    setSelectedId(null);
  }

  // Add component
  function addComponent(
    type: ComponentType,
    x: number,
    y: number,
    parentId?: string,
  ): UIComponent {
    const defaultProps = getDefaultProps(type);
    const component: UIComponent = {
      id: crypto.randomUUID(),
      type,
      label: getDefaultLabel(type),
      x,
      y,
      width: defaultProps.width,
      height: defaultProps.height,
      props: defaultProps.props,
      parentId,
      children: [],
      zIndex: nextZIndex++,
      visible: true,
      locked: false,
      collapsed: false,
    };

    setComponents((prev) => [...prev, component]);

    // If parent exists, add to parent's children
    if (parentId) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? { ...c, children: [...(c.children || []), component.id] }
            : c,
        ),
      );
    }

    // Initialize default value for value-holding components
    initializeComponentValue(component);

    setSelectedId(component.id);

    // Schedule sync after all state updates
    scheduleSyncToProject();

    return component;
  }

  // Initialize component value based on type
  function initializeComponentValue(component: UIComponent) {
    let defaultValue: unknown = null;
    switch (component.type) {
      case "toggle":
        defaultValue = component.props.defaultValue ?? false;
        break;
      case "slider":
        defaultValue = component.props.defaultValue ?? 50;
        break;
      case "input":
        defaultValue = "";
        break;
      case "dropdown":
        const options = component.props.options as string[] | undefined;
        defaultValue = options?.[0] ?? "";
        break;
    }
    if (defaultValue !== null) {
      setComponentValues((prev) => {
        const newMap = new Map(prev);
        newMap.set(component.id, defaultValue);
        return newMap;
      });
    }
  }

  // Update component
  function updateComponent(id: string, updates: Partial<UIComponent>) {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
    // Schedule sync after state updates
    scheduleSyncToProject();
  }

  // Delete component (also removes from parent and deletes children recursively)
  function deleteComponent(id: string) {
    const component = components().find((c) => c.id === id);
    if (!component) return;

    // Recursively delete children first
    const children = component.children || [];
    for (const childId of children) {
      deleteComponent(childId);
    }

    // Remove from parent's children array
    if (component.parentId) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === component.parentId
            ? { ...c, children: (c.children || []).filter((cid) => cid !== id) }
            : c,
        ),
      );
    }

    // Remove the component itself
    setComponents((prev) => prev.filter((c) => c.id !== id));

    // Remove component value
    setComponentValues((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });

    if (selectedId() === id) {
      setSelectedId(null);
    }

    // Schedule sync after deletion
    scheduleSyncToProject();
  }

  // Move component (does NOT sync during drag - call syncToProject after drag ends)
  function moveComponent(id: string, x: number, y: number) {
    // Direct state update without scheduling sync (for performance during drag)
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x: Math.max(0, x), y: Math.max(0, y) } : c)),
    );
  }

  // Resize component (does NOT sync during resize - call syncToProject after resize ends)
  function resizeComponent(id: string, width: number, height: number) {
    // Direct state update without scheduling sync (for performance during resize)
    setComponents((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, width: Math.max(50, width), height: Math.max(24, height) }
          : c,
      ),
    );
  }

  // Note: Binding functions removed - actions are now handled by visual scripts

  // Clear all
  function clearAll() {
    setComponents([]);
    setSelectedId(null);
    setComponentValues(new Map());
    nextZIndex = 1;
  }

  // ===== Layer/Hierarchy Management =====

  // Get root components (no parent) - sorted by z-index descending for layer panel (top = front)
  function getRootComponents(): UIComponent[] {
    return components()
      .filter((c) => !c.parentId)
      .sort((a, b) => b.zIndex - a.zIndex);
  }

  // Get direct children of a component - sorted by z-index descending for layer panel
  function getChildren(parentId: string): UIComponent[] {
    const parent = components().find((c) => c.id === parentId);
    if (!parent || !parent.children) return [];
    return parent.children
      .map((id) => components().find((c) => c.id === id))
      .filter((c): c is UIComponent => c !== undefined)
      .sort((a, b) => b.zIndex - a.zIndex);
  }

  // Get children sorted for rendering (ascending z-index, lower = behind)
  function getChildrenForRender(parentId: string): UIComponent[] {
    const parent = components().find((c) => c.id === parentId);
    if (!parent || !parent.children) return [];
    return parent.children
      .map((id) => components().find((c) => c.id === id))
      .filter((c): c is UIComponent => c !== undefined)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  // Get root components sorted for rendering (ascending z-index)
  function getRootComponentsForRender(): UIComponent[] {
    return components()
      .filter((c) => !c.parentId)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  // Get all ancestors (parent chain) from immediate parent to root
  function getAncestors(componentId: string): UIComponent[] {
    const ancestors: UIComponent[] = [];
    let current = components().find((c) => c.id === componentId);
    while (current?.parentId) {
      const parent = components().find((c) => c.id === current!.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    return ancestors;
  }

  // Get all descendants (recursive children)
  function getDescendants(componentId: string): UIComponent[] {
    const descendants: UIComponent[] = [];
    const children = getChildren(componentId);
    for (const child of children) {
      descendants.push(child);
      descendants.push(...getDescendants(child.id));
    }
    return descendants;
  }

  // Check if component is descendant of another
  function isDescendantOf(componentId: string, ancestorId: string): boolean {
    const ancestors = getAncestors(componentId);
    return ancestors.some((a) => a.id === ancestorId);
  }

  // Get siblings (same parent)
  function getSiblings(componentId: string): UIComponent[] {
    const component = components().find((c) => c.id === componentId);
    if (!component) return [];
    if (component.parentId) {
      return getChildren(component.parentId).filter((c) => c.id !== componentId);
    } else {
      return getRootComponents().filter((c) => c.id !== componentId);
    }
  }

  // Reparent component
  function reparentComponent(
    componentId: string,
    newParentId: string | null,
  ): void {
    const component = components().find((c) => c.id === componentId);
    if (!component) return;

    // Prevent making a component its own ancestor
    if (newParentId && isDescendantOf(newParentId, componentId)) return;
    // Prevent setting parent to self
    if (newParentId === componentId) return;

    const oldParentId = component.parentId;

    // Remove from old parent's children
    if (oldParentId) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === oldParentId
            ? {
                ...c,
                children: (c.children || []).filter((id) => id !== componentId),
              }
            : c,
        ),
      );
    }

    // Add to new parent's children
    if (newParentId) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === newParentId
            ? { ...c, children: [...(c.children || []), componentId] }
            : c,
        ),
      );
    }

    // Update component's parentId (this will also schedule sync)
    updateComponent(componentId, { parentId: newParentId || undefined });
  }

  // Reorder within siblings (move before/after target)
  function reorderSibling(
    componentId: string,
    targetId: string,
    position: "before" | "after",
  ): void {
    const component = components().find((c) => c.id === componentId);
    const target = components().find((c) => c.id === targetId);
    if (!component || !target) return;
    if (component.parentId !== target.parentId) return; // Must be siblings

    // Get all siblings sorted by zIndex
    const siblings = component.parentId
      ? getChildren(component.parentId)
      : getRootComponents();

    // Calculate new zIndex
    const targetIndex = siblings.findIndex((s) => s.id === targetId);
    if (targetIndex === -1) return;

    let newZIndex: number;
    if (position === "before") {
      const prevSibling = siblings[targetIndex - 1];
      newZIndex = prevSibling
        ? (prevSibling.zIndex + target.zIndex) / 2
        : target.zIndex - 1;
    } else {
      const nextSibling = siblings[targetIndex + 1];
      newZIndex = nextSibling
        ? (target.zIndex + nextSibling.zIndex) / 2
        : target.zIndex + 1;
    }

    updateComponent(componentId, { zIndex: newZIndex });
  }

  // Bring to front (highest z-index among siblings)
  function bringToFront(id: string): void {
    const component = components().find((c) => c.id === id);
    if (!component) return;

    const siblings = component.parentId
      ? getChildren(component.parentId)
      : getRootComponents();

    const maxZIndex = Math.max(...siblings.map((s) => s.zIndex));
    if (component.zIndex < maxZIndex) {
      updateComponent(id, { zIndex: maxZIndex + 1 });
    }
  }

  // Send to back (lowest z-index among siblings)
  function sendToBack(id: string): void {
    const component = components().find((c) => c.id === id);
    if (!component) return;

    const siblings = component.parentId
      ? getChildren(component.parentId)
      : getRootComponents();

    const minZIndex = Math.min(...siblings.map((s) => s.zIndex));
    if (component.zIndex > minZIndex) {
      updateComponent(id, { zIndex: minZIndex - 1 });
    }
  }

  // Bring forward (swap with next sibling)
  function bringForward(id: string): void {
    const component = components().find((c) => c.id === id);
    if (!component) return;

    const siblings = component.parentId
      ? getChildren(component.parentId)
      : getRootComponents();

    const currentIndex = siblings.findIndex((s) => s.id === id);
    if (currentIndex < siblings.length - 1) {
      const nextSibling = siblings[currentIndex + 1];
      // Swap z-indexes
      const tempZIndex = component.zIndex;
      updateComponent(id, { zIndex: nextSibling.zIndex });
      updateComponent(nextSibling.id, { zIndex: tempZIndex });
    }
  }

  // Send backward (swap with previous sibling)
  function sendBackward(id: string): void {
    const component = components().find((c) => c.id === id);
    if (!component) return;

    const siblings = component.parentId
      ? getChildren(component.parentId)
      : getRootComponents();

    const currentIndex = siblings.findIndex((s) => s.id === id);
    if (currentIndex > 0) {
      const prevSibling = siblings[currentIndex - 1];
      // Swap z-indexes
      const tempZIndex = component.zIndex;
      updateComponent(id, { zIndex: prevSibling.zIndex });
      updateComponent(prevSibling.id, { zIndex: tempZIndex });
    }
  }

  // Toggle visibility
  function toggleVisibility(id: string): void {
    const component = components().find((c) => c.id === id);
    if (component) {
      updateComponent(id, { visible: !(component.visible ?? true) });
    }
  }

  // Toggle lock
  function toggleLock(id: string): void {
    const component = components().find((c) => c.id === id);
    if (component) {
      updateComponent(id, { locked: !component.locked });
    }
  }

  // Toggle collapsed state in layers panel
  function toggleCollapsed(id: string): void {
    const component = components().find((c) => c.id === id);
    if (component) {
      updateComponent(id, { collapsed: !component.collapsed });
    }
  }

  // Expand/collapse node in layers panel (UI state only)
  function toggleExpanded(id: string): void {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function isExpanded(id: string): boolean {
    return expandedNodes().has(id);
  }

  // ===== Component Values (UI-Script Binding) =====

  function getComponentValue(componentId: string): unknown | undefined {
    return componentValues().get(componentId);
  }

  function setComponentValue(componentId: string, value: unknown): void {
    setComponentValues((prev) => {
      const newMap = new Map(prev);
      newMap.set(componentId, value);
      return newMap;
    });
  }

  // Load from project
  function loadFromProject() {
    isLoadingFromProject = true;
    try {
      const project = projectStore.currentProject();
      if (project?.ui?.components) {
        // Find max zIndex to continue from
        let maxZ = 0;
        // Convert project components to designer format
        const converted = project.ui.components.map((c, index) => {
          const zIndex = (c as UIComponent).zIndex ?? index + 1;
          if (zIndex > maxZ) maxZ = zIndex;
          return {
            id: c.id,
            type: c.type as ComponentType,
            label: c.label,
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
            props: c.props || {},
            parentId: (c as UIComponent).parentId,
            children: (c as UIComponent).children || [],
            zIndex,
            visible: (c as UIComponent).visible ?? true,
            locked: (c as UIComponent).locked ?? false,
            collapsed: (c as UIComponent).collapsed ?? false,
            widthMode: (c as UIComponent).widthMode,
            heightMode: (c as UIComponent).heightMode,
          };
        });
        nextZIndex = maxZ + 1;
        setComponents(converted);

        // Initialize component values
        setComponentValues(new Map());
        for (const comp of converted) {
          initializeComponentValue(comp);
        }
      } else {
        setComponents([]);
        setComponentValues(new Map());
        nextZIndex = 1;
      }
      setSelectedId(null);
    } finally {
      // Reset flag after a microtask to allow effects to run
      queueMicrotask(() => {
        isLoadingFromProject = false;
      });
    }
  }

  // Sync state management
  let syncScheduled = false;
  let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Schedule sync to project (debounced with setTimeout for safety)
  function scheduleSyncToProject() {
    // Don't sync if we're loading from project (prevents loop)
    if (isLoadingFromProject) return;
    if (syncScheduled) return;

    syncScheduled = true;
    // Use setTimeout instead of requestAnimationFrame for more reliable timing
    syncTimeoutId = setTimeout(() => {
      syncScheduled = false;
      syncTimeoutId = null;
      performSyncToProject();
    }, 50);
  }

  // Actually perform the sync (internal)
  function performSyncToProject() {
    if (isLoadingFromProject) return;

    const project = projectStore.currentProject();
    if (!project) return;

    // Include all component data including hierarchy
    const uiComponents = components().map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      props: c.props,
      bindings: [], // Required by Rust backend, but we use visual scripts now
      parentId: c.parentId,
      children: c.children,
      zIndex: c.zIndex,
      visible: c.visible,
      locked: c.locked,
      collapsed: c.collapsed,
      widthMode: c.widthMode,
      heightMode: c.heightMode,
    }));

    // Use silent update to prevent re-renders in other components
    // This only updates the internal state without creating a new project object
    projectStore.updateUI(
      {
        ...project.ui,
        components: uiComponents,
      },
      true, // silentComponentUpdate
    );
  }

  // Explicit sync function for external use (e.g., after drag/resize ends)
  function syncToProject() {
    // Cancel any pending scheduled sync
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
      syncScheduled = false;
    }
    // Perform sync immediately but in next microtask to avoid blocking
    queueMicrotask(() => {
      performSyncToProject();
    });
  }

  // Sync to project is now called explicitly after operations that need it
  // to avoid re-render loops. The automatic sync was causing issues because:
  // 1. addComponent() changes components()
  // 2. createEffect detects change, calls syncToProject()
  // 3. syncToProject() calls projectStore.updateUI()
  // 4. updateUI() calls setCurrentProject() with a new object
  // 5. Components tracking currentProject() re-render
  // 6. This can break event handlers and cause click events to stop working
  //
  // Instead, we defer sync to next animation frame to batch updates

  return {
    // State signals
    components,
    selectedId,
    selectedIds,
    isDragging,
    dragOffset,
    draggingComponentType,
    expandedNodes,
    componentValues,

    // State setters
    setSelectedId,
    setSelectedIds,
    setIsDragging,
    setDragOffset,
    setDraggingComponentType,

    // Component CRUD
    getSelectedComponent,
    getSelectedComponents,
    isSelected,
    selectComponent,
    selectMultiple,
    moveSelectedComponents,
    deleteSelectedComponents,
    addComponent,
    updateComponent,
    deleteComponent,
    moveComponent,
    resizeComponent,
    clearAll,
    loadFromProject,
    syncToProject,

    // Hierarchy management
    getRootComponents,
    getRootComponentsForRender,
    getChildren,
    getChildrenForRender,
    getAncestors,
    getDescendants,
    isDescendantOf,
    getSiblings,
    reparentComponent,
    reorderSibling,

    // Z-index management
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,

    // Layer properties
    toggleVisibility,
    toggleLock,
    toggleCollapsed,
    toggleExpanded,
    isExpanded,

    // Component values (UI-Script binding)
    getComponentValue,
    setComponentValue,
  };
}

// Helper functions
function getDefaultLabel(type: ComponentType): string {
  const labels: Record<ComponentType, string> = {
    button: "Button",
    toggle: "Toggle",
    slider: "Slider",
    label: "Label",
    input: "Input",
    dropdown: "Dropdown",
    group: "Group",
    spacer: "",
    stack: "Stack",
    page: "Pages",
    scroll: "Scroll",
    divider: "",
    card: "Card",
  };
  return labels[type];
}

function getDefaultProps(type: ComponentType): {
  width: number;
  height: number;
  props: Record<string, unknown>;
} {
  switch (type) {
    case "button":
      return { width: 120, height: 36, props: { variant: "primary" } };
    case "toggle":
      return { width: 160, height: 32, props: { defaultValue: false } };
    case "slider":
      return {
        width: 200,
        height: 40,
        props: { min: 0, max: 100, step: 1, defaultValue: 50 },
      };
    case "label":
      return { width: 100, height: 24, props: { fontSize: 14 } };
    case "input":
      return {
        width: 180,
        height: 36,
        props: { placeholder: "Enter value..." },
      };
    case "dropdown":
      return {
        width: 160,
        height: 36,
        props: { options: ["Option 1", "Option 2", "Option 3"] },
      };
    case "group":
      return {
        width: 300,
        height: 200,
        props: { title: "Group", collapsed: false },
      };
    case "spacer":
      return { width: 100, height: 20, props: {} };
    // Layout Components
    case "stack":
      return {
        width: 300,
        height: 200,
        props: {
          direction: "vertical" as LayoutDirection,
          gap: 8,
          padding: 12,
          align: "stretch" as Alignment,
          justify: "start" as Alignment,
        },
      };
    case "page":
      return {
        width: 350,
        height: 300,
        props: {
          tabs: [
            { id: crypto.randomUUID(), label: "Tab 1" },
            { id: crypto.randomUUID(), label: "Tab 2" },
          ] as PageTab[],
          activeTabIndex: 0,
          padding: 8,
          gap: 8,
        },
      };
    case "scroll":
      return {
        width: 300,
        height: 250,
        props: {
          direction: "vertical" as LayoutDirection,
          showScrollbar: true,
          padding: 8,
          gap: 8,
        },
      };
    case "divider":
      return {
        width: 200,
        height: 2,
        props: {
          direction: "horizontal" as LayoutDirection,
          thickness: 1,
          color: "border",
        },
      };
    case "card":
      return {
        width: 280,
        height: 180,
        props: {
          title: "Card Title",
          showHeader: true,
          padding: 16,
          elevation: 1,
        },
      };
    default:
      return { width: 100, height: 36, props: {} };
  }
}

// Frida Actions Registry
export const fridaActions: FridaAction[] = [
  // Memory Actions
  {
    id: "memory.read",
    category: "memory",
    name: "Read Memory",
    description: "Read value from memory address",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
      {
        name: "type",
        type: "select",
        label: "Type",
        options: [
          { value: "int8", label: "Int8" },
          { value: "uint8", label: "UInt8" },
          { value: "int16", label: "Int16" },
          { value: "uint16", label: "UInt16" },
          { value: "int32", label: "Int32" },
          { value: "uint32", label: "UInt32" },
          { value: "int64", label: "Int64" },
          { value: "uint64", label: "UInt64" },
          { value: "float", label: "Float" },
          { value: "double", label: "Double" },
          { value: "pointer", label: "Pointer" },
          { value: "string", label: "String" },
        ],
        defaultValue: "int32",
      },
    ],
  },
  {
    id: "memory.write",
    category: "memory",
    name: "Write Memory",
    description: "Write value to memory address",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
      { name: "value", type: "value", label: "Value", required: true },
      {
        name: "type",
        type: "select",
        label: "Type",
        options: [
          { value: "int8", label: "Int8" },
          { value: "uint8", label: "UInt8" },
          { value: "int16", label: "Int16" },
          { value: "uint16", label: "UInt16" },
          { value: "int32", label: "Int32" },
          { value: "uint32", label: "UInt32" },
          { value: "int64", label: "Int64" },
          { value: "uint64", label: "UInt64" },
          { value: "float", label: "Float" },
          { value: "double", label: "Double" },
        ],
        defaultValue: "int32",
      },
    ],
  },
  {
    id: "memory.freeze",
    category: "memory",
    name: "Freeze Memory",
    description: "Continuously write value to keep it frozen",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
      { name: "value", type: "value", label: "Value", required: true },
      {
        name: "type",
        type: "select",
        label: "Type",
        options: [
          { value: "int32", label: "Int32" },
          { value: "float", label: "Float" },
          { value: "double", label: "Double" },
        ],
        defaultValue: "int32",
      },
      {
        name: "interval",
        type: "number",
        label: "Interval (ms)",
        defaultValue: 100,
      },
    ],
  },
  {
    id: "memory.unfreeze",
    category: "memory",
    name: "Unfreeze Memory",
    description: "Stop freezing a memory address",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
    ],
  },

  // Scanner Actions
  {
    id: "scanner.pattern",
    category: "scanner",
    name: "Pattern Scan",
    description: "Scan memory for byte pattern",
    params: [
      { name: "pattern", type: "pattern", label: "Pattern", required: true },
      {
        name: "protection",
        type: "select",
        label: "Protection",
        options: [
          { value: "r--", label: "Read Only" },
          { value: "rw-", label: "Read/Write" },
          { value: "r-x", label: "Read/Execute" },
          { value: "rwx", label: "Read/Write/Execute" },
        ],
        defaultValue: "rw-",
      },
    ],
  },
  {
    id: "scanner.value",
    category: "scanner",
    name: "Value Scan",
    description: "Scan memory for specific value",
    params: [
      { name: "value", type: "value", label: "Value", required: true },
      {
        name: "type",
        type: "select",
        label: "Type",
        options: [
          { value: "int32", label: "Int32" },
          { value: "float", label: "Float" },
          { value: "double", label: "Double" },
          { value: "string", label: "String" },
        ],
        defaultValue: "int32",
      },
    ],
  },

  // Hook Actions
  {
    id: "hook.function",
    category: "hook",
    name: "Hook Function",
    description: "Intercept function calls",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
      {
        name: "onEnter",
        type: "boolean",
        label: "Log on Enter",
        defaultValue: true,
      },
      {
        name: "onLeave",
        type: "boolean",
        label: "Log on Leave",
        defaultValue: true,
      },
    ],
  },
  {
    id: "hook.replace",
    category: "hook",
    name: "Replace Return",
    description: "Replace function return value",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
      {
        name: "returnValue",
        type: "value",
        label: "Return Value",
        required: true,
      },
    ],
  },
  {
    id: "hook.nop",
    category: "hook",
    name: "NOP Function",
    description: "Replace function with NOP (do nothing)",
    params: [
      { name: "address", type: "address", label: "Address", required: true },
    ],
  },

  // Java Actions (Android)
  {
    id: "java.hook_method",
    category: "java",
    name: "Hook Java Method",
    description: "Hook a Java method on Android",
    params: [
      {
        name: "className",
        type: "string",
        label: "Class Name",
        required: true,
      },
      {
        name: "methodName",
        type: "string",
        label: "Method Name",
        required: true,
      },
      {
        name: "overload",
        type: "string",
        label: "Overload Signature",
        required: false,
      },
    ],
  },
  {
    id: "java.modify_return",
    category: "java",
    name: "Modify Java Return",
    description: "Modify Java method return value",
    params: [
      {
        name: "className",
        type: "string",
        label: "Class Name",
        required: true,
      },
      {
        name: "methodName",
        type: "string",
        label: "Method Name",
        required: true,
      },
      {
        name: "returnValue",
        type: "value",
        label: "Return Value",
        required: true,
      },
    ],
  },
  {
    id: "java.call_method",
    category: "java",
    name: "Call Java Method",
    description: "Invoke a Java method",
    params: [
      {
        name: "className",
        type: "string",
        label: "Class Name",
        required: true,
      },
      {
        name: "methodName",
        type: "string",
        label: "Method Name",
        required: true,
      },
      {
        name: "isStatic",
        type: "boolean",
        label: "Is Static",
        defaultValue: false,
      },
    ],
  },

  // ObjC Actions (iOS/macOS)
  {
    id: "objc.hook_method",
    category: "objc",
    name: "Hook ObjC Method",
    description: "Hook an Objective-C method",
    params: [
      {
        name: "className",
        type: "string",
        label: "Class Name",
        required: true,
      },
      { name: "selector", type: "string", label: "Selector", required: true },
      {
        name: "isClassMethod",
        type: "boolean",
        label: "Class Method",
        defaultValue: false,
      },
    ],
  },
  {
    id: "objc.modify_return",
    category: "objc",
    name: "Modify ObjC Return",
    description: "Modify Objective-C method return value",
    params: [
      {
        name: "className",
        type: "string",
        label: "Class Name",
        required: true,
      },
      { name: "selector", type: "string", label: "Selector", required: true },
      {
        name: "returnValue",
        type: "value",
        label: "Return Value",
        required: true,
      },
    ],
  },

  // Swift Actions
  {
    id: "swift.hook_function",
    category: "swift",
    name: "Hook Swift Function",
    description: "Hook a Swift function by mangled name",
    params: [
      {
        name: "mangledName",
        type: "string",
        label: "Mangled Name",
        required: true,
      },
    ],
  },

  // Process Actions
  {
    id: "process.list_modules",
    category: "process",
    name: "List Modules",
    description: "List all loaded modules",
    params: [],
  },
  {
    id: "process.find_export",
    category: "process",
    name: "Find Export",
    description: "Find exported function address",
    params: [
      {
        name: "moduleName",
        type: "string",
        label: "Module Name",
        required: true,
      },
      {
        name: "exportName",
        type: "string",
        label: "Export Name",
        required: true,
      },
    ],
  },
];

// Export actions grouped by category
export function getActionsByCategory(
  category: FridaActionCategory,
): FridaAction[] {
  return fridaActions.filter((a) => a.category === category);
}

export function getActionById(id: string): FridaAction | undefined {
  return fridaActions.find((a) => a.id === id);
}

export const designerStore = createRoot(createDesignerStore);
