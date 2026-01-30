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
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  // Parent-child relationship for layout components
  parentId?: string;
  children?: string[]; // Child component IDs
  // Note: bindings removed - use visual scripts with event_ui nodes instead
}

// Designer State
function createDesignerStore() {
  const [components, setComponents] = createSignal<UIComponent[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

  // Track the component type being dragged from palette (workaround for WebView dataTransfer issues)
  const [draggingComponentType, setDraggingComponentType] =
    createSignal<ComponentType | null>(null);

  // Flag to prevent sync loop when loading from project
  let isLoadingFromProject = false;

  // Get selected component
  function getSelectedComponent(): UIComponent | null {
    const id = selectedId();
    if (!id) return null;
    return components().find((c) => c.id === id) ?? null;
  }

  // Add component
  function addComponent(
    type: ComponentType,
    x: number,
    y: number,
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
    };

    setComponents((prev) => [...prev, component]);
    setSelectedId(component.id);
    return component;
  }

  // Update component
  function updateComponent(id: string, updates: Partial<UIComponent>) {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  }

  // Delete component
  function deleteComponent(id: string) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
    if (selectedId() === id) {
      setSelectedId(null);
    }
  }

  // Move component
  function moveComponent(id: string, x: number, y: number) {
    updateComponent(id, { x: Math.max(0, x), y: Math.max(0, y) });
  }

  // Resize component
  function resizeComponent(id: string, width: number, height: number) {
    updateComponent(id, {
      width: Math.max(50, width),
      height: Math.max(24, height),
    });
  }

  // Note: Binding functions removed - actions are now handled by visual scripts

  // Clear all
  function clearAll() {
    setComponents([]);
    setSelectedId(null);
  }

  // Load from project
  function loadFromProject() {
    isLoadingFromProject = true;
    try {
      const project = projectStore.currentProject();
      if (project?.ui?.components) {
        // Convert project components to designer format (simplified - no bindings)
        const converted = project.ui.components.map((c) => ({
          id: c.id,
          type: c.type as ComponentType,
          label: c.label,
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          props: c.props || {},
        }));
        setComponents(converted);
      } else {
        setComponents([]);
      }
      setSelectedId(null);
    } finally {
      // Reset flag after a microtask to allow effects to run
      queueMicrotask(() => {
        isLoadingFromProject = false;
      });
    }
  }

  // Debounce timer for sync
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  // Sync to project (debounced internally)
  function syncToProject() {
    // Don't sync if we're loading from project (prevents loop)
    if (isLoadingFromProject) return;

    const project = projectStore.currentProject();
    if (!project) return;

    // Cancel previous timer
    if (syncTimer) clearTimeout(syncTimer);

    // Debounce the sync
    syncTimer = setTimeout(() => {
      // Simplified - no bindings, just UI component definitions
      const uiComponents = components().map((c) => ({
        id: c.id,
        type: c.type,
        label: c.label,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        props: c.props,
      }));

      projectStore.updateUI({
        ...project.ui,
        components: uiComponents,
      });
      syncTimer = null;
    }, 100);
  }

  // Sync components to project when they change
  createEffect(() => {
    // Track components signal to trigger effect on changes
    components();
    const project = projectStore.currentProject();
    if (project && !isLoadingFromProject) {
      syncToProject();
    }
  });

  return {
    components,
    selectedId,
    isDragging,
    dragOffset,
    draggingComponentType,
    setSelectedId,
    setIsDragging,
    setDragOffset,
    setDraggingComponentType,
    getSelectedComponent,
    addComponent,
    updateComponent,
    deleteComponent,
    moveComponent,
    resizeComponent,
    clearAll,
    loadFromProject,
    syncToProject,
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
