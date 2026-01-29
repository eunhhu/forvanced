import { Component, For, Show, createSignal } from "solid-js";
import {
  designerStore,
  type UIComponent,
  type ComponentType,
} from "@/stores/designer";
import { TrashIcon } from "@/components/common/Icons";

export const DesignCanvas: Component = () => {
  let contentAreaRef: HTMLDivElement | undefined;

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

  const handleCanvasClick = (e: MouseEvent) => {
    // Deselect when clicking on empty canvas area
    const target = e.target as HTMLElement;
    if (target.classList.contains("canvas-drop-zone") || target.classList.contains("canvas-content")) {
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
        class="flex-1 relative overflow-auto bg-background canvas-drop-zone"
        style={{
          "background-image":
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          "background-size": "20px 20px",
        }}
        onClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Preview Frame */}
        <div
          class="absolute top-8 left-1/2 -translate-x-1/2 w-[400px] min-h-[600px] bg-surface rounded-lg shadow-lg border border-border"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Title Bar */}
          <div class="h-8 border-b border-border flex items-center px-3">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-error/50" />
              <div class="w-3 h-3 rounded-full bg-warning/50" />
              <div class="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <div class="flex-1 text-center text-xs text-foreground-muted">
              Trainer Preview
            </div>
          </div>

          {/* Content Area - Drop Zone */}
          <div
            ref={contentAreaRef}
            class="relative p-4 min-h-[568px] canvas-content"
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
  );
};

interface CanvasComponentProps {
  component: UIComponent;
}

const CanvasComponent: Component<CanvasComponentProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");

  const isSelected = () => designerStore.selectedId() === props.component.id;

  const handleMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    designerStore.setSelectedId(props.component.id);

    if (e.detail === 2) {
      // Double click to edit label
      setEditValue(props.component.label);
      setIsEditing(true);
      return;
    }

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
          class="absolute -top-2 -right-2 w-5 h-5 bg-error rounded-full flex items-center justify-center text-white hover:bg-error/80 transition-colors z-10"
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
          class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
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

    case "toggle":
      return (
        <div class="w-full h-full flex items-center gap-3">
          <div class="relative w-10 h-5 bg-background-secondary rounded-full">
            <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-foreground-muted rounded-full transition-transform" />
          </div>
          <span class="text-sm">{c.label}</span>
        </div>
      );

    case "slider":
      return (
        <div class="w-full h-full flex flex-col justify-center gap-1">
          <div class="flex justify-between text-xs">
            <span>{c.label}</span>
            <span class="text-foreground-muted">
              {(c.props.defaultValue as number) ?? 50}
            </span>
          </div>
          <div class="relative h-2 bg-background-secondary rounded-full">
            <div
              class="absolute top-0 left-0 h-full bg-accent rounded-full"
              style={{ width: "50%" }}
            />
            <div
              class="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow border border-border"
              style={{ left: "calc(50% - 8px)" }}
            />
          </div>
        </div>
      );

    case "input":
      return (
        <div class="w-full h-full px-3 bg-background border border-border rounded text-sm flex items-center text-foreground-muted pointer-events-none">
          {c.label || (c.props.placeholder as string) || "Input"}
        </div>
      );

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
