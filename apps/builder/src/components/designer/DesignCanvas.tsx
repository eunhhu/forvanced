import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js";
import {
  designerStore,
  type UIComponent,
  type ComponentType,
  type LayoutDirection,
  type PageTab,
  type SizingMode,
} from "@/stores/designer";
import { TrashIcon, IconLock, IconPlay } from "@/components/common/Icons";
import { UIPreview } from "./UIPreview";

// Canvas size is managed separately to avoid re-renders from project sync
// This is populated by the UI Designer when loading a project
const [canvasWidth, setCanvasWidth] = createSignal(400);
const [canvasHeight, setCanvasHeight] = createSignal(500);
const [canvasPadding, setCanvasPadding] = createSignal(12);
const [canvasGap, setCanvasGap] = createSignal(8);

// Export setters for external use (e.g., when loading project or changing settings)
export { setCanvasWidth, setCanvasHeight, setCanvasPadding, setCanvasGap };

// Selection box interface
interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const DesignCanvas: Component = () => {
  let contentAreaRef: HTMLDivElement | undefined;
  let canvasContainerRef: HTMLDivElement | undefined;

  // Use module-level canvas size signals to avoid re-renders from project sync
  const windowWidth = canvasWidth;
  const windowHeight = canvasHeight;

  // Zoom and pan state
  const [scale, setScale] = createSignal(1);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });

  // Selection box state (for drag selection)
  const [selectionBox, setSelectionBox] = createSignal<SelectionBox | null>(
    null,
  );
  const [isSelecting, setIsSelecting] = createSignal(false);

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = createSignal(false);

  // Check for Mac (for display purposes)
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

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

    // For stack layout, x/y don't matter for position (it's determined by order)
    // but we can use y to determine where in the stack to insert
    // For now, just append to end
    designerStore.addComponent(type, 0, 0);

    // Clear the dragging type
    designerStore.setDraggingComponentType(null);
  };

  // Handle wheel for pan (normal scroll) and zoom (Ctrl/Cmd + scroll)
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl/Cmd + scroll
      const delta = e.deltaY > 0 ? 0.95 : 1.05; // Smoother zoom
      const newScale = Math.min(Math.max(scale() * delta, 0.25), 3);

      // Zoom towards mouse position
      if (canvasContainerRef) {
        const rect = canvasContainerRef.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const oldScale = scale();
        const scaleRatio = newScale / oldScale;

        // Adjust offset to zoom towards mouse position
        setOffset((prev) => ({
          x: mouseX - (mouseX - prev.x) * scaleRatio,
          y: mouseY - (mouseY - prev.y) * scaleRatio,
        }));
      }

      setScale(newScale);
    } else {
      // Pan with normal scroll
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const handleCanvasMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Check if clicking on a canvas component or its children
    const isOnComponent = target.closest("[data-component-id]");

    if (!isOnComponent && canvasContainerRef) {
      // Start selection box on empty canvas area
      const rect = canvasContainerRef.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset().x) / scale();
      const y = (e.clientY - rect.top - offset().y) / scale();

      setIsSelecting(true);
      setSelectionBox({
        startX: x,
        startY: y,
        endX: x,
        endY: y,
      });

      // If not holding Shift, clear selection (Adobe style)
      const addToSelection = e.shiftKey;
      if (!addToSelection) {
        designerStore.selectComponent(null);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isSelecting() && canvasContainerRef) {
      const rect = canvasContainerRef.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset().x) / scale();
      const y = (e.clientY - rect.top - offset().y) / scale();

      setSelectionBox((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isSelecting() && selectionBox()) {
      const box = selectionBox()!;
      // Calculate actual box bounds
      const minX = Math.min(box.startX, box.endX);
      const maxX = Math.max(box.startX, box.endX);
      const minY = Math.min(box.startY, box.endY);
      const maxY = Math.max(box.startY, box.endY);

      // Only consider it a drag selection if box is bigger than a few pixels
      if (maxX - minX > 5 || maxY - minY > 5) {
        // Find all components that intersect with selection box
        const selectedIds = designerStore
          .components()
          .filter((c) => !c.parentId) // Only root components for now
          .filter((c) => {
            // Check if component overlaps with selection box
            const compRight = c.x + c.width;
            const compBottom = c.y + c.height;
            return (
              c.x < maxX && compRight > minX && c.y < maxY && compBottom > minY
            );
          })
          .map((c) => c.id);

        const addToSelection = e.shiftKey;
        designerStore.selectMultiple(selectedIds, addToSelection);
      }
    }

    setIsSelecting(false);
    setSelectionBox(null);
  };

  // Keyboard shortcuts are now handled centrally by hotkeys store in App.tsx
  // This ensures consistent behavior across tabs and proper macOS Backspace/Delete handling

  onMount(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  });

  // Reset view function
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div class="flex-1 flex flex-col">
      {/* Toolbar */}
      <div class="h-10 border-b border-border flex items-center justify-between px-4">
        <div class="text-sm text-foreground-muted flex items-center gap-4">
          <span>{designerStore.components().length} components</span>
          <Show when={designerStore.selectedIds().size > 1}>
            <span class="text-accent">
              {designerStore.selectedIds().size} selected
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-foreground-muted">
            Zoom: {Math.round(scale() * 100)}%
          </span>
          <button
            class="text-xs px-2 py-1 rounded hover:bg-surface-hover transition-colors text-foreground-muted"
            onClick={resetView}
          >
            Reset View
          </button>
          <button
            class="text-xs px-2 py-1 rounded hover:bg-surface-hover transition-colors text-foreground-muted"
            onClick={() => designerStore.clearAll()}
          >
            Clear All
          </button>
          <div class="w-px h-4 bg-border mx-1" />
          <button
            class="flex items-center gap-1.5 text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 transition-colors"
            onClick={() => setIsPreviewOpen(true)}
          >
            <IconPlay class="w-3 h-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasContainerRef}
        tabIndex={0}
        class="flex-1 relative overflow-hidden bg-background canvas-drop-zone focus:outline-none"
        style={{
          "background-image":
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          "background-size": `${20 * scale()}px ${20 * scale()}px`,
          "background-position": `${offset().x}px ${offset().y}px`,
        }}
        onMouseDown={(e) => {
          // Focus canvas on click so keyboard events work
          canvasContainerRef?.focus();
          handleCanvasMouseDown(e);
        }}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Transform container for zoom and pan */}
        <div
          style={{
            transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()})`,
            "transform-origin": "0 0",
          }}
        >
          {/* Centered content wrapper with padding */}
          <div class="flex items-start justify-center p-8">
            {/* Preview Frame - Fixed size, no overflow */}
            <div
              class="bg-surface rounded-lg shadow-lg border border-border flex-shrink-0 overflow-hidden"
              style={{
                width: `${windowWidth()}px`,
                height: `${windowHeight() + 32}px`,
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

              {/* Content Area - Drop Zone (Stack Layout for auto-arrangement) */}
              <div
                ref={contentAreaRef}
                class="canvas-content flex flex-col items-stretch overflow-auto bg-surface"
                style={{
                  width: `${windowWidth()}px`,
                  height: `${windowHeight()}px`,
                  "min-height": `${windowHeight()}px`,
                  padding: `${canvasPadding()}px`,
                  gap: `${canvasGap()}px`,
                }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Render root components in stack layout */}
                <For each={designerStore.getRootComponentsForRender()}>
                  {(component) => (
                    <CanvasComponent
                      component={component}
                      parentOffset={{ x: 0, y: 0 }}
                      scale={scale()}
                      inAutoLayout={true}
                      parentDirection="vertical"
                      focusCanvas={() => canvasContainerRef?.focus()}
                    />
                  )}
                </For>

                <Show when={designerStore.components().length === 0}>
                  <div class="flex-1 flex items-center justify-center text-foreground-muted text-sm pointer-events-none">
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

        {/* Selection box overlay */}
        <Show when={isSelecting() && selectionBox()}>
          {(box) => {
            const minX = () => Math.min(box().startX, box().endX);
            const minY = () => Math.min(box().startY, box().endY);
            const width = () => Math.abs(box().endX - box().startX);
            const height = () => Math.abs(box().endY - box().startY);
            return (
              <div
                class="absolute pointer-events-none border-2 border-accent bg-accent/10"
                style={{
                  left: `${minX() * scale() + offset().x}px`,
                  top: `${minY() * scale() + offset().y}px`,
                  width: `${width() * scale()}px`,
                  height: `${height() * scale()}px`,
                }}
              />
            );
          }}
        </Show>

        {/* Help text */}
        <div class="absolute bottom-2 left-2 text-[10px] text-foreground-muted/50 pointer-events-none">
          <span>
            Scroll: Pan | {isMac ? "⌘" : "Ctrl"}+Scroll: Zoom | Drag: Box select
            | Shift+Click: Add to selection
          </span>
        </div>
      </div>

      {/* Preview Modal */}
      <UIPreview
        isOpen={isPreviewOpen()}
        onClose={() => setIsPreviewOpen(false)}
      />
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
  /** Current zoom scale for drag calculations */
  scale?: number;
  /** Focus the canvas for keyboard events */
  focusCanvas?: () => void;
}

const CanvasComponent: Component<CanvasComponentProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isDragging, setIsDragging] = createSignal(false);
  let componentRef: HTMLDivElement | undefined;

  // Use multi-selection system
  const isSelected = () => designerStore.isSelected(props.component.id);
  const isPrimarySelected = () =>
    designerStore.selectedId() === props.component.id;
  const isVisible = () => props.component.visible !== false;
  const isLocked = () => props.component.locked === true;
  const children = createMemo(() =>
    designerStore.getChildrenForRender(props.component.id),
  );
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

    // Focus canvas so keyboard shortcuts work immediately
    props.focusCanvas?.();

    // Don't allow dragging locked components
    if (isLocked()) {
      e.stopPropagation();
      designerStore.selectComponent(props.component.id, e.ctrlKey || e.metaKey);
      return;
    }

    // Always stop propagation to prevent canvas from deselecting
    e.stopPropagation();
    e.preventDefault();

    // Handle selection with Shift for multi-select (Adobe style)
    const addToSelection = e.shiftKey;
    if (!isSelected()) {
      designerStore.selectComponent(props.component.id, addToSelection);
    } else if (addToSelection) {
      // Toggle off if Shift+clicking already selected component
      designerStore.selectComponent(props.component.id, true);
      return;
    }

    if (e.detail === 2) {
      // Double click to edit label
      setEditValue(props.component.label);
      setIsEditing(true);
      return;
    }

    // Start drag tracking for all selected components
    setIsDragging(true);
    designerStore.setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const currentScale = props.scale ?? 1;

    // Store initial positions for all selected components
    const selectedComponents = designerStore.getSelectedComponents();
    const initialPositions = new Map(
      selectedComponents.map((c) => [c.id, { x: c.x, y: c.y }]),
    );

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      // Apply scale factor to movement delta
      const dx = (e.clientX - startX) / currentScale;
      const dy = (e.clientY - startY) / currentScale;

      // Move all selected components
      for (const comp of selectedComponents) {
        const initial = initialPositions.get(comp.id);
        if (initial) {
          designerStore.moveComponent(
            comp.id,
            Math.round(initial.x + dx),
            Math.round(initial.y + dy),
          );
        }
      }
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
      const addToSelection = e.shiftKey;
      designerStore.selectComponent(props.component.id, addToSelection);
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

  // Sizing modes - default to "fill" width and "fixed" height for stack layout compatibility
  const widthMode = () =>
    (props.component.widthMode as SizingMode) ??
    (props.inAutoLayout ? "fill" : "fixed");
  const heightMode = () =>
    (props.component.heightMode as SizingMode) ?? "fixed";
  const parentDir = () => props.parentDirection ?? "vertical";

  // Check if component type is a container
  const isLayoutContainer = () =>
    ["page", "stack", "scroll", "card", "group"].includes(props.component.type);

  // For auto-layout children, we use flex-based sizing instead of absolute
  const baseClass = () => {
    const classes = ["select-none", "transition-shadow", "relative"];
    if (isLocked()) classes.push("cursor-not-allowed");
    else classes.push("cursor-move");
    // Different ring styles for primary vs secondary selection
    if (isPrimarySelected()) {
      classes.push("ring-2 ring-accent ring-offset-2 ring-offset-surface");
    } else if (isSelected()) {
      classes.push("ring-2 ring-accent/60 ring-offset-1 ring-offset-surface");
    } else {
      classes.push("hover:ring-1 hover:ring-accent/50");
    }
    if (isLocked()) classes.push("opacity-80");

    // Only use absolute positioning if not in auto-layout
    if (!props.inAutoLayout) {
      classes.push("absolute");
    }
    return classes.join(" ");
  };

  // ============================================
  // Sizing logic - EXACTLY matching UIPreview
  // ============================================
  const getWidth = () => {
    const mode = widthMode();
    switch (mode) {
      case "fixed":
        return `${props.component.width}px`;
      case "fill":
        return "100%";
      case "hug":
        return "auto";
      default:
        return "100%";
    }
  };

  const getHeight = () => {
    const mode = heightMode();
    switch (mode) {
      case "fixed":
        return `${props.component.height}px`;
      case "fill":
        return "100%";
      case "hug":
        return "auto";
      default:
        return undefined;
    }
  };

  const getFlexGrow = () => {
    const dir = parentDir();
    if (dir === "vertical" && heightMode() === "fill") return 1;
    if (dir === "horizontal" && widthMode() === "fill") return 1;
    return 0;
  };

  const getFlexShrink = () => {
    const wMode = widthMode();
    const hMode = heightMode();
    // Don't shrink fixed size elements
    if (wMode === "fixed" && hMode === "fixed") return 0;
    return 1;
  };

  // Calculate style based on sizing mode - matching UIPreview logic exactly
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

    // For auto-layout, use same logic as UIPreview
    if (isLayoutContainer()) {
      // Container components - full sizing control
      return {
        width: getWidth(),
        height: getHeight(),
        "flex-grow": getFlexGrow(),
        "flex-shrink": getFlexShrink(),
        "min-width": widthMode() === "hug" ? `${props.component.width}px` : undefined,
        "min-height": heightMode() === "hug" ? `${props.component.height}px` : undefined,
      };
    }

    // Content components - width controlled, height auto
    return {
      width: getWidth(),
      "flex-grow": getFlexGrow(),
      "flex-shrink": getFlexShrink(),
    };
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
          <AutoLayoutContainer
            component={props.component}
            parentOffset={props.parentOffset}
            scale={props.scale}
            focusCanvas={props.focusCanvas}
          >
            {children()}
          </AutoLayoutContainer>
        </Show>

        {/* Page/Tab container */}
        <Show when={isPageContainer()}>
          <PageContainer
            component={props.component}
            parentOffset={props.parentOffset}
            scale={props.scale}
            focusCanvas={props.focusCanvas}
          >
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
                    x:
                      props.parentOffset.x +
                      props.component.x +
                      getContainerPadding(props.component),
                    y:
                      props.parentOffset.y +
                      props.component.y +
                      getContainerPadding(props.component) +
                      getContainerHeaderHeight(props.component),
                  }}
                  scale={props.scale}
                  focusCanvas={props.focusCanvas}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Locked indicator */}
      <Show when={isLocked() && isSelected()}>
        <div class="absolute top-1 left-1 bg-warning/80 text-warning-foreground p-0.5 rounded flex items-center justify-center">
          <IconLock class="w-3 h-3" />
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
  scale?: number;
  focusCanvas?: () => void;
}

const AutoLayoutContainer: Component<AutoLayoutContainerProps> = (props) => {
  const direction = () =>
    (props.component.props.direction as LayoutDirection) ?? "vertical";
  const gap = () => (props.component.props.gap as number) ?? 8;
  const padding = () => (props.component.props.padding as number) ?? 12;
  const headerHeight = () => getContainerHeaderHeight(props.component);
  const align = () => (props.component.props.align as string) ?? "stretch";
  const justify = () => (props.component.props.justify as string) ?? "start";

  // For scroll containers, enable overflow
  const isScroll = () => props.component.type === "scroll";
  const showScrollbar = () =>
    (props.component.props.showScrollbar as boolean) ?? true;

  // Build Tailwind classes for alignment
  const getAlignClass = () => {
    switch (align()) {
      case "start":
        return "items-start";
      case "center":
        return "items-center";
      case "end":
        return "items-end";
      case "stretch":
        return "items-stretch";
      default:
        return "items-stretch";
    }
  };

  const getJustifyClass = () => {
    switch (justify()) {
      case "start":
        return "justify-start";
      case "center":
        return "justify-center";
      case "end":
        return "justify-end";
      case "space-between":
        return "justify-between";
      default:
        return "justify-start";
    }
  };

  const containerClass = () => {
    const classes = [
      "absolute",
      "inset-0",
      "pointer-events-auto",
      "flex",
      direction() === "vertical" ? "flex-col" : "flex-row",
      getAlignClass(),
      getJustifyClass(),
    ];
    if (isScroll()) {
      classes.push(
        showScrollbar() ? "overflow-auto" : "overflow-auto scrollbar-hide",
      );
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
              y:
                props.parentOffset.y +
                props.component.y +
                padding() +
                headerHeight(),
            }}
            inAutoLayout={true}
            parentDirection={direction()}
            scale={props.scale}
            focusCanvas={props.focusCanvas}
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
  scale?: number;
  focusCanvas?: () => void;
}

const PageContainer: Component<PageContainerProps> = (props) => {
  const tabs = () => (props.component.props.tabs as PageTab[]) ?? [];
  const activeTabIndex = () =>
    (props.component.props.activeTabIndex as number) ?? 0;
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
      return (
        childTabId === activeTabId || (!childTabId && activeTabIndex() === 0)
      );
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
                y:
                  props.parentOffset.y +
                  props.component.y +
                  padding() +
                  headerHeight(),
              }}
              inAutoLayout={true}
              activeTabId={activeTab()?.id}
              parentDirection="vertical"
              scale={props.scale}
              focusCanvas={props.focusCanvas}
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

// ComponentPreview - matches UIPreview rendering style exactly
// Uses same structure as PreviewComponent in UIPreview.tsx
const ComponentPreview: Component<ComponentPreviewProps> = (props) => {
  const c = props.component;

  switch (c.type) {
    case "label": {
      const fontSize = (c.props.fontSize as number) ?? 14;
      const align = ((c.props.align as string) ?? "left") as
        | "left"
        | "center"
        | "right";
      const color = c.props.color as string | undefined;
      const bold = c.props.bold as boolean | undefined;
      return (
        <div
          class="text-foreground pointer-events-none"
          style={{
            "font-size": `${fontSize}px`,
            "font-weight": bold ? "bold" : "normal",
            "text-align": align,
            color: color,
          }}
        >
          {c.label}
        </div>
      );
    }

    case "button":
      return (
        <button
          class="w-full px-4 py-2 bg-accent text-white rounded-md font-medium text-center pointer-events-none"
          style={{ "font-size": "14px", "min-height": "36px" }}
        >
          {c.label}
        </button>
      );

    case "toggle": {
      const isOn = (c.props.defaultValue as boolean) ?? false;
      return (
        <div class="flex items-center justify-between pointer-events-none">
          <span class="text-sm text-foreground">{c.label}</span>
          <div
            class={`w-12 h-6 rounded-full transition-colors relative ${
              isOn ? "bg-accent" : "bg-background-tertiary"
            }`}
          >
            <div
              class={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                isOn ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
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
        <div class="space-y-1 pointer-events-none">
          <div class="flex items-center justify-between text-sm">
            <span class="text-foreground">{c.label}</span>
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
        <div class="space-y-1 pointer-events-none">
          <label class="text-sm text-foreground">{c.label}</label>
          <div class="w-full px-3 py-2 bg-background border border-border rounded text-sm">
            <span
              class={
                defaultInputVal ? "text-foreground" : "text-foreground-muted"
              }
            >
              {defaultInputVal || placeholder}
            </span>
          </div>
        </div>
      );
    }

    case "dropdown": {
      const options = (c.props.options as string[]) ?? ["Option 1", "Option 2"];
      const defaultIndex = (c.props.defaultIndex as number) ?? 0;
      const selectedOption = options[defaultIndex] ?? options[0] ?? "Select...";
      return (
        <div class="space-y-1 pointer-events-none">
          <label class="text-sm text-foreground">{c.label}</label>
          <div class="w-full flex items-center justify-between px-3 py-2 bg-background border border-border rounded text-sm">
            <span class="truncate">{selectedOption}</span>
            <svg
              class="w-4 h-4 flex-shrink-0 ml-2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      );
    }

    case "divider": {
      const thickness = (c.props.thickness as number) ?? 1;
      return (
        <hr
          class="border-border my-1 pointer-events-none"
          style={{ "border-width": `${thickness}px` }}
        />
      );
    }

    case "spacer":
      return (
        <div
          class="pointer-events-none"
          style={{ height: `${c.props?.height ?? 16}px` }}
        />
      );

    case "group":
      return (
        <div class="w-full h-full border border-border rounded-lg overflow-hidden flex flex-col pointer-events-none">
          <Show when={c.label}>
            <div class="h-8 px-3 border-b border-border flex items-center bg-surface shrink-0">
              <span class="font-medium text-sm text-foreground">{c.label}</span>
            </div>
          </Show>
        </div>
      );

    case "stack": {
      // Stack background - actual children handled by AutoLayoutContainer
      return (
        <div class="w-full h-full border-2 border-dashed border-accent/20 rounded-lg bg-accent/5 pointer-events-none" />
      );
    }

    case "page": {
      // Page background - actual tabs handled by PageContainer
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface overflow-hidden pointer-events-none" />
      );
    }

    case "scroll": {
      // Scroll background - actual children handled by AutoLayoutContainer
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface pointer-events-none" />
      );
    }

    case "card": {
      const showHeader = (c.props.showHeader as boolean) ?? true;
      const cardElevation = (c.props.elevation as number) ?? 1;
      return (
        <div
          class="w-full h-full rounded-lg border overflow-hidden flex flex-col pointer-events-none"
          style={{
            "background-color": "var(--surface)",
            "border-color": "var(--border)",
            "box-shadow":
              cardElevation > 0
                ? `0 ${cardElevation * 2}px ${cardElevation * 8}px rgba(0,0,0,0.15)`
                : "none",
          }}
        >
          <Show when={showHeader}>
            <div class="px-4 py-2 border-b border-border bg-background/50 shrink-0">
              <span class="font-medium text-sm">
                {(c.props?.title as string) ?? c.label ?? "Card"}
              </span>
            </div>
          </Show>
        </div>
      );
    }

    default:
      return (
        <div class="p-2 bg-error/10 text-error text-xs rounded pointer-events-none">
          Unknown: {c.type}
        </div>
      );
  }
};

export default DesignCanvas;
