import { Component, For, Show, createSignal, createMemo } from "solid-js";
import {
  designerStore,
  type UIComponent,
  type ComponentType,
  type LayoutDirection,
  type PageTab,
  type SizingMode,
} from "@/stores/designer";
import { TrashIcon } from "@/components/common/Icons";

// Canvas size is managed separately to avoid re-renders from project sync
// This is populated by the UI Designer when loading a project
const [canvasWidth, setCanvasWidth] = createSignal(400);
const [canvasHeight, setCanvasHeight] = createSignal(500);

// Export setters for external use (e.g., when loading project or changing settings)
export { setCanvasWidth, setCanvasHeight };

export const DesignCanvas: Component = () => {
  let contentAreaRef: HTMLDivElement | undefined;

  // Use module-level canvas size signals to avoid re-renders from project sync
  const windowWidth = canvasWidth;
  const windowHeight = canvasHeight;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("DragEnter on canvas");
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    console.log("DragLeave from canvas");
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // First, try to get from global store (workaround for WebView dataTransfer issues)
    let type = designerStore.draggingComponentType();

    // If not in store, try dataTransfer
    if (!type) {
      type = e.dataTransfer?.getData("componentType") as ComponentType;
    }
    if (!type) {
      type = e.dataTransfer?.getData("text/plain") as ComponentType;
    }

    console.log("Drop - type:", type);

    if (!type || !contentAreaRef) {
      console.log(
        "Drop failed - type:",
        type,
        "contentAreaRef:",
        !!contentAreaRef,
      );
      return;
    }

    const rect = contentAreaRef.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 16);
    const y = Math.max(0, e.clientY - rect.top - 16);

    console.log("Adding component:", { type, x, y });
    designerStore.addComponent(type, x, y);

    // Clear the dragging type
    designerStore.setDraggingComponentType(null);
  };

  const handleCanvasMouseDown = (e: MouseEvent) => {
    // Deselect when clicking on empty canvas area (not on components)
    const target = e.target as HTMLElement;
    // Check if clicking on a canvas component or its children
    const isOnComponent = target.closest("[data-component-id]");
    if (!isOnComponent) {
      designerStore.setSelectedId(null);
    }
  };

  return (
    <div class="flex-1 flex flex-col">
      {/* Toolbar */}
      <div class="h-10 border-b border-border flex items-center justify-between px-4">
        <div class="text-sm text-foreground-muted">
          {designerStore.components().length} components
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-2 py-1 rounded hover:bg-surface-hover transition-colors text-foreground-muted"
            onClick={() => designerStore.clearAll()}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        class="flex-1 relative overflow-hidden bg-background canvas-drop-zone"
        style={{
          "background-image":
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          "background-size": "20px 20px",
        }}
        onMouseDown={handleCanvasMouseDown}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Scrollable container for overflow handling */}
        <div class="absolute inset-0 overflow-auto">
          {/* Centered content wrapper with padding */}
          <div class="min-w-full min-h-full flex items-start justify-center p-8">
            {/* Preview Frame */}
            <div
              class="bg-surface rounded-lg shadow-lg border border-border flex-shrink-0"
              style={{
                width: `${windowWidth()}px`,
                "min-height": `${windowHeight() + 32}px`,
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Title Bar */}
              <div class="h-8 border-b border-border flex items-center px-3 rounded-t-lg">
                <div class="flex gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-error/50" />
                  <div class="w-3 h-3 rounded-full bg-warning/50" />
                  <div class="w-3 h-3 rounded-full bg-success/50" />
                </div>
                <div class="flex-1 text-center text-xs text-foreground-muted">
                  {windowWidth()} x {windowHeight()}
                </div>
              </div>

              {/* Content Area - Drop Zone */}
              <div
                ref={contentAreaRef}
                class="relative p-4 canvas-content overflow-hidden"
                style={{
                  "min-height": `${windowHeight()}px`,
                }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Render root components sorted by z-index (ascending for render) */}
                <For each={designerStore.getRootComponentsForRender()}>
                  {(component) => (
                    <CanvasComponent
                      component={component}
                      parentOffset={{ x: 0, y: 0 }}
                    />
                  )}
                </For>

                <Show when={designerStore.components().length === 0}>
                  <div class="absolute inset-0 flex items-center justify-center text-foreground-muted text-sm pointer-events-none">
                    <div class="text-center">
                      <p>Drag components here</p>
                      <p class="text-xs mt-1">to build your trainer UI</p>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CanvasComponentProps {
  component: UIComponent;
  parentOffset: { x: number; y: number };
  /** If true, parent handles layout (stack/scroll/page) - don't use absolute positioning */
  inAutoLayout?: boolean;
  /** Active tab ID for page component children filtering */
  activeTabId?: string;
  /** Parent's flex direction for proper sizing */
  parentDirection?: LayoutDirection;
}

const CanvasComponent: Component<CanvasComponentProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  const [isDragging, setIsDragging] = createSignal(false);
  let componentRef: HTMLDivElement | undefined;

  const isSelected = () => designerStore.selectedId() === props.component.id;
  const isVisible = () => props.component.visible !== false;
  const isLocked = () => props.component.locked === true;
  const children = createMemo(() => designerStore.getChildrenForRender(props.component.id));
  const hasChildren = createMemo(() => children().length > 0);

  // Check if this component is a container type
  const isContainer = () =>
    ["group", "stack", "page", "scroll", "card"].includes(props.component.type);

  // Check if this is an auto-layout container (children are auto-positioned)
  const isAutoLayoutContainer = () =>
    ["stack", "scroll"].includes(props.component.type);

  // Check if this is a page/tab container
  const isPageContainer = () => props.component.type === "page";

  const handleMouseDown = (e: MouseEvent) => {
    // Ignore if clicking on delete button or resize handle
    const target = e.target as HTMLElement;
    if (target.closest("[data-action]")) {
      return;
    }

    // Don't allow dragging locked components
    if (isLocked()) {
      e.stopPropagation();
      designerStore.setSelectedId(props.component.id);
      return;
    }

    // Always stop propagation to prevent canvas from deselecting
    e.stopPropagation();
    e.preventDefault();

    // Select this component
    designerStore.setSelectedId(props.component.id);

    if (e.detail === 2) {
      // Double click to edit label
      setEditValue(props.component.label);
      setIsEditing(true);
      return;
    }

    // Start drag tracking
    setIsDragging(true);
    designerStore.setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startCompX = props.component.x;
    const startCompY = props.component.y;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      designerStore.moveComponent(
        props.component.id,
        startCompX + dx,
        startCompY + dy,
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      designerStore.setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // Sync to project after drag ends
      designerStore.syncToProject();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Handle click on component for selection (backup for mousedown)
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isEditing()) {
      designerStore.setSelectedId(props.component.id);
    }
  };

  const handleLabelSave = () => {
    designerStore.updateComponent(props.component.id, { label: editValue() });
    setIsEditing(false);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    designerStore.deleteComponent(props.component.id);
  };

  // Don't render if not visible
  if (!isVisible()) {
    return null;
  }

  // Sizing modes
  const widthMode = () => (props.component.widthMode as SizingMode) ?? "fixed";
  const heightMode = () => (props.component.heightMode as SizingMode) ?? "fixed";
  const parentDir = () => props.parentDirection ?? "vertical";

  // For auto-layout children, we use flex-based sizing instead of absolute
  const baseClass = () => {
    const classes = ["select-none", "transition-shadow", "relative"];
    if (isLocked()) classes.push("cursor-not-allowed");
    else classes.push("cursor-move");
    if (isSelected()) classes.push("ring-2 ring-accent ring-offset-2 ring-offset-surface");
    else classes.push("hover:ring-1 hover:ring-accent/50");
    if (isLocked()) classes.push("opacity-80");

    // Only use absolute positioning if not in auto-layout
    if (!props.inAutoLayout) {
      classes.push("absolute");
    } else {
      classes.push("flex-shrink-0");
      // In vertical stack: fill width means stretch horizontally
      // In horizontal stack: fill height means stretch vertically
      if (parentDir() === "vertical") {
        if (widthMode() === "fill") classes.push("self-stretch");
        if (heightMode() === "fill") classes.push("flex-grow");
      } else {
        if (heightMode() === "fill") classes.push("self-stretch");
        if (widthMode() === "fill") classes.push("flex-grow");
      }
    }
    return classes.join(" ");
  };

  // Calculate style based on sizing mode
  const getComponentStyle = () => {
    if (!props.inAutoLayout) {
      return {
        left: `${props.component.x}px`,
        top: `${props.component.y}px`,
        width: `${props.component.width}px`,
        height: `${props.component.height}px`,
        "z-index": isSelected() ? 1000 : props.component.zIndex,
      };
    }

    const style: Record<string, string | undefined> = {};

    // Width handling
    if (widthMode() === "fixed") {
      style.width = `${props.component.width}px`;
    } else if (widthMode() === "hug") {
      style["min-width"] = `${props.component.width}px`;
      style.width = "auto";
    }
    // fill: handled by self-stretch or flex-grow class

    // Height handling
    if (heightMode() === "fixed") {
      style.height = `${props.component.height}px`;
    } else if (heightMode() === "hug") {
      style["min-height"] = `${props.component.height}px`;
      style.height = "auto";
    }
    // fill: handled by self-stretch or flex-grow class

    return style;
  };

  return (
    <div
      ref={componentRef}
      data-component-id={props.component.id}
      class={baseClass()}
      style={getComponentStyle()}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Delete button */}
      <Show when={isSelected()}>
        <button
          data-action="delete"
          class="absolute -top-2 -right-2 w-5 h-5 bg-error rounded-full flex items-center justify-center text-white hover:bg-error/80 transition-colors z-20"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={handleDelete}
        >
          <TrashIcon class="w-3 h-3" />
        </button>
      </Show>

      {/* Component Preview */}
      <Show
        when={!isEditing()}
        fallback={
          <input
            type="text"
            class="w-full h-full px-2 bg-background border border-accent rounded text-sm focus:outline-none"
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => e.key === "Enter" && handleLabelSave()}
            autofocus
          />
        }
      >
        <ComponentPreview component={props.component} />
      </Show>

      {/* Render children inside container */}
      <Show when={isContainer() && hasChildren()}>
        {/* Auto-layout container (Stack, Scroll) */}
        <Show when={isAutoLayoutContainer()}>
          <AutoLayoutContainer component={props.component} parentOffset={props.parentOffset}>
            {children()}
          </AutoLayoutContainer>
        </Show>

        {/* Page/Tab container */}
        <Show when={isPageContainer()}>
          <PageContainer component={props.component} parentOffset={props.parentOffset}>
            {children()}
          </PageContainer>
        </Show>

        {/* Regular container (Group, Card) - absolute positioning */}
        <Show when={!isAutoLayoutContainer() && !isPageContainer()}>
          <div
            class="absolute pointer-events-auto"
            style={{
              left: `${getContainerPadding(props.component)}px`,
              top: `${getContainerPadding(props.component) + getContainerHeaderHeight(props.component)}px`,
              right: `${getContainerPadding(props.component)}px`,
              bottom: `${getContainerPadding(props.component)}px`,
            }}
          >
            <For each={children()}>
              {(child) => (
                <CanvasComponent
                  component={child}
                  parentOffset={{
                    x: props.parentOffset.x + props.component.x + getContainerPadding(props.component),
                    y: props.parentOffset.y + props.component.y + getContainerPadding(props.component) + getContainerHeaderHeight(props.component),
                  }}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Locked indicator */}
      <Show when={isLocked() && isSelected()}>
        <div class="absolute top-1 left-1 text-xs bg-warning/80 text-warning-foreground px-1 rounded">
          🔒
        </div>
      </Show>

      {/* Resize handle */}
      <Show when={isSelected()}>
        <div
          data-action="resize"
          class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center z-20"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = props.component.width;
            const startH = props.component.height;

            const handleMove = (e: MouseEvent) => {
              const dx = e.clientX - startX;
              const dy = e.clientY - startY;
              designerStore.resizeComponent(
                props.component.id,
                startW + dx,
                startH + dy,
              );
            };

            const handleUp = () => {
              window.removeEventListener("mousemove", handleMove);
              window.removeEventListener("mouseup", handleUp);
              // Sync to project after resize ends
              designerStore.syncToProject();
            };

            window.addEventListener("mousemove", handleMove);
            window.addEventListener("mouseup", handleUp);
          }}
        >
          <svg viewBox="0 0 12 12" class="w-3 h-3 text-accent">
            <path
              d="M10 2L2 10M10 6L6 10M10 10L10 10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </div>
      </Show>
    </div>
  );
};

