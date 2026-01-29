import { Component, For } from "solid-js";
import { designerStore, type ComponentType } from "@/stores/designer";

interface PaletteItem {
  type: ComponentType;
  label: string;
  icon: Component<{ class?: string }>;
  description: string;
}

const paletteItems: PaletteItem[] = [
  {
    type: "button",
    label: "Button",
    icon: ButtonIcon,
    description: "Trigger actions on click",
  },
  {
    type: "toggle",
    label: "Toggle",
    icon: ToggleIcon,
    description: "On/off switch for features",
  },
  {
    type: "slider",
    label: "Slider",
    icon: SliderIcon,
    description: "Adjust numeric values",
  },
  {
    type: "input",
    label: "Input",
    icon: InputIcon,
    description: "Text or number input",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: DropdownIcon,
    description: "Select from options",
  },
  {
    type: "label",
    label: "Label",
    icon: LabelIcon,
    description: "Display text",
  },
  {
    type: "group",
    label: "Group",
    icon: GroupIcon,
    description: "Container for components",
  },
];

export const ComponentPalette: Component = () => {
  const handleDragStart = (e: DragEvent, type: ComponentType) => {
    // Store the dragging type in global state (workaround for WebView dataTransfer issues)
    designerStore.setDraggingComponentType(type);

    if (e.dataTransfer) {
      // Also set data in dataTransfer for browsers that support it
      e.dataTransfer.setData("componentType", type);
      e.dataTransfer.setData("text/plain", type);
      e.dataTransfer.effectAllowed = "copy";
    }
    console.log("DragStart:", type);
  };

  const handleDragEnd = () => {
    // Clear the dragging type when drag ends
    designerStore.setDraggingComponentType(null);
  };

  return (
    <div class="w-56 border-r border-border bg-surface flex flex-col">
      <div class="p-3 border-b border-border">
        <h3 class="font-medium text-sm">Components</h3>
        <p class="text-xs text-foreground-muted mt-1">Drag to canvas to add</p>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <For each={paletteItems}>
          {(item) => (
            <div
              draggable={true}
              onDragStart={(e) => handleDragStart(e, item.type)}
              onDragEnd={handleDragEnd}
              class="flex items-center gap-3 p-2.5 rounded-lg cursor-grab hover:bg-surface-hover active:cursor-grabbing transition-colors group"
            >
              <div class="w-8 h-8 rounded bg-background flex items-center justify-center text-foreground-muted group-hover:text-accent transition-colors">
                <item.icon class="w-4 h-4" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{item.label}</div>
                <div class="text-xs text-foreground-muted truncate">
                  {item.description}
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="p-3 border-t border-border">
        <div class="text-xs text-foreground-muted">
          <span class="font-medium">Tip:</span> Double-click component to edit
          label
        </div>
      </div>
    </div>
  );
};

// Component Icons
function ButtonIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M7 12h10" />
    </svg>
  );
}

function ToggleIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="1" y="7" width="22" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function SliderIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function InputIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 12h0" />
    </svg>
  );
}

function DropdownIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 12h8" />
      <path d="M16 10l2 2-2 2" />
    </svg>
  );
}

function LabelIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  );
}

function GroupIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}

export default ComponentPalette;
