import {
  Component,
  For,
  Show,
  createMemo,
  createSignal,
  createEffect,
  untrack,
} from "solid-js";
import {
  scriptStore,
  type ScriptNode,
  type ValueType,
  type UIEventType,
  nodeTemplates,
} from "@/stores/script";
import { designerStore } from "@/stores/designer";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  IconAlertTriangle,
} from "@/components/common/Icons";

// Uncontrolled text input that doesn't lose focus on external updates
interface InspectorTextInputProps {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  placeholder?: string;
}

const InspectorTextInput: Component<InspectorTextInputProps> = (props) => {
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
      type="text"
      class={
        props.class ??
        "w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
      }
      placeholder={props.placeholder}
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

// Uncontrolled number input that doesn't lose focus on external updates
interface InspectorNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  class?: string;
  min?: number;
  max?: number;
}

const InspectorNumberInput: Component<InspectorNumberInputProps> = (props) => {
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
        "w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
      }
      min={props.min}
      max={props.max}
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

export const NodeInspector: Component = () => {
  const currentScript = createMemo(() => scriptStore.getCurrentScript());
  const selectedNode = createMemo(() => {
    const script = currentScript();
    const nodeId = scriptStore.selectedNodeId();
    if (!script || !nodeId) return null;
    return script.nodes.find((n) => n.id === nodeId) ?? null;
  });

  const selectedConnection = createMemo(() => {
    const script = currentScript();
    const connId = scriptStore.selectedConnectionId();
    if (!script || !connId) return null;
    return script.connections.find((c) => c.id === connId) ?? null;
  });

  return (
    <div class="w-64 border-l border-border bg-surface flex flex-col">
      <div class="p-3 border-b border-border">
        <h3 class="font-medium text-sm">Inspector</h3>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show
          when={selectedNode() || selectedConnection()}
          fallback={
            <div class="p-4 text-center text-foreground-muted text-sm">
              <p>Select a node or connection</p>
              <p class="text-xs mt-1">to edit its properties</p>
            </div>
          }
        >
          <Show when={selectedNode()}>
            {(node) => <NodeProperties node={node()} />}
          </Show>

          <Show when={selectedConnection() && !selectedNode()}>
            <ConnectionProperties />
          </Show>
        </Show>

        {/* Variables Section */}
        <Show when={currentScript()}>
          <VariablesSection />
        </Show>
      </div>
    </div>
  );
};

// Node Properties Panel
interface NodePropertiesProps {
  node: ScriptNode;
}