// ============================================
// Auto-Layout Container (Stack, Scroll)
// ============================================
interface AutoLayoutContainerProps {
  component: UIComponent;
  parentOffset: { x: number; y: number };
  children: UIComponent[];
}

const AutoLayoutContainer: Component<AutoLayoutContainerProps> = (props) => {
  const direction = () => (props.component.props.direction as LayoutDirection) ?? "vertical";
  const gap = () => (props.component.props.gap as number) ?? 8;
  const padding = () => (props.component.props.padding as number) ?? 12;
  const headerHeight = () => getContainerHeaderHeight(props.component);
  const align = () => (props.component.props.align as string) ?? "stretch";
  const justify = () => (props.component.props.justify as string) ?? "start";

  // For scroll containers, enable overflow
  const isScroll = () => props.component.type === "scroll";
  const showScrollbar = () => (props.component.props.showScrollbar as boolean) ?? true;

  // Build Tailwind classes for alignment
  const getAlignClass = () => {
    switch (align()) {
      case "start": return "items-start";
      case "center": return "items-center";
      case "end": return "items-end";
      case "stretch": return "items-stretch";
      default: return "items-stretch";
    }
  };

  const getJustifyClass = () => {
    switch (justify()) {
      case "start": return "justify-start";
      case "center": return "justify-center";
      case "end": return "justify-end";
      case "space-between": return "justify-between";
      default: return "justify-start";
    }
  };

  const containerClass = () => {
    const classes = [
      "absolute", "inset-0", "pointer-events-auto", "flex",
      direction() === "vertical" ? "flex-col" : "flex-row",
      getAlignClass(),
      getJustifyClass(),
    ];
    if (isScroll()) {
      classes.push(showScrollbar() ? "overflow-auto" : "overflow-auto scrollbar-hide");
    } else {
      classes.push("overflow-hidden");
    }
    return classes.join(" ");
  };

  return (
    <div
      class={containerClass()}
      style={{
        "padding-top": `${padding() + headerHeight()}px`,
        "padding-right": `${padding()}px`,
        "padding-bottom": `${padding()}px`,
        "padding-left": `${padding()}px`,
        gap: `${gap()}px`,
      }}
    >
      <For each={props.children}>
        {(child) => (
          <CanvasComponent
            component={child}
            parentOffset={{
              x: props.parentOffset.x + props.component.x + padding(),
              y: props.parentOffset.y + props.component.y + padding() + headerHeight(),
            }}
            inAutoLayout={true}
            parentDirection={direction()}
          />
        )}
      </For>
    </div>
  );
};

