import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  untrack,
} from "solid-js";
import {
  designerStore,
  type LayoutDirection,
  type Alignment,
  type PageTab,
  type SizingMode,
} from "@/stores/designer";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/common/Icons";

// Helper function to get parent's tabs if parent is a Page component
function getParentPageTabs(
  component: ReturnType<typeof designerStore.getSelectedComponent>,
): PageTab[] | null {
  if (!component?.parentId) return null;
  const parent = designerStore
    .components()
    .find((c) => c.id === component.parentId);
  if (!parent || parent.type !== "page") return null;
  return (parent.props.tabs as PageTab[]) ?? null;
}

export const PropertyPanel: Component = () => {
  const component = createMemo(() => designerStore.getSelectedComponent());

  return (
    <div class="h-full bg-surface flex flex-col overflow-hidden">
      <div class="p-3 border-b border-border">
        <h3 class="font-medium text-sm">Properties</h3>
        <Show when={component()}>
          <p class="text-xs text-foreground-muted mt-1">
            {component()!.type.charAt(0).toUpperCase() +
              component()!.type.slice(1)}
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
                <p class="text-xs mt-1">
                  Click a component to edit its properties
                </p>
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
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, { x: val })
                      }
                    />
                    <NumberInput
                      value={Math.round(c().y)}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, { y: val })
                      }
                    />
                  </div>
                </PropertyRow>
                <PropertyRow label="Size">
                  <div class="flex gap-2">
                    <NumberInput
                      value={Math.round(c().width)}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, { width: val })
                      }
                    />
                    <NumberInput
                      value={Math.round(c().height)}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, { height: val })
                      }
                    />
                  </div>
                </PropertyRow>
                <PropertyRow label="Width Mode">
                  <select
                    class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                    value={(c().widthMode as SizingMode) ?? "fixed"}
                    onChange={(e) =>
                      designerStore.updateComponent(c().id, {
                        widthMode: e.currentTarget.value as SizingMode,
                      })
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="fill">Fill (expand)</option>
                    <option value="hug">Hug (fit content)</option>
                  </select>
                </PropertyRow>
                <PropertyRow label="Height Mode">
                  <select
                    class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                    value={(c().heightMode as SizingMode) ?? "fixed"}
                    onChange={(e) =>
                      designerStore.updateComponent(c().id, {
                        heightMode: e.currentTarget.value as SizingMode,
                      })
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="fill">Fill (expand)</option>
                    <option value="hug">Hug (fit content)</option>
                  </select>
                </PropertyRow>
              </PropertySection>

              {/* Component-specific properties */}
              <Show when={c().type === "toggle"}>
                <PropertySection title="Toggle Settings">
                  <PropertyRow label="Default">
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        ((c().props.defaultValue as boolean) ?? false)
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            defaultValue: !(c().props.defaultValue as boolean),
                          },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          ((c().props.defaultValue as boolean) ?? false)
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
                  <div class="space-y-2">
                    <div class="text-xs text-foreground-muted mb-1">
                      Options
                    </div>
                    <For
                      each={
                        (c().props.options as string[]) ?? [
                          "Option 1",
                          "Option 2",
                        ]
                      }
                    >
                      {(option, i) => (
                        <div class="flex items-center gap-2">
                          <ArrayItemInput
                            value={option}
                            onChange={(value) => {
                              const options = [
                                ...((c().props.options as string[]) ?? [
                                  "Option 1",
                                  "Option 2",
                                ]),
                              ];
                              options[i()] = value;
                              designerStore.updateComponent(c().id, {
                                props: { ...c().props, options },
                              });
                            }}
                          />
                          <button
                            class="w-6 h-6 flex items-center justify-center text-error hover:bg-error/10 rounded"
                            onClick={() => {
                              const options = [
                                ...((c().props.options as string[]) ?? []),
                              ].filter((_, idx) => idx !== i());
                              designerStore.updateComponent(c().id, {
                                props: { ...c().props, options },
                              });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </For>
                    <button
                      class="w-full px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20"
                      onClick={() => {
                        const options = [
                          ...((c().props.options as string[]) ?? [
                            "Option 1",
                            "Option 2",
                          ]),
                          `Option ${((c().props.options as string[]) ?? []).length + 1}`,
                        ];
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, options },
                        });
                      }}
                    >
                      + Add Option
                    </button>
                  </div>
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

              {/* Stack Layout Settings */}
              <Show when={c().type === "stack"}>
                <PropertySection title="Stack Layout">
                  <PropertyRow label="Direction">
                    <select
                      class="w-28 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={
                        (c().props.direction as LayoutDirection) ?? "vertical"
                      }
                      onChange={(e) =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            direction: e.currentTarget.value as LayoutDirection,
                          },
                        })
                      }
                    >
                      <option value="vertical">Vertical</option>
                      <option value="horizontal">Horizontal</option>
                    </select>
                  </PropertyRow>
                  <PropertyRow label="Gap">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.gap as number) ?? 8}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, gap: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Padding">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.padding as number) ?? 12}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, padding: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Align">
                    <select
                      class="w-28 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.align as Alignment) ?? "stretch"}
                      onChange={(e) =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            align: e.currentTarget.value as Alignment,
                          },
                        })
                      }
                    >
                      <option value="start">Start</option>
                      <option value="center">Center</option>
                      <option value="end">End</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </PropertyRow>
                  <PropertyRow label="Justify">
                    <select
                      class="w-28 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={(c().props.justify as Alignment) ?? "start"}
                      onChange={(e) =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            justify: e.currentTarget.value as Alignment,
                          },
                        })
                      }
                    >
                      <option value="start">Start</option>
                      <option value="center">Center</option>
                      <option value="end">End</option>
                      <option value="space-between">Space Between</option>
                    </select>
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Page Settings */}
              <Show when={c().type === "page"}>
                <PropertySection title="Page Tabs">
                  <div class="space-y-2">
                    <For each={(c().props.tabs as PageTab[]) ?? []}>
                      {(tab, i) => (
                        <div class="flex items-center gap-2">
                          <ArrayItemInput
                            value={tab.label}
                            onChange={(value) => {
                              const tabs = [
                                ...((c().props.tabs as PageTab[]) ?? []),
                              ];
                              tabs[i()] = { ...tabs[i()], label: value };
                              designerStore.updateComponent(c().id, {
                                props: { ...c().props, tabs },
                              });
                            }}
                          />
                          <button
                            class="w-6 h-6 flex items-center justify-center text-error hover:bg-error/10 rounded"
                            onClick={() => {
                              const tabs = [
                                ...((c().props.tabs as PageTab[]) ?? []),
                              ].filter((_, idx) => idx !== i());
                              designerStore.updateComponent(c().id, {
                                props: { ...c().props, tabs },
                              });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </For>
                    <button
                      class="w-full px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20"
                      onClick={() => {
                        const tabs = [
                          ...((c().props.tabs as PageTab[]) ?? []),
                          {
                            id: crypto.randomUUID(),
                            label: `Tab ${((c().props.tabs as PageTab[]) ?? []).length + 1}`,
                          },
                        ];
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, tabs },
                        });
                      }}
                    >
                      + Add Tab
                    </button>
                  </div>
                  <PropertyRow label="Active Tab">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.activeTabIndex as number) ?? 0}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, activeTabIndex: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Scroll Settings */}
              <Show when={c().type === "scroll"}>
                <PropertySection title="Scroll Settings">
                  <PropertyRow label="Direction">
                    <select
                      class="w-28 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={
                        (c().props.direction as LayoutDirection) ?? "vertical"
                      }
                      onChange={(e) =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            direction: e.currentTarget.value as LayoutDirection,
                          },
                        })
                      }
                    >
                      <option value="vertical">Vertical</option>
                      <option value="horizontal">Horizontal</option>
                    </select>
                  </PropertyRow>
                  <PropertyRow label="Gap">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.gap as number) ?? 8}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, gap: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Scrollbar">
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        ((c().props.showScrollbar as boolean) ?? true)
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            showScrollbar: !(
                              (c().props.showScrollbar as boolean) ?? true
                            ),
                          },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          ((c().props.showScrollbar as boolean) ?? true)
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </PropertyRow>
                  <PropertyRow label="Padding">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.padding as number) ?? 8}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, padding: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Divider Settings */}
              <Show when={c().type === "divider"}>
                <PropertySection title="Divider Settings">
                  <PropertyRow label="Direction">
                    <select
                      class="w-28 px-2 py-1 text-xs bg-background border border-border rounded"
                      value={
                        (c().props.direction as LayoutDirection) ?? "horizontal"
                      }
                      onChange={(e) =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            direction: e.currentTarget.value as LayoutDirection,
                          },
                        })
                      }
                    >
                      <option value="horizontal">Horizontal</option>
                      <option value="vertical">Vertical</option>
                    </select>
                  </PropertyRow>
                  <PropertyRow label="Thickness">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={1}
                      value={(c().props.thickness as number) ?? 1}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, thickness: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Card Settings */}
              <Show when={c().type === "card"}>
                <PropertySection title="Card Settings">
                  <PropertyInput
                    label="Title"
                    value={(c().props.title as string) ?? "Card"}
                    onChange={(value) =>
                      designerStore.updateComponent(c().id, {
                        props: { ...c().props, title: value },
                      })
                    }
                  />
                  <PropertyRow label="Show Header">
                    <button
                      class={`w-10 h-5 rounded-full transition-colors relative ${
                        ((c().props.showHeader as boolean) ?? true)
                          ? "bg-accent"
                          : "bg-background-secondary"
                      }`}
                      onClick={() =>
                        designerStore.updateComponent(c().id, {
                          props: {
                            ...c().props,
                            showHeader: !(
                              (c().props.showHeader as boolean) ?? true
                            ),
                          },
                        })
                      }
                    >
                      <div
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          ((c().props.showHeader as boolean) ?? true)
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </PropertyRow>
                  <PropertyRow label="Padding">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.padding as number) ?? 16}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, padding: val },
                        })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Elevation">
                    <NumberInput
                      class="w-20 px-2 py-1 text-xs bg-background border border-border rounded"
                      min={0}
                      value={(c().props.elevation as number) ?? 1}
                      onChange={(val) =>
                        designerStore.updateComponent(c().id, {
                          props: { ...c().props, elevation: val },
                        })
                      }
                    />
                  </PropertyRow>
                </PropertySection>
              </Show>

              {/* Tab Assignment (for children of Page components) */}
              <Show when={getParentPageTabs(c())}>
                {(tabs) => (
                  <PropertySection title="Tab Assignment">
                    <PropertyRow label="Show on Tab">
                      <select
                        class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                        value={
                          (c().props.tabId as string) ?? tabs()[0]?.id ?? ""
                        }
                        onChange={(e) =>
                          designerStore.updateComponent(c().id, {
                            props: {
                              ...c().props,
                              tabId: e.currentTarget.value,
                            },
                          })
                        }
                      >
                        <For each={tabs()}>
                          {(tab) => <option value={tab.id}>{tab.label}</option>}
                        </For>
                      </select>
                    </PropertyRow>
                  </PropertySection>
                )}
              </Show>

              {/* Script Connection Hint */}
              <PropertySection title="Actions">
                <div class="text-[10px] text-foreground-muted space-y-2">
                  <p>
                    To add actions to this component, go to the{" "}
                    <strong>Script</strong> tab and use the{" "}
                    <strong>UI Event</strong> node.
                  </p>
                  <div class="p-2 bg-background/50 rounded text-[9px]">
                    <strong>Component ID:</strong>
                    <code class="ml-1 px-1 py-0.5 bg-accent/10 rounded">
                      {c().id}
                    </code>
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
      class={
        props.class ??
        "w-16 px-2 py-1 text-xs bg-background border border-border rounded"
      }
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

// Uncontrolled text input for array items (tabs, dropdown options) that doesn't lose focus
interface ArrayItemInputProps {
  value: string;
  onChange: (value: string) => void;
  class?: string;
}

const ArrayItemInput: Component<ArrayItemInputProps> = (props) => {
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
    <input
      type="text"
      class={
        props.class ??
        "flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
      }
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

export default PropertyPanel;
