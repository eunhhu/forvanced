import { Component, For, Show, createSignal, createMemo } from "solid-js";
import {
  designerStore,
  type UIComponent,
  type ComponentType,
  type LayoutDirection,
  type PageTab,
} from "@/stores/designer";
import { projectStore } from "@/stores/project";
import { TrashIcon } from "@/components/common/Icons";

export const DesignCanvas: Component = () => {
  let contentAreaRef: HTMLDivElement | undefined;

  // Get window size from project - access ui object reactively
  const windowWidth = createMemo(() => {
    const width = projectStore.currentProject()?.ui?.width;
    return width && width > 0 ? width : 400;
  });
  const windowHeight = createMemo(() => {
    const height = projectStore.currentProject()?.ui?.height;
    return height && height > 0 ? height : 500;
  });

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
                <For each={designerStore.components()}>
                  {(component) => <CanvasComponent component={component} />}
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
}

const CanvasComponent: Component<CanvasComponentProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  const [isDragging, setIsDragging] = createSignal(false);
  let componentRef: HTMLDivElement | undefined;

  const isSelected = () => designerStore.selectedId() === props.component.id;

  const handleMouseDown = (e: MouseEvent) => {
    // Ignore if clicking on delete button or resize handle
    const target = e.target as HTMLElement;
    if (target.closest("[data-action]")) {
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

  return (
    <div
      ref={componentRef}
      data-component-id={props.component.id}
      class={`absolute cursor-move select-none transition-shadow ${
        isSelected()
          ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
          : "hover:ring-1 hover:ring-accent/50"
      }`}
      style={{
        left: `${props.component.x}px`,
        top: `${props.component.y}px`,
        width: `${props.component.width}px`,
        height: `${props.component.height}px`,
        "z-index": isSelected() ? 10 : 1,
      }}
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
      const direction = (c.props.direction as LayoutDirection) ?? "vertical";
      const gap = (c.props.gap as number) ?? 8;
      const padding = (c.props.padding as number) ?? 12;
      return (
        <div
          class="w-full h-full border-2 border-dashed border-accent/30 rounded-lg bg-accent/5 overflow-hidden"
          style={{ padding: `${padding}px` }}
        >
          <div
            class={`w-full h-full flex ${direction === "vertical" ? "flex-col" : "flex-row"} items-center justify-center`}
            style={{ gap: `${gap}px` }}
          >
            <div class="text-xs text-accent/60 flex items-center gap-1">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                {direction === "vertical" ? (
                  <>
                    <rect x="6" y="3" width="12" height="4" rx="1" />
                    <rect x="6" y="10" width="12" height="4" rx="1" />
                    <rect x="6" y="17" width="12" height="4" rx="1" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="6" width="4" height="12" rx="1" />
                    <rect x="10" y="6" width="4" height="12" rx="1" />
                    <rect x="17" y="6" width="4" height="12" rx="1" />
                  </>
                )}
              </svg>
              <span>Stack ({direction})</span>
            </div>
          </div>
        </div>
      );
    }

    case "page": {
      const tabs = (c.props.tabs as PageTab[]) ?? [];
      const activeIndex = (c.props.activeTabIndex as number) ?? 0;
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface overflow-hidden flex flex-col">
          {/* Tab header */}
          <div class="h-8 border-b border-border flex items-center bg-background-secondary">
            <For each={tabs}>
              {(tab, i) => (
                <div
                  class={`px-3 h-full flex items-center text-xs ${
                    i() === activeIndex
                      ? "bg-surface border-b-2 border-accent text-accent"
                      : "text-foreground-muted"
                  }`}
                >
                  {tab.label}
                </div>
              )}
            </For>
          </div>
          {/* Tab content area */}
          <div class="flex-1 flex items-center justify-center text-xs text-foreground-muted">
            Drop components here
          </div>
        </div>
      );
    }

    case "scroll": {
      const direction = (c.props.direction as LayoutDirection) ?? "vertical";
      const showScrollbar = (c.props.showScrollbar as boolean) ?? true;
      return (
        <div class="w-full h-full border border-border rounded-lg bg-surface overflow-hidden relative">
          <div class="absolute inset-2 flex items-center justify-center text-xs text-foreground-muted">
            <div class="flex items-center gap-1">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                {direction === "vertical" ? (
                  <>
                    <path d="M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4" />
                  </>
                ) : (
                  <>
                    <path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" />
                  </>
                )}
              </svg>
              <span>Scroll ({direction})</span>
            </div>
          </div>
          {/* Scrollbar indicator */}
          <Show when={showScrollbar}>
            <div
              class={`absolute bg-foreground-muted/30 rounded-full ${
                direction === "vertical"
                  ? "right-1 top-2 bottom-2 w-1.5"
                  : "bottom-1 left-2 right-2 h-1.5"
              }`}
            >
              <div
                class={`bg-foreground-muted/60 rounded-full ${
                  direction === "vertical" ? "w-full h-8" : "w-8 h-full"
                }`}
              />
            </div>
          </Show>
        </div>
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
