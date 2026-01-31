import { Component, For, Show, createSignal } from "solid-js";
import { designerStore, type ComponentType } from "@/stores/designer";

interface PaletteItem {
  type: ComponentType;
  label: string;
  icon: Component<{ class?: string }>;
  description: string;
}

interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

const paletteCategories: PaletteCategory[] = [
  {
    name: "Controls",
    items: [
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
    ],
  },
  {
    name: "Layout",
    items: [
      {
        type: "stack",
        label: "Stack",
        icon: StackIcon,
        description: "Auto arrange children",
      },
      {
        type: "page",
        label: "Page",
        icon: PageIcon,
        description: "Tabbed page container",
      },
      {
        type: "scroll",
        label: "Scroll",
        icon: ScrollIcon,
        description: "Scrollable container",
      },
      {
        type: "card",
        label: "Card",
        icon: CardIcon,
        description: "Card with header",
      },
      {
        type: "group",
        label: "Group",
        icon: GroupIcon,
        description: "Simple container",
      },
      {
        type: "divider",
        label: "Divider",
        icon: DividerIcon,
        description: "Visual separator",
      },
      {
        type: "spacer",
        label: "Spacer",
        icon: SpacerIcon,
        description: "Empty space",
      },
    ],
  },
];

export const ComponentPalette: Component = () => {
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(
    new Set(["Controls", "Layout"]),
  );

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

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

      <div class="flex-1 overflow-y-auto">
        <For each={paletteCategories}>
          {(category) => (
            <div class="border-b border-border">
              <button
                class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
                onClick={() => toggleCategory(category.name)}
              >
                <Show
                  when={expandedCategories().has(category.name)}
                  fallback={
                    <svg
                      class="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  }
                >
                  <svg
                    class="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </Show>
                <span class="text-xs font-medium">{category.name}</span>
                <span class="ml-auto text-xs text-foreground-muted">
                  {category.items.length}
                </span>
              </button>
              <Show when={expandedCategories().has(category.name)}>
                <div class="px-2 pb-2 space-y-1">
                  <For each={category.items}>
                    {(item) => (
                      <div
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, item.type)}
                        onDragEnd={handleDragEnd}
                        class="flex items-center gap-3 p-2 rounded-lg cursor-grab hover:bg-surface-hover active:cursor-grabbing transition-colors group"
                      >
                        <div class="w-7 h-7 rounded bg-background flex items-center justify-center text-foreground-muted group-hover:text-accent transition-colors">
                          <item.icon class="w-4 h-4" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-medium">{item.label}</div>
                          <div class="text-[10px] text-foreground-muted truncate">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
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

function StackIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="4" y="3" width="16" height="5" rx="1" />
      <rect x="4" y="10" width="16" height="5" rx="1" />
      <rect x="4" y="17" width="16" height="4" rx="1" />
    </svg>
  );
}

function PageIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 8h18" />
      <path d="M8 3v5" />
      <path d="M14 3v5" />
    </svg>
  );
}

function ScrollIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M19 8v8" />
      <path d="M19 10l-2-2 2-2" />
      <path d="M19 18l-2-2 2-2" />
    </svg>
  );
}

function CardIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 7h4" />
    </svg>
  );
}

function DividerIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M4 12h16" />
      <path d="M4 6h4" />
      <path d="M16 6h4" />
      <path d="M4 18h4" />
      <path d="M16 18h4" />
    </svg>
  );
}

function SpacerIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M4 8h16" stroke-dasharray="4 2" />
      <path d="M4 16h16" stroke-dasharray="4 2" />
      <path d="M12 8v8" stroke-dasharray="2 2" />
    </svg>
  );
}

export default ComponentPalette;
