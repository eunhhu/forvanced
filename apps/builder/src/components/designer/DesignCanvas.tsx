import { Component, For, Show, createSignal, createMemo } from "solid-js";
import {
  designerStore,
  type UIComponent,
  type ComponentType,
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
      console.log("Drop failed - type:", type, "contentAreaRef:", !!contentAreaRef);
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
    if (
      target.classList.contains("canvas-drop-zone") ||
      target.classList.contains("canvas-content") ||
      target.classList.contains("canvas-background")
    ) {
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
                  {(component) => (
                    <CanvasComponent component={component} />
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
}

const CanvasComponent: Component<CanvasComponentProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  const [isDragging, setIsDragging] = createSignal(false);

  const isSelected = () => designerStore.selectedId() === props.component.id;

  const handleMouseDown = (e: MouseEvent) => {
    // Ignore if clicking on delete button or resize handle
    const target = e.target as HTMLElement;
    if (target.closest("[data-action]")) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

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
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      designerStore.moveComponent(
        props.component.id,
        startCompX + dx,
        startCompY + dy
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
      class={`absolute cursor-move select-none transition-shadow ${
        isSelected() ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""
      }`}
      style={{
        left: `${props.component.x}px`,
        top: `${props.component.y}px`,
        width: `${props.component.width}px`,
        height: `${props.component.height}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Delete button */}
      <Show when={isSelected()}>
        <button
          data-action="delete"
          class="absolute -top-2 -right-2 w-5 h-5 bg-error rounded-full flex items-center justify-center text-white hover:bg-error/80 transition-colors z-10"
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
          class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center"
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
                startH + dy
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
          <div class={`relative w-10 h-5 rounded-full transition-colors ${isOn ? "bg-accent" : "bg-background-secondary"}`}>
            <div class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
          <span class="text-sm">{c.label}</span>
        </div>
      );
    }

    case "slider": {
      const min = (c.props.min as number) ?? 0;
      const max = (c.props.max as number) ?? 100;
      const defaultVal = (c.props.defaultValue as number) ?? 50;
      const percent = Math.min(100, Math.max(0, ((defaultVal - min) / (max - min)) * 100));
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
          <span class={defaultInputVal ? "text-foreground" : "text-foreground-muted"}>
            {defaultInputVal || placeholder}
          </span>
        </div>
      );
    }

    case "dropdown":
      return (
        <div class="w-full h-full flex items-center justify-between px-3 bg-background border border-border rounded text-sm pointer-events-none">
          <span>{c.label}</span>
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      );

    case "label":
      return (
        <div class="w-full h-full flex items-center text-sm">
          {c.label}
        </div>
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

    default:
      return <div class="w-full h-full bg-surface border border-border rounded" />;
  }
};

export default DesignCanvas;
