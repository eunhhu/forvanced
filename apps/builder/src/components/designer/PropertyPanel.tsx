import { Component, For, Show, createSignal, createMemo, createEffect, untrack, batch } from "solid-js";
import {
  designerStore,
  fridaActions,
  getActionById,
  type FridaActionCategory,
  type ComponentEvent,
  type ActionBinding,
} from "@/stores/designer";
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@/components/common/Icons";

export const PropertyPanel: Component = () => {
  const component = createMemo(() => designerStore.getSelectedComponent());

  return (
    <div class="w-72 border-l border-border bg-surface flex flex-col">
      <div class="p-3 border-b border-border">
        <h3 class="font-medium text-sm">Properties</h3>
        <Show when={component()}>
          <p class="text-xs text-foreground-muted mt-1">
            {component()!.type.charAt(0).toUpperCase() + component()!.type.slice(1)}
          </p>
        </Show>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show
          when={component()}
          fallback={
            <div class="flex-1 flex items-center justify-center p-4">
              <div class="text-center text-foreground-muted text-sm">
                <p>No component selected</p>
                <p class="text-xs mt-1">Click a component to edit its properties</p>
              </div>
            </div>
          }
        >
          {(c) => (
            <>
              {/* Basic Properties */}
              <PropertySection title="General">
                <PropertyInput
                  label="Label"
                  value={c().label}
                  onChange={(value) =>
                    designerStore.updateComponent(c().id, { label: value })
                  }
                />
                <PropertyRow label="Position">
                  <div class="flex gap-2">
                    <NumberInput
                      value={Math.round(c().x)}
                      onChange={(val) => designerStore.updateComponent(c().id, { x: val })}
                    />
                    <NumberInput
                      value={Math.round(c().y)}
                      onChange={(val) => designerStore.updateComponent(c().id, { y: val })}
                    />
                  </div>
                </PropertyRow>
                <PropertyRow label="Size">
                  <div class="flex gap-2">
                    <NumberInput
                      value={Math.round(c().width)}
                      onChange={(val) => designerStore.updateComponent(c().id, { width: val })}
                    />
                    <NumberInput
                      value={Math.round(c().height)}
                      onChange={(val) => designerStore.updateComponent(c().id, { height: val })}
                    />
                  </div>
                </PropertyRow>
              </PropertySection>

              {/* Component-specific properties */}
              <Show when={c().type === "toggle"}>
                <PropertySection title="Toggle Settings">
                  <PropertyRow label="Default">
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        (c().props.defaultValue as boolean) ?? false
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, defaultValue: !(c().props.defaultValue as boolean) },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          (c().props.defaultValue as boolean) ?? false
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </PropertyRow>
                </PropertySection>
              </Show>

              <Show when={c().type === "slider"}>
                <PropertySection title="Slider Settings">
                  <PropertyRow label="Min">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.min as number) ?? 0}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, min: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Max">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.max as number) ?? 100}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, max: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Step">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.step as number) ?? 1}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, step: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Default">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.defaultValue as number) ?? 50}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, defaultValue: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              <Show when={c().type === "input"}>
                <PropertySection title="Input Settings">
                  <PropertyInput
                    label="Placeholder"
                    value={(c().props.placeholder as string) ?? ""}
                    onChange={(value) =>
                      designerStore.updateComponent(c().id, {
                        props: { ...c().props, placeholder: value },
                      })
                    }
                  />
                  <PropertyInput
                    label="Default"
                    value={(c().props.defaultValue as string) ?? ""}
                    onChange={(value) =>
                      designerStore.updateComponent(c().id, {
                        props: { ...c().props, defaultValue: value },
                      })
                    }
                  />
                </PropertySection>
              </Show>

              <Show when={c().type === "dropdown"}>
                <PropertySection title="Dropdown Settings">
                  <PropertyRow label="Default Index">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.defaultIndex as number) ?? 0}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, defaultIndex: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Action Bindings */}
              <ActionBindingsSection component={c()} />
            </>
          )}
        </Show>
      </div>
    </div>
  );
};

interface PropertySectionProps {
  title: string;
  children: any;
}

const PropertySection: Component<PropertySectionProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(true);

  return (
    <div class="border-b border-border">
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <Show when={isOpen()} fallback={<ChevronRightIcon class="w-3 h-3" />}>
          <ChevronDownIcon class="w-3 h-3" />
        </Show>
        <span class="text-xs font-medium">{props.title}</span>
      </button>
      <Show when={isOpen()}>
        <div class="px-3 pb-3 space-y-2">{props.children}</div>
      </Show>
    </div>
  );
};

interface PropertyRowProps {
  label: string;
  children: any;
}

const PropertyRow: Component<PropertyRowProps> = (props) => (
  <div class="flex items-center justify-between">
    <label class="text-xs text-foreground-muted">{props.label}</label>
    {props.children}
  </div>
);

// Uncontrolled number input that doesn't lose focus on external updates
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  class?: string;
  min?: number;
}