// ============================================
// Page/Tab Container
// ============================================
interface PageContainerProps {
  component: UIComponent;
  parentOffset: { x: number; y: number };
  children: UIComponent[];
}

const PageContainer: Component<PageContainerProps> = (props) => {
  const tabs = () => (props.component.props.tabs as PageTab[]) ?? [];
  const activeTabIndex = () => (props.component.props.activeTabIndex as number) ?? 0;
  const activeTab = () => tabs()[activeTabIndex()];
  const padding = () => (props.component.props.padding as number) ?? 8;
  const gap = () => (props.component.props.gap as number) ?? 8;
  const headerHeight = () => 32; // Tab bar height

  // Filter children by tab assignment
  // Children have a "tabId" prop that links them to a specific tab
  const childrenForActiveTab = () => {
    const activeTabId = activeTab()?.id;
    if (!activeTabId) return props.children;
    return props.children.filter((child) => {
      const childTabId = child.props.tabId as string | undefined;
      // If child has no tabId, show on first tab by default
      return childTabId === activeTabId || (!childTabId && activeTabIndex() === 0);
    });
  };

  const handleTabClick = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    designerStore.updateComponent(props.component.id, {
      props: { ...props.component.props, activeTabIndex: index },
    });
  };

  return (
    <>
      {/* Tab bar (interactive) */}
      <div
        class="absolute left-0 right-0 top-0 h-8 flex items-center bg-background-secondary border-b border-border pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <For each={tabs()}>
          {(tab, i) => (
            <button
              class={`px-3 h-full text-xs transition-colors ${
                i() === activeTabIndex()
                  ? "bg-surface border-b-2 border-accent text-accent"
                  : "text-foreground-muted hover:text-foreground"
              }`}
              onClick={(e) => handleTabClick(i(), e)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      {/* Tab content area - auto-layout like stack */}
      <div
        class="absolute pointer-events-auto flex flex-col items-stretch overflow-auto"
        style={{
          left: `${padding()}px`,
          top: `${headerHeight()}px`,
          right: `${padding()}px`,
          bottom: `${padding()}px`,
          "padding-top": `${padding()}px`,
          "padding-bottom": `${padding()}px`,
          gap: `${gap()}px`,
        }}
      >
        <For each={childrenForActiveTab()}>
          {(child) => (
            <CanvasComponent
              component={child}
              parentOffset={{
                x: props.parentOffset.x + props.component.x + padding(),
                y: props.parentOffset.y + props.component.y + padding() + headerHeight(),
              }}
              inAutoLayout={true}
              activeTabId={activeTab()?.id}
              parentDirection="vertical"
            />
          )}
        </For>
        <Show when={childrenForActiveTab().length === 0}>
          <div class="flex-1 flex items-center justify-center text-xs text-foreground-muted">
            Drop components here
          </div>
        </Show>
      </div>
    </>
  );
};

// Helper functions for container layout
function getContainerPadding(component: UIComponent): number {
  switch (component.type) {
    case "stack":
      return (component.props.padding as number) ?? 12;
    case "scroll":
      return (component.props.padding as number) ?? 8;
    case "card":
      return (component.props.padding as number) ?? 16;
    case "group":
      return 8;
    case "page":
      return 8;
    default:
      return 0;
  }
}

function getContainerHeaderHeight(component: UIComponent): number {
  switch (component.type) {
    case "group":
      return 28; // Header height
    case "page":
      return 32; // Tab bar height
    case "card":
      return component.props.showHeader !== false ? 40 : 0;
    default:
      return 0;
  }
}

interface ComponentPreviewProps {
  component: UIComponent;
}

const ComponentPreview: Component<ComponentPreviewProps> = (props) => {
  const c = props.component;

  switch (c.type) {
    case "button":
      return (
        <div class="w-full h-full px-4 py-2 bg-accent text-white rounded text-sm font-medium flex items-center justify-center pointer-events-none">
          {c.label}
        </div>
      );

    case "toggle": {
      const isOn = (c.props.defaultValue as boolean) ?? false;
      return (
        <div class="w-full h-full flex items-center gap-3 pointer-events-none">
          <div
            class={`relative w-10 h-5 rounded-full transition-colors ${isOn ? "bg-accent" : "bg-background-secondary"}`}
          >
            <div
              class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
          <span class="text-sm">{c.label}</span>
        </div>
      );
    }

    case "slider": {
      const min = (c.props.min as number) ?? 0;
      const max = (c.props.max as number) ?? 100;
      const defaultVal = (c.props.defaultValue as number) ?? 50;
      const percent = Math.min(
        100,
        Math.max(0, ((defaultVal - min) / (max - min)) * 100),
      );
      return (
        <div class="w-full h-full flex flex-col justify-center gap-1 pointer-events-none">
          <div class="flex justify-between text-xs">
            <span>{c.label}</span>
            <span class="text-foreground-muted">{defaultVal}</span>
          </div>
          <div class="relative h-2 bg-background-secondary rounded-full">
            <div
              class="absolute top-0 left-0 h-full bg-accent rounded-full"
              style={{ width: `${percent}%` }}
            />
            <div
              class="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow border border-border"
              style={{ left: `calc(${percent}% - 8px)` }}
            />
          </div>
        </div>
      );
    }

    case "input": {
      const defaultInputVal = (c.props.defaultValue as string) ?? "";
      const placeholder = (c.props.placeholder as string) ?? "Enter value...";
      return (
        <div class="w-full h-full px-3 bg-background border border-border rounded text-sm flex items-center pointer-events-none">
          <span
            class={
              defaultInputVal ? "text-foreground" : "text-foreground-muted"
            }
          >
            {defaultInputVal || placeholder}
          </span>
        </div>
      );
    }

    case "dropdown":
      return (
        <div class="w-full h-full flex items-center justify-between px-3 bg-background border border-border rounded text-sm pointer-events-none">
          <span>{c.label}</span>
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      );

    case "label":
      return (
        <div class="w-full h-full flex items-center text-sm">{c.label}</div>
      );

    case "group":
      return (
        <div class="w-full h-full border border-border rounded-lg">
          <div class="h-7 border-b border-border px-3 flex items-center text-xs font-medium bg-surface rounded-t-lg">
            {c.label}
          </div>
        </div>
      );

    case "spacer":
      return (
        <div class="w-full h-full border border-dashed border-border rounded opacity-50" />
      );

    case "stack": {
      // Stack preview is just a background - actual layout is handled by AutoLayoutContainer
      return (
        <div class="w-full h-full border-2 border-dashed border-accent/30 rounded-lg bg-accent/5 pointer-events-none" />
      );
    }

    case "page": {
      // Page preview is just a background - actual tabs are rendered by PageContainer
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface overflow-hidden pointer-events-none" />
      );
    }

    case "scroll": {
      // Scroll preview is just a background - actual layout is handled by AutoLayoutContainer
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface pointer-events-none" />
      );
    }

    case "divider": {
      const direction = (c.props.direction as LayoutDirection) ?? "horizontal";
      const thickness = (c.props.thickness as number) ?? 1;
      return (
        <div class="w-full h-full flex items-center justify-center">
          <div
            class="bg-border"
            style={{
              width: direction === "horizontal" ? "100%" : `${thickness}px`,
              height: direction === "horizontal" ? `${thickness}px` : "100%",
            }}
          />
        </div>
      );
    }

    case "card": {
      const title = (c.props.title as string) ?? "Card";
      const showHeader = (c.props.showHeader as boolean) ?? true;
      const padding = (c.props.padding as number) ?? 16;
      const elevation = (c.props.elevation as number) ?? 1;
      return (
        <div
          class="w-full h-full rounded-lg bg-surface border border-border overflow-hidden flex flex-col"
          style={{
            "box-shadow": elevation > 0 ? `0 ${elevation * 2}px ${elevation * 8}px rgba(0,0,0,0.15)` : "none",
          }}
        >
          <Show when={showHeader}>
            <div class="h-10 border-b border-border px-4 flex items-center">
              <span class="text-sm font-medium">{title}</span>
            </div>
          </Show>
          <div
            class="flex-1 flex items-center justify-center text-xs text-foreground-muted"
            style={{ padding: `${padding}px` }}
          >
            Card content area
          </div>
        </div>
      );
    }

    default:
      return (
        <div class="w-full h-full bg-surface border border-border rounded" />
      );
  }
};

export default DesignCanvas;
