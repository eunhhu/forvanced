import { Component, For, Show, createSignal, createMemo, createEffect, untrack } from "solid-js";
import { designerStore } from "@/stores/designer";
import {
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

              {/* Script Connection Hint */}
              <PropertySection title="Actions">
                <div class="text-[10px] text-foreground-muted space-y-2">
                  <p>
                    To add actions to this component, go to the <strong>Script</strong> tab
                    and use the <strong>UI Event</strong> node.
                  </p>
                  <div class="p-2 bg-background/50 rounded text-[9px]">
                    <strong>Component ID:</strong>
                    <code class="ml-1 px-1 py-0.5 bg-accent/10 rounded">{c().id}</code>
                  </div>
                </div>
              </PropertySection>
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

export default PropertyPanel;