const NumberInput: Component<NumberInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(String(props.value));
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(String(val));
    }
  });

  return (
    <input
      type="number"
      class={props.class ?? "w-16 px-2 py-1 text-xs bg-background border border-border rounded"}
      min={props.min}
      value={localValue()}
      onFocus={() => setIsFocused(true)}
      onInput={(e) => {
        const strVal = e.currentTarget.value;
        setLocalValue(strVal);
        const num = Number(strVal);
        if (!isNaN(num)) {
          props.onChange(num);
        }
      }}
      onBlur={() => setIsFocused(false)}
    />
  );
};

// Uncontrolled text input for binding params
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  type?: "text" | "number";
}

const TextInput: Component<TextInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value);
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <input
      type={props.type ?? "text"}
      class={props.class ?? "w-24 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded"}
      value={localValue()}
      onFocus={() => setIsFocused(true)}
      onInput={(e) => {
        const val = e.currentTarget.value;
        setLocalValue(val);
        props.onChange(val);
      }}
      onBlur={() => setIsFocused(false)}
    />
  );
};

interface PropertyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const PropertyInput: Component<PropertyInputProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [localValue, setLocalValue] = createSignal(props.value);
  const [isFocused, setIsFocused] = createSignal(false);

  // Sync from props when not focused
  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <div class="flex items-center justify-between">
      <label class="text-xs text-foreground-muted">{props.label}</label>
      <input
        ref={inputRef}
        type="text"
        class="w-32 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
        value={localValue()}
        onFocus={() => setIsFocused(true)}
        onInput={(e) => {
          const val = e.currentTarget.value;
          setLocalValue(val);
          props.onChange(val);
        }}
        onBlur={() => setIsFocused(false)}
      />
    </div>
  );
};

// Action Bindings Section
interface ActionBindingsSectionProps {
  component: ReturnType<typeof designerStore.getSelectedComponent> & {};
}

const ActionBindingsSection: Component<ActionBindingsSectionProps> = (props) => {
  const [isAdding, setIsAdding] = createSignal(false);

  const availableEvents = createMemo(() => {
    const type = props.component.type;
    const events: { event: ComponentEvent; label: string }[] = [];

    switch (type) {
      case "button":
        events.push({ event: "onClick", label: "On Click" });
        break;
      case "toggle":
        events.push({ event: "onToggle", label: "On Toggle" });
        break;
      case "slider":
        events.push({ event: "onSlide", label: "On Slide" });
        events.push({ event: "onChange", label: "On Change" });
        break;
      case "input":
      case "dropdown":
        events.push({ event: "onChange", label: "On Change" });
        break;
    }

    return events;
  });

  return (
    <PropertySection title="Actions">
      <For each={props.component.bindings}>
        {(binding) => (
          <BindingItem
            binding={binding}
            componentId={props.component.id}
          />
        )}
      </For>

      <Show when={props.component.bindings.length === 0 && !isAdding()}>
        <div class="text-xs text-foreground-muted text-center py-2">
          No actions bound
        </div>
      </Show>

      <Show
        when={!isAdding()}
        fallback={
          <AddBindingForm
            componentId={props.component.id}
            availableEvents={availableEvents()}
            onCancel={() => setIsAdding(false)}
            onAdd={() => setIsAdding(false)}
          />
        }
      >
        <Show when={availableEvents().length > 0}>
          <button
            class="w-full mt-2 px-3 py-1.5 text-xs border border-dashed border-border rounded hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-1"
            onClick={() => setIsAdding(true)}
          >
            <PlusIcon class="w-3 h-3" />
            Add Action
          </button>
        </Show>
      </Show>
    </PropertySection>
  );
};

interface BindingItemProps {
  binding: ActionBinding;
  componentId: string;
}