const NodeProperties: Component<NodePropertiesProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(true);

  const template = createMemo(() =>
    nodeTemplates.find((t) => t.type === props.node.type),
  );

  return (
    <div class="border-b border-border">
      {/* Header */}
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <Show when={isOpen()} fallback={<ChevronRightIcon class="w-3 h-3" />}>
          <ChevronDownIcon class="w-3 h-3" />
        </Show>
        <span class="text-xs font-medium">Node Properties</span>
      </button>

      <Show when={isOpen()}>
        <div class="px-3 pb-3 space-y-3">
          {/* Node Label */}
          <PropertyRow label="Label">
            <InspectorTextInput
              value={props.node.label}
              onChange={(val) =>
                scriptStore.updateNode(props.node.id, {
                  label: val,
                })
              }
            />
          </PropertyRow>

          {/* Node Type (readonly) */}
          <PropertyRow label="Type">
            <div class="text-xs text-foreground-muted">
              {template()?.label ?? props.node.type}
            </div>
          </PropertyRow>

          {/* Constant Node Configs */}
          <Show when={props.node.type === "const_string"}>
            <PropertyRow label="Value">
              <InspectorTextInput
                placeholder="Enter string value"
                value={(props.node.config.value as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, value: val },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "const_number"}>
            <PropertyRow label="Value">
              <InspectorNumberInput
                value={(props.node.config.value as number) ?? 0}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, value: val },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Float">
              <input
                type="checkbox"
                checked={(props.node.config.isFloat as boolean) ?? false}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      isFloat: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "const_boolean"}>
            <PropertyRow label="Value">
              <button
                class={`w-14 h-6 rounded-full transition-colors relative ${
                  ((props.node.config.value as boolean) ?? false)
                    ? "bg-accent"
                    : "bg-background-secondary"
                }`}
                onClick={() =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      value: !(props.node.config.value as boolean),
                    },
                  })
                }
              >
                <div
                  class={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    ((props.node.config.value as boolean) ?? false)
                      ? "translate-x-8"
                      : "translate-x-1"
                  }`}
                />
                <span
                  class={`absolute inset-0 flex items-center justify-center text-[9px] font-medium ${
                    (props.node.config.value as boolean)
                      ? "text-white pr-5"
                      : "text-foreground-muted pl-5"
                  }`}
                >
                  {(props.node.config.value as boolean) ? "true" : "false"}
                </span>
              </button>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "const_pointer"}>
            <PropertyRow label="Address">
              <InspectorTextInput
                placeholder="0x12345678"
                value={(props.node.config.value as string) ?? "0x0"}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, value: val },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Enter hex address (e.g., 0x7FFF12345678)
            </div>
          </Show>

          {/* Event Node Configs */}
          <Show when={props.node.type === "event_ui"}>
            <EventUIConfig node={props.node} />
          </Show>

          {/* UI Value Nodes */}
          <Show
            when={
              props.node.type === "ui_get_value" ||
              props.node.type === "ui_set_value"
            }
          >
            <UIValueConfig node={props.node} />
          </Show>

          <Show when={props.node.type === "ui_get_props"}>
            <UIPropsConfig node={props.node} />
          </Show>

          <Show when={props.node.type === "event_hotkey"}>
            <PropertyRow label="Hotkey">
              <InspectorTextInput
                placeholder="e.g., Ctrl+F1"
                value={(props.node.config.hotkey as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, hotkey: val },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Format: Ctrl+Shift+F1, Alt+A, etc.
            </div>
          </Show>

          <Show when={props.node.type === "event_interval"}>
            <PropertyRow label="Interval (ms)">
              <InspectorNumberInput
                min={10}
                value={(props.node.config.intervalMs as number) ?? 1000}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, intervalMs: val },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Auto Start">
              <input
                type="checkbox"
                checked={(props.node.config.autoStart as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      autoStart: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          {/* Flow Control config */}
          <Show when={props.node.type === "delay"}>
            <PropertyRow label="Delay (ms)">
              <InspectorNumberInput
                value={(props.node.config.ms as number) ?? 100}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      ms: val,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show
            when={
              props.node.type === "loop" ||
              props.node.type === "for_each" ||
              props.node.type === "for_range"
            }
          >
            <PropertyRow label="Max Iterations">
              <InspectorNumberInput
                value={(props.node.config.maxIterations as number) ?? 1000}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      maxIterations: val,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Safety limit to prevent infinite loops
            </div>
          </Show>

          <Show when={props.node.type === "switch"}>
            <SwitchNodeConfig node={props.node} />
          </Show>

          <Show when={props.node.type === "memory_scan"}>
            <PropertyRow label="Scan Type">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.scanType as string) ?? "value"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      scanType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="value">Exact Value</option>
                <option value="pattern">Pattern</option>
                <option value="range">Range</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Protection">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.protection as string) ?? "rw-"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      protection: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="rw-">Read/Write</option>
                <option value="r--">Read Only</option>
                <option value="rwx">Read/Write/Execute</option>
              </select>
            </PropertyRow>
          </Show>

          <Show
            when={
              props.node.type === "memory_read" ||
              props.node.type === "memory_write" ||
              props.node.type === "memory_freeze"
            }
          >
            <PropertyRow label="Value Type">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.valueType as string) ?? "int32"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      valueType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="int8">Int8</option>
                <option value="uint8">UInt8</option>
                <option value="int16">Int16</option>
                <option value="uint16">UInt16</option>
                <option value="int32">Int32</option>
                <option value="uint32">UInt32</option>
                <option value="int64">Int64</option>
                <option value="uint64">UInt64</option>
                <option value="float">Float</option>
                <option value="double">Double</option>
                <option value="pointer">Pointer</option>
                <option value="string">String</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "memory_freeze"}>
            <PropertyRow label="Interval (ms)">
              <InspectorNumberInput
                value={(props.node.config.intervalMs as number) ?? 100}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      intervalMs: val,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "math"}>
            <PropertyRow label="Operation">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.operation as string) ?? "add"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      operation: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="add">Add (+)</option>
                <option value="subtract">Subtract (-)</option>
                <option value="multiply">Multiply (*)</option>
                <option value="divide">Divide (/)</option>
                <option value="modulo">Modulo (%)</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "compare"}>
            <PropertyRow label="Operation">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.operation as string) ?? "equals"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      operation: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="equals">Equals (==)</option>
                <option value="notEquals">Not Equals (!=)</option>
                <option value="lessThan">Less Than (&lt;)</option>
                <option value="greaterThan">Greater Than (&gt;)</option>
                <option value="lessOrEqual">Less or Equal (&lt;=)</option>
                <option value="greaterOrEqual">Greater or Equal (&gt;=)</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "logic"}>
            <PropertyRow label="Operation">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.operation as string) ?? "and"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      operation: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
                <option value="not">NOT</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "notify"}>
            <PropertyRow label="Level">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.level as string) ?? "info"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      level: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </PropertyRow>
          </Show>

          <Show
            when={
              props.node.type === "set_variable" ||
              props.node.type === "get_variable"
            }
          >
            <VariableSelector node={props.node} />
          </Show>

          <Show when={props.node.type === "declare_variable"}>
            <PropertyRow label="Variable Name">
              <InspectorTextInput
                placeholder="myVariable"
                value={(props.node.config.variableName as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, variableName: val },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Type">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.variableType as string) ?? "any"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      variableType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="any">any</option>
                <option value="int32">int32</option>
                <option value="int64">int64</option>
                <option value="float">float</option>
                <option value="double">double</option>
                <option value="pointer">pointer</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Inline Value">
              <InspectorTextInput
                placeholder="Optional initial value"
                value={(props.node.config.inlineValue as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: { ...props.node.config, inlineValue: val },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Inline value is used if no connection to initialValue input
            </div>
          </Show>

          <Show when={props.node.type === "call_native"}>
            <NativeFunctionConfig node={props.node} />
          </Show>

          <Show when={props.node.type === "interceptor_attach"}>
            <PropertyRow label="On Enter">
              <input
                type="checkbox"
                checked={(props.node.config.onEnter as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      onEnter: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="On Leave">
              <input
                type="checkbox"
                checked={(props.node.config.onLeave as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      onLeave: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          {/* Memory protect */}
          <Show when={props.node.type === "memory_protect"}>
            <PropertyRow label="Protection">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.protection as string) ?? "rwx"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      protection: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="r--">Read Only (r--)</option>
                <option value="rw-">Read/Write (rw-)</option>
                <option value="r-x">Read/Execute (r-x)</option>
                <option value="rwx">Read/Write/Execute (rwx)</option>
              </select>
            </PropertyRow>
          </Show>

          {/* Memory alloc */}
          <Show when={props.node.type === "memory_alloc"}>
            <PropertyRow label="Default Size">
              <InspectorNumberInput
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.size as number) ?? 256}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      size: val,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          {/* Pointer read/write type */}
          <Show when={props.node.type === "pointer_read"}>
            <PropertyRow label="Read As">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.readType as string) ?? "uint32"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      readType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="pointer">Pointer</option>
                <option value="int8">Int8 (S8)</option>
                <option value="uint8">UInt8 (U8)</option>
                <option value="int16">Int16 (S16)</option>
                <option value="uint16">UInt16 (U16)</option>
                <option value="int32">Int32 (S32)</option>
                <option value="uint32">UInt32 (U32)</option>
                <option value="int64">Int64 (S64)</option>
                <option value="uint64">UInt64 (U64)</option>
                <option value="float">Float</option>
                <option value="double">Double</option>
                <option value="utf8">UTF-8 String</option>
                <option value="utf16">UTF-16 String</option>
                <option value="ansi">ANSI String</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "pointer_write"}>
            <PropertyRow label="Write As">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.writeType as string) ?? "uint32"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      writeType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="pointer">Pointer</option>
                <option value="int8">Int8 (S8)</option>
                <option value="uint8">UInt8 (U8)</option>
                <option value="int16">Int16 (S16)</option>
                <option value="uint16">UInt16 (U16)</option>
                <option value="int32">Int32 (S32)</option>
                <option value="uint32">UInt32 (U32)</option>
                <option value="int64">Int64 (S64)</option>
                <option value="uint64">UInt64 (U64)</option>
                <option value="float">Float</option>
                <option value="double">Double</option>
                <option value="utf8">UTF-8 String</option>
                <option value="utf16">UTF-16 String</option>
              </select>
            </PropertyRow>
          </Show>

          {/* String format template */}
          <Show when={props.node.type === "string_format"}>
            <PropertyRow label="Template">
              <InspectorTextInput
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="Value: {0}"
                value={(props.node.config.template as string) ?? "Value: {0}"}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      template: val,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Use {"{"} 0 {"}"}, {"{"} 1 {"}"}, etc. for placeholders
            </div>
          </Show>

          {/* To string format */}
          <Show when={props.node.type === "to_string"}>
            <PropertyRow label="Format">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.format as string) ?? "auto"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      format: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="hex">Hexadecimal</option>
                <option value="decimal">Decimal</option>
              </select>
            </PropertyRow>
          </Show>

          {/* Parse int radix */}
          <Show when={props.node.type === "parse_int"}>
            <PropertyRow label="Radix">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={String((props.node.config.radix as number) ?? 10)}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      radix: Number(e.currentTarget.value),
                    },
                  })
                }
              >
                <option value="10">Decimal (10)</option>
                <option value="16">Hexadecimal (16)</option>
                <option value="8">Octal (8)</option>
                <option value="2">Binary (2)</option>
              </select>
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Strings starting with 0x auto-detect as hex
            </div>
          </Show>

          {/* Object property inline name */}
          <Show when={props.node.type === "object_get"}>
            <PropertyRow label="Property (inline)">
              <InspectorTextInput
                placeholder="Optional: property name"
                value={(props.node.config.propertyName as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      propertyName: val,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Used if no connection to "key" input
            </div>
          </Show>

          {/* Read/Write arg index */}
          <Show
            when={
              props.node.type === "read_arg" || props.node.type === "write_arg"
            }
          >
            <PropertyRow label="Arg Index">
              <InspectorNumberInput
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                min={0}
                max={15}
                value={(props.node.config.index as number) ?? 0}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      index: val,
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show
            when={
              props.node.type === "read_arg" ||
              props.node.type === "read_retval"
            }
          >
            <PropertyRow label="Read As">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.asType as string) ?? "pointer"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      asType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="pointer">Pointer</option>
                <option value="int32">Int32</option>
                <option value="uint32">UInt32</option>
                <option value="int64">Int64</option>
                <option value="uint64">UInt64</option>
              </select>
            </PropertyRow>
          </Show>

          {/* Function Define */}
          <Show when={props.node.type === "function_define"}>
            <PropertyRow label="Function Name">
              <InspectorTextInput
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="myFunction"
                value={(props.node.config.functionName as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      functionName: val,
                    },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Return Type">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.returnType as string) ?? "void"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      returnType: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="void">void</option>
                <option value="any">any</option>
                <option value="int32">int32</option>
                <option value="pointer">pointer</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
              </select>
            </PropertyRow>
          </Show>

          {/* Function Call */}
          <Show when={props.node.type === "function_call"}>
            <PropertyRow label="Function Name">
              <InspectorTextInput
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="Function to call"
                value={(props.node.config.functionName as string) ?? ""}
                onChange={(val) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      functionName: val,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Enter the name of a defined function
            </div>
          </Show>

          {/* Device Select */}
          <Show when={props.node.type === "device_select"}>
            <DeviceSelectConfig node={props.node} />
          </Show>

          {/* Process Enumerate */}
          <Show when={props.node.type === "process_enumerate"}>
            <PropertyRow label="Scope">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.scope as string) ?? "minimal"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      scope: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="minimal">Minimal (faster)</option>
                <option value="full">Full (more details)</option>
              </select>
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Minimal: PID, name only. Full: includes parameters, icons
            </div>
          </Show>

          {/* Application Enumerate */}
          <Show when={props.node.type === "application_enumerate"}>
            <PropertyRow label="Scope">
              <select
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.scope as string) ?? "minimal"}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      scope: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="minimal">Minimal (faster)</option>
                <option value="full">Full (more details)</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Include Running">
              <input
                type="checkbox"
                checked={(props.node.config.includeRunning as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      includeRunning: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Include Installed">
              <input
                type="checkbox"
                checked={(props.node.config.includeInstalled as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      includeInstalled: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              For mobile devices. Returns app identifier, name, PID if running.
            </div>
          </Show>

          {/* Process Attach */}
          <Show when={props.node.type === "process_attach"}>
            <ProcessAttachConfig node={props.node} />
          </Show>

          {/* Process Spawn */}
          <Show when={props.node.type === "process_spawn"}>
            <PropertyRow label="Resume After Spawn">
              <input
                type="checkbox"
                checked={(props.node.config.resumeAfterSpawn as boolean) ?? true}
                onChange={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      resumeAfterSpawn: e.currentTarget.checked,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              If unchecked, app starts paused. Use for early instrumentation.
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// Connection Properties
const ConnectionProperties: Component = () => {
  const connection = createMemo(() => {
    const script = scriptStore.getCurrentScript();
    const connId = scriptStore.selectedConnectionId();
    if (!script || !connId) return null;
    return script.connections.find((c) => c.id === connId) ?? null;
  });

  const handleDelete = () => {
    const conn = connection();
    if (conn) {
      scriptStore.deleteConnection(conn.id);
    }
  };

  return (
    <div class="border-b border-border">
      <div class="px-3 py-2 flex items-center justify-between">
        <span class="text-xs font-medium">Connection</span>
        <button
          class="p-1 hover:bg-error/20 rounded transition-colors"
          onClick={handleDelete}
        >
          <TrashIcon class="w-3 h-3 text-error" />
        </button>
      </div>
      <div class="px-3 pb-3">
        <div class="text-[10px] text-foreground-muted">
          Click to select, then delete to remove
        </div>
      </div>
    </div>
  );
};

// NativeFunction configuration
interface NativeFunctionConfigProps {
  node: ScriptNode;
}

const FRIDA_TYPES = [
  "void",
  "pointer",
  "int",
  "uint",
  "long",
  "ulong",
  "char",
  "uchar",
  "size_t",
  "ssize_t",
  "float",
  "double",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "bool",
];

const FRIDA_ABIS = [
  { value: "default", label: "Default" },
  { value: "sysv", label: "System V (Unix)" },
  { value: "unix64", label: "Unix 64-bit" },
  { value: "win64", label: "Windows 64-bit" },
  { value: "stdcall", label: "stdcall (Win32)" },
  { value: "fastcall", label: "fastcall (Win32)" },
  { value: "thiscall", label: "thiscall (Win32)" },
];

const NativeFunctionConfig: Component<NativeFunctionConfigProps> = (props) => {
  const argCount = () => (props.node.config.argCount as number) ?? 0;
  const argTypes = () => (props.node.config.argTypes as string[]) ?? [];

  const handleArgCountChange = (newCount: number) => {
    const safeCount = Math.max(0, Math.min(16, newCount)); // Limit to 16 args
    scriptStore.updateNativeNodeArgCount(props.node.id, safeCount);
  };

  const handleArgTypeChange = (index: number, newType: string) => {
    const newArgTypes = [...argTypes()];
    newArgTypes[index] = newType;
    scriptStore.updateNode(props.node.id, {
      config: {
        ...props.node.config,
        argTypes: newArgTypes,
      },
    });
  };

  return (
    <>
      <PropertyRow label="Return Type">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={(props.node.config.returnType as string) ?? "void"}
          onChange={(e) =>
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                returnType: e.currentTarget.value,
              },
            })
          }
        >
          <For each={FRIDA_TYPES}>
            {(type) => <option value={type}>{type}</option>}
          </For>
        </select>
      </PropertyRow>

      <PropertyRow label="ABI">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={(props.node.config.abi as string) ?? "default"}
          onChange={(e) =>
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                abi: e.currentTarget.value,
              },
            })
          }
        >
          <For each={FRIDA_ABIS}>
            {(abi) => <option value={abi.value}>{abi.label}</option>}
          </For>
        </select>
      </PropertyRow>

      <PropertyRow label="Arg Count">
        <div class="flex items-center gap-2">
          <button
            class="px-2 py-1 text-xs bg-background border border-border rounded hover:bg-surface-hover"
            onClick={() => handleArgCountChange(argCount() - 1)}
            disabled={argCount() <= 0}
          >
            -
          </button>
          <span class="text-xs w-6 text-center">{argCount()}</span>
          <button
            class="px-2 py-1 text-xs bg-background border border-border rounded hover:bg-surface-hover"
            onClick={() => handleArgCountChange(argCount() + 1)}
            disabled={argCount() >= 16}
          >
            +
          </button>
        </div>
      </PropertyRow>

      {/* Argument types */}
      <Show when={argCount() > 0}>
        <div class="space-y-2 pt-2 border-t border-border/50">
          <div class="text-[10px] text-foreground-muted font-medium">
            Argument Types
          </div>
          <For each={Array.from({ length: argCount() }, (_, i) => i)}>
            {(index) => (
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-foreground-muted w-8">
                  arg{index}
                </span>
                <select
                  class="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                  value={argTypes()[index] ?? "pointer"}
                  onChange={(e) =>
                    handleArgTypeChange(index, e.currentTarget.value)
                  }
                >
                  <For each={FRIDA_TYPES.filter((t) => t !== "void")}>
                    {(type) => <option value={type}>{type}</option>}
                  </For>
                </select>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  );
};

// Event UI Config - Select UI component and event type
interface EventUIConfigProps {
  node: ScriptNode;
}

const EventUIConfig: Component<EventUIConfigProps> = (props) => {
  // Get all UI components from designer store
  const uiComponents = createMemo(() => designerStore.components());

  // Event types based on component type
  const getEventTypesForComponent = (
    componentType: string,
  ): { value: UIEventType; label: string }[] => {
    switch (componentType) {
      case "button":
        return [{ value: "click", label: "Click" }];
      case "toggle":
        return [{ value: "toggle", label: "Toggle (on/off)" }];
      case "slider":
        return [
          { value: "slide", label: "Slide (during drag)" },
          { value: "slide_end", label: "Slide End (released)" },
        ];
      case "input":
      case "dropdown":
        return [{ value: "change", label: "Value Changed" }];
      default:
        return [{ value: "click", label: "Click" }];
    }
  };

  const selectedComponent = createMemo(() => {
    const compId = props.node.config.componentId as string;
    return uiComponents().find((c) => c.id === compId);
  });

  const availableEvents = createMemo(() => {
    const comp = selectedComponent();
    if (!comp) return [{ value: "click" as UIEventType, label: "Click" }];
    return getEventTypesForComponent(comp.type);
  });

  return (
    <>
      <PropertyRow label="Component">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={(props.node.config.componentId as string) ?? ""}
          onChange={(e) => {
            const compId = e.currentTarget.value;
            const comp = uiComponents().find((c) => c.id === compId);
            // Reset event type when component changes
            const events = comp ? getEventTypesForComponent(comp.type) : [];
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                componentId: compId,
                eventType: events[0]?.value ?? "click",
              },
            });
          }}
        >
          <option value="">Select component...</option>
          <For each={uiComponents()}>
            {(comp) => (
              <option value={comp.id}>
                {comp.label} ({comp.type})
              </option>
            )}
          </For>
        </select>
      </PropertyRow>

      <Show when={selectedComponent()}>
        <PropertyRow label="Event">
          <select
            class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
            value={(props.node.config.eventType as string) ?? "click"}
            onChange={(e) =>
              scriptStore.updateNode(props.node.id, {
                config: {
                  ...props.node.config,
                  eventType: e.currentTarget.value,
                },
              })
            }
          >
            <For each={availableEvents()}>
              {(ev) => <option value={ev.value}>{ev.label}</option>}
            </For>
          </select>
        </PropertyRow>

        <div class="text-[9px] text-foreground-muted p-2 bg-background/50 rounded">
          <Show when={(props.node.config.eventType as string) === "toggle"}>
            Output: <code>value</code> = boolean (true/false)
          </Show>
          <Show
            when={
              (props.node.config.eventType as string) === "slide" ||
              (props.node.config.eventType as string) === "slide_end"
            }
          >
            Output: <code>value</code> = number (slider value)
          </Show>
          <Show when={(props.node.config.eventType as string) === "change"}>
            Output: <code>value</code> = string/number (input value)
          </Show>
          <Show when={(props.node.config.eventType as string) === "click"}>
            Output: <code>value</code> = true (always)
          </Show>
        </div>
      </Show>

      <Show when={uiComponents().length === 0}>
        <div class="text-[10px] text-warning p-2 bg-warning/10 rounded">
          No UI components found. Add components in the Designer tab first.
        </div>
      </Show>
    </>
  );
};

// Variable selector for set/get variable nodes
interface VariableSelectorProps {
  node: ScriptNode;
}

const VariableSelector: Component<VariableSelectorProps> = (props) => {
  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  return (
    <PropertyRow label="Variable">
      <select
        class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        value={(props.node.config.variableId as string) ?? ""}
        onChange={(e) =>
          scriptStore.updateNode(props.node.id, {
            config: {
              ...props.node.config,
              variableId: e.currentTarget.value,
            },
          })
        }
      >
        <option value="">Select variable...</option>
        <For each={currentScript()?.variables ?? []}>
          {(v) => <option value={v.id}>{v.name}</option>}
        </For>
      </select>
    </PropertyRow>
  );
};

// Switch node configuration
interface SwitchNodeConfigProps {
  node: ScriptNode;
}

const SwitchNodeConfig: Component<SwitchNodeConfigProps> = (props) => {
  const caseValues = () => (props.node.config.caseValues as string[]) ?? [];

  const handleCaseValueChange = (index: number, value: string) => {
    const newCaseValues = [...caseValues()];
    newCaseValues[index] = value;
    scriptStore.updateNode(props.node.id, {
      config: {
        ...props.node.config,
        caseValues: newCaseValues,
      },
    });
  };

  return (
    <>
      <div class="text-[10px] text-foreground-muted font-medium pt-2">
        Case Values
      </div>
      <div class="space-y-2">
        <For each={caseValues()}>
          {(value, index) => (
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-foreground-muted w-12">
                case{index()}
              </span>
              <InspectorTextInput
                class="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder={`Value for case ${index()}`}
                value={value}
                onChange={(val) => handleCaseValueChange(index(), val)}
              />
            </div>
          )}
        </For>
      </div>
      <div class="text-[9px] text-foreground-muted pt-1">
        Match is checked as string equality. Use "default" output for no match.
      </div>
    </>
  );
};

// Variables Section
const VariablesSection: Component = () => {
  const [isOpen, setIsOpen] = createSignal(true);
  const [newVarName, setNewVarName] = createSignal("");
  const [newVarType, setNewVarType] = createSignal<ValueType>("int32");

  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  const handleAddVariable = () => {
    const name = newVarName().trim();
    if (!name) return;
    scriptStore.addVariable(name, newVarType());
    setNewVarName("");
  };

  return (
    <div class="border-t border-border">
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <Show when={isOpen()} fallback={<ChevronRightIcon class="w-3 h-3" />}>
          <ChevronDownIcon class="w-3 h-3" />
        </Show>
        <span class="text-xs font-medium">Variables</span>
        <span class="text-[10px] text-foreground-muted ml-auto">
          {currentScript()?.variables.length ?? 0}
        </span>
      </button>

      <Show when={isOpen()}>
        <div class="px-3 pb-3 space-y-2">
          {/* Variable list */}
          <For each={currentScript()?.variables ?? []}>
            {(v) => (
              <div class="flex items-center justify-between py-1 px-2 bg-background rounded border border-border/50">
                <div>
                  <div class="text-xs font-medium">{v.name}</div>
                  <div class="text-[10px] text-foreground-muted">{v.type}</div>
                </div>
                <button
                  class="p-1 hover:bg-error/20 rounded transition-colors"
                  onClick={() => scriptStore.deleteVariable(v.id)}
                >
                  <TrashIcon class="w-3 h-3 text-error" />
                </button>
              </div>
            )}
          </For>

          <Show when={(currentScript()?.variables.length ?? 0) === 0}>
            <div class="text-[10px] text-foreground-muted text-center py-2">
              No variables defined
            </div>
          </Show>

          {/* Add variable form */}
          <div class="pt-2 space-y-2">
            <input
              type="text"
              placeholder="Variable name"
              class="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
              value={newVarName()}
              onInput={(e) => setNewVarName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddVariable()}
            />
            <div class="flex gap-2">
              <select
                class="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                value={newVarType()}
                onChange={(e) =>
                  setNewVarType(e.currentTarget.value as ValueType)
                }
              >
                <option value="int32">int32</option>
                <option value="int64">int64</option>
                <option value="float">float</option>
                <option value="double">double</option>
                <option value="pointer">pointer</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
                <option value="any">any</option>
              </select>
              <button
                class="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
                onClick={handleAddVariable}
                disabled={!newVarName().trim()}
              >
                <PlusIcon class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// Property row helper
interface PropertyRowProps {
  label: string;
  children: any;
}

const PropertyRow: Component<PropertyRowProps> = (props) => (
  <div class="space-y-1">
    <label class="text-[10px] text-foreground-muted">{props.label}</label>
    {props.children}
  </div>
);

// ============================================
// UI Value Config - For ui_get_value / ui_set_value nodes
// ============================================
interface UIValueConfigProps {
  node: ScriptNode;
}

const UIValueConfig: Component<UIValueConfigProps> = (props) => {
  // Get all UI components from designer store
  const uiComponents = createMemo(() => designerStore.components());

  // Only show components that have values (not containers/spacers/dividers)
  const valueComponents = createMemo(() =>
    uiComponents().filter((c) =>
      ["toggle", "slider", "input", "dropdown", "button"].includes(c.type),
    ),
  );

  const selectedComponent = createMemo(() => {
    const compId = props.node.config.componentId as string;
    return uiComponents().find((c) => c.id === compId);
  });

  const getValueTypeHint = (componentType: string): string => {
    switch (componentType) {
      case "toggle":
        return "boolean (true/false)";
      case "slider":
        return "number (slider value)";
      case "input":
        return "string (text value)";
      case "dropdown":
        return "string (selected option)";
      case "button":
        return "boolean (always true on click)";
      default:
        return "any";
    }
  };

  return (
    <>
      <PropertyRow label="Component">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={(props.node.config.componentId as string) ?? ""}
          onChange={(e) => {
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                componentId: e.currentTarget.value,
              },
            });
          }}
        >
          <option value="">Select component...</option>
          <For each={valueComponents()}>
            {(comp) => (
              <option value={comp.id}>
                {comp.label} ({comp.type})
              </option>
            )}
          </For>
        </select>
      </PropertyRow>

      <Show when={selectedComponent()}>
        <div class="text-[9px] text-foreground-muted p-2 bg-background/50 rounded">
          <Show when={props.node.type === "ui_get_value"}>
            Reads: <code>value</code> ={" "}
            {getValueTypeHint(selectedComponent()!.type)}
          </Show>
          <Show when={props.node.type === "ui_set_value"}>
            Sets: <code>value</code> input →{" "}
            {getValueTypeHint(selectedComponent()!.type)}
          </Show>
        </div>
      </Show>

      <Show when={!selectedComponent() && props.node.config.componentId}>
        <div class="text-[9px] text-warning p-2 bg-warning/10 rounded flex items-center gap-1">
          <IconAlertTriangle class="w-3 h-3 flex-shrink-0" />
          <span>Component not found (may have been deleted)</span>
        </div>
      </Show>
    </>
  );
};

// ============================================
// UI Props Config - For ui_get_props node
// ============================================
interface UIPropsConfigProps {
  node: ScriptNode;
}

const UIPropsConfig: Component<UIPropsConfigProps> = (props) => {
  // Get all UI components from designer store
  const uiComponents = createMemo(() => designerStore.components());

  const selectedComponent = createMemo(() => {
    const compId = props.node.config.componentId as string;
    return uiComponents().find((c) => c.id === compId);
  });

  // Available props depend on component type
  const getAvailableProps = (
    componentType: string,
  ): { value: string; label: string }[] => {
    const commonProps = [
      { value: "label", label: "Label (string)" },
      { value: "id", label: "ID (string)" },
      { value: "type", label: "Type (string)" },
    ];

    switch (componentType) {
      case "slider":
        return [
          ...commonProps,
          { value: "min", label: "Min Value (number)" },
          { value: "max", label: "Max Value (number)" },
          { value: "step", label: "Step (number)" },
          { value: "defaultValue", label: "Default Value (number)" },
        ];
      case "input":
        return [
          ...commonProps,
          { value: "placeholder", label: "Placeholder (string)" },
          { value: "defaultValue", label: "Default Value (string)" },
        ];
      case "dropdown":
        return [
          ...commonProps,
          { value: "options", label: "Options (array)" },
        ];
      case "toggle":
        return [
          ...commonProps,
          { value: "defaultValue", label: "Default Value (boolean)" },
        ];
      default:
        return commonProps;
    }
  };

  const availableProps = createMemo(() => {
    const comp = selectedComponent();
    if (!comp) return [{ value: "label", label: "Label (string)" }];
    return getAvailableProps(comp.type);
  });

  return (
    <>
      <PropertyRow label="Component">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={(props.node.config.componentId as string) ?? ""}
          onChange={(e) => {
            const compId = e.currentTarget.value;
            const comp = uiComponents().find((c) => c.id === compId);
            const availProps = comp ? getAvailableProps(comp.type) : [];
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                componentId: compId,
                propName: availProps[0]?.value ?? "label",
              },
            });
          }}
        >
          <option value="">Select component...</option>
          <For each={uiComponents()}>
            {(comp) => (
              <option value={comp.id}>
                {comp.label} ({comp.type})
              </option>
            )}
          </For>
        </select>
      </PropertyRow>

      <Show when={selectedComponent()}>
        <PropertyRow label="Property">
          <select
            class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
            value={(props.node.config.propName as string) ?? "label"}
            onChange={(e) =>
              scriptStore.updateNode(props.node.id, {
                config: {
                  ...props.node.config,
                  propName: e.currentTarget.value,
                },
              })
            }
          >
            <For each={availableProps()}>
              {(prop) => <option value={prop.value}>{prop.label}</option>}
            </For>
          </select>
        </PropertyRow>
      </Show>

      <Show when={!selectedComponent() && props.node.config.componentId}>
        <div class="text-[9px] text-warning p-2 bg-warning/10 rounded flex items-center gap-1">
          <IconAlertTriangle class="w-3 h-3 flex-shrink-0" />
          <span>Component not found (may have been deleted)</span>
        </div>
      </Show>
    </>
  );
};

// ============================================
// Device Select Config - For device_select node
// ============================================
interface DeviceSelectConfigProps {
  node: ScriptNode;
}

const DeviceSelectConfig: Component<DeviceSelectConfigProps> = (props) => {
  const selectionMode = () =>
    (props.node.config.selectionMode as string) ?? "type";

  return (
    <>
      <PropertyRow label="Selection Mode">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={selectionMode()}
          onChange={(e) =>
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                selectionMode: e.currentTarget.value,
              },
            })
          }
        >
          <option value="type">By Type (local/usb/remote)</option>
          <option value="id">By Device ID</option>
        </select>
      </PropertyRow>

      <Show when={selectionMode() === "type"}>
        <PropertyRow label="Device Type">
          <select
            class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
            value={(props.node.config.deviceType as string) ?? "local"}
            onChange={(e) =>
              scriptStore.updateNode(props.node.id, {
                config: {
                  ...props.node.config,
                  deviceType: e.currentTarget.value,
                },
              })
            }
          >
            <option value="local">Local (this machine)</option>
            <option value="usb">USB (connected device)</option>
            <option value="remote">Remote (frida-server)</option>
          </select>
        </PropertyRow>
        <div class="text-[9px] text-foreground-muted">
          <strong>Local:</strong> Current machine processes
          <br />
          <strong>USB:</strong> Android/iOS device via USB
          <br />
          <strong>Remote:</strong> Network frida-server
        </div>
      </Show>

      <Show when={selectionMode() === "id"}>
        <div class="text-[9px] text-foreground-muted p-2 bg-background/50 rounded">
          Connect <code>deviceId</code> input from "Enumerate Devices" output or
          provide a constant string.
        </div>
      </Show>
    </>
  );
};

// ============================================
// Process Attach Config - For process_attach node
// ============================================
interface ProcessAttachConfigProps {
  node: ScriptNode;
}

const ProcessAttachConfig: Component<ProcessAttachConfigProps> = (props) => {
  const attachMode = () => (props.node.config.attachMode as string) ?? "pid";

  return (
    <>
      <PropertyRow label="Attach Mode">
        <select
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          value={attachMode()}
          onChange={(e) =>
            scriptStore.updateNode(props.node.id, {
              config: {
                ...props.node.config,
                attachMode: e.currentTarget.value,
              },
            })
          }
        >
          <option value="pid">By PID (number)</option>
          <option value="name">By Process Name</option>
          <option value="identifier">By Bundle Identifier</option>
        </select>
      </PropertyRow>

      <div class="text-[9px] text-foreground-muted p-2 bg-background/50 rounded space-y-1">
        <Show when={attachMode() === "pid"}>
          <p>
            <strong>PID:</strong> Connect a number to <code>target</code> input.
            Get PID from "Enumerate Processes".
          </p>
        </Show>
        <Show when={attachMode() === "name"}>
          <p>
            <strong>Name:</strong> Connect process name string (e.g.,
            "notepad.exe") to <code>target</code>.
          </p>
        </Show>
        <Show when={attachMode() === "identifier"}>
          <p>
            <strong>Identifier:</strong> For mobile apps, use bundle ID (e.g.,
            "com.example.app").
          </p>
        </Show>
        <p class="pt-1 border-t border-border/50">
          Use "Select Device" first to choose the target device.
        </p>
      </div>
    </>
  );
};

export default NodeInspector;