const BindingItem: Component<BindingItemProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const action = createMemo(() => getActionById(props.binding.actionId));

  return (
    <div class="border border-border rounded overflow-hidden">
      <div
        class="flex items-center justify-between px-2 py-1.5 bg-background hover:bg-surface-hover cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded())}
      >
        <div class="flex items-center gap-2 min-w-0">
          <Show when={isExpanded()} fallback={<ChevronRightIcon class="w-3 h-3 flex-shrink-0" />}>
            <ChevronDownIcon class="w-3 h-3 flex-shrink-0" />
          </Show>
          <div class="min-w-0">
            <div class="text-xs font-medium truncate">{action()?.name ?? "Unknown"}</div>
            <div class="text-[10px] text-foreground-muted">{props.binding.event}</div>
          </div>
        </div>
        <button
          class="p-1 hover:bg-error/20 rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            designerStore.removeBinding(props.componentId, props.binding.id);
          }}
        >
          <TrashIcon class="w-3 h-3 text-error" />
        </button>
      </div>

      <Show when={isExpanded() && action()}>
        <div class="px-2 py-2 space-y-2 border-t border-border">
          <For each={action()!.params}>
            {(param) => (
              <BindingParamInput
                param={param}
                value={props.binding.params[param.name] ?? param.defaultValue ?? ""}
                onChange={(val) => {
                  designerStore.updateBinding(props.componentId, props.binding.id, {
                    params: {
                      ...props.binding.params,
                      [param.name]: val,
                    },
                  });
                }}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// Binding parameter input with local state to prevent focus loss
interface BindingParamInputProps {
  param: {
    name: string;
    label: string;
    type: "string" | "number" | "boolean" | "select";
    options?: { value: string; label: string }[];
    defaultValue?: string | number | boolean;
  };
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}

const BindingParamInput: Component<BindingParamInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(String(props.value));
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = String(props.value);
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <div class="flex items-center justify-between">
      <label class="text-[10px] text-foreground-muted">{props.param.label}</label>
      <Show
        when={props.param.type === "select"}
        fallback={
          <input
            type={props.param.type === "number" ? "number" : "text"}
            class="w-24 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded"
            value={localValue()}
            onFocus={() => setIsFocused(true)}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setLocalValue(val);
              props.onChange(props.param.type === "number" ? Number(val) : val);
            }}
            onBlur={() => setIsFocused(false)}
          />
        }
      >
        <select
          class="w-24 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded"
          value={localValue()}
          onChange={(e) => {
            const val = e.currentTarget.value;
            setLocalValue(val);
            props.onChange(val);
          }}
        >
          <For each={props.param.options}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
          </For>
        </select>
      </Show>
    </div>
  );
};

interface AddBindingFormProps {
  componentId: string;
  availableEvents: { event: ComponentEvent; label: string }[];
  onCancel: () => void;
  onAdd: () => void;
}

const AddBindingForm: Component<AddBindingFormProps> = (props) => {
  const [selectedEvent, setSelectedEvent] = createSignal<ComponentEvent | "">(
    props.availableEvents[0]?.event ?? ""
  );
  const [selectedCategory, setSelectedCategory] = createSignal<FridaActionCategory>("memory");
  const [selectedActionId, setSelectedActionId] = createSignal<string>("");

  const categories: { id: FridaActionCategory; label: string }[] = [
    { id: "memory", label: "Memory" },
    { id: "hook", label: "Hook" },
    { id: "scanner", label: "Scanner" },
    { id: "java", label: "Java" },
    { id: "objc", label: "ObjC" },
    { id: "swift", label: "Swift" },
    { id: "process", label: "Process" },
  ];

  const filteredActions = createMemo(() =>
    fridaActions.filter((a) => a.category === selectedCategory())
  );

  const handleAdd = () => {
    const event = selectedEvent();
    const actionId = selectedActionId();
    if (!event || !actionId) return;

    const action = getActionById(actionId);
    const defaultParams: Record<string, string | number | boolean> = {};
    action?.params.forEach((p) => {
      if (p.defaultValue !== undefined) {
        defaultParams[p.name] = p.defaultValue;
      }
    });

    designerStore.addBinding(props.componentId, event, actionId, defaultParams);
    props.onAdd();
  };

  return (
    <div class="border border-accent rounded p-2 space-y-2">
      {/* Event Selection */}
      <div>
        <label class="text-[10px] text-foreground-muted block mb-1">Event</label>
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={selectedEvent()}
          onChange={(e) => setSelectedEvent(e.currentTarget.value as ComponentEvent)}
        >
          <For each={props.availableEvents}>
            {(ev) => <option value={ev.event}>{ev.label}</option>}
          </For>
        </select>
      </div>

      {/* Category Selection */}
      <div>
        <label class="text-[10px] text-foreground-muted block mb-1">Category</label>
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={selectedCategory()}
          onChange={(e) => {
            setSelectedCategory(e.currentTarget.value as FridaActionCategory);
            setSelectedActionId("");
          }}
        >
          <For each={categories}>
            {(cat) => <option value={cat.id}>{cat.label}</option>}
          </For>
        </select>
      </div>

      {/* Action Selection */}
      <div>
        <label class="text-[10px] text-foreground-muted block mb-1">Action</label>
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={selectedActionId()}
          onChange={(e) => setSelectedActionId(e.currentTarget.value)}
        >
          <option value="">Select action...</option>
          <For each={filteredActions()}>
            {(action) => <option value={action.id}>{action.name}</option>}
          </For>
        </select>
        <Show when={selectedActionId()}>
          <p class="text-[10px] text-foreground-muted mt-1">
            {getActionById(selectedActionId())?.description}
          </p>
        </Show>
      </div>

      {/* Buttons */}
      <div class="flex gap-2 pt-1">
        <button
          class="flex-1 px-2 py-1 text-xs bg-background border border-border rounded hover:bg-surface-hover transition-colors"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          class="flex-1 px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
          onClick={handleAdd}
          disabled={!selectedEvent() || !selectedActionId()}
        >
          Add
        </button>
      </div>
    </div>
  );
};

export default PropertyPanel;
