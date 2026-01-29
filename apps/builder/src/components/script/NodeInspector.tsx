import { Component, For, Show, createMemo, createSignal } from "solid-js";
import {
  scriptStore,
  type ScriptNode,
  type ValueType,
  type ScriptTrigger,
  nodeTemplates,
} from "@/stores/script";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/common/Icons";

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

        {/* Script Settings Section */}
        <Show when={currentScript()}>
          <ScriptSettingsSection />
        </Show>

        {/* Variables Section */}
        <Show when={currentScript()}>
          <VariablesSection />
        </Show>
      </div>
    </div>
  );
};

// Script Settings Section
const ScriptSettingsSection: Component = () => {
  const [isOpen, setIsOpen] = createSignal(true);
  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  const triggerTypes: { value: ScriptTrigger; label: string; description: string }[] = [
    { value: "manual", label: "Manual", description: "Run manually" },
    { value: "on_attach", label: "On Attach", description: "When attached to process" },
    { value: "on_detach", label: "On Detach", description: "When detached" },
    { value: "on_button_click", label: "Button Click", description: "When button is clicked" },
    { value: "on_toggle_change", label: "Toggle Change", description: "When toggle changes" },
    { value: "on_slider_change", label: "Slider Change", description: "When slider changes" },
    { value: "on_hotkey", label: "Hotkey", description: "When hotkey pressed" },
    { value: "on_interval", label: "Interval", description: "Periodic execution" },
  ];

  const handleTriggerChange = (type: ScriptTrigger) => {
    const script = currentScript();
    if (!script) return;
    scriptStore.updateScript(script.id, {
      trigger: { ...script.trigger, type },
    });
  };

  const handleTriggerConfigChange = (key: string, value: string | number) => {
    const script = currentScript();
    if (!script) return;
    scriptStore.updateScript(script.id, {
      trigger: { ...script.trigger, [key]: value },
    });
  };

  return (
    <div class="border-b border-border">
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <Show
          when={isOpen()}
          fallback={<ChevronRightIcon class="w-3 h-3" />}
        >
          <ChevronDownIcon class="w-3 h-3" />
        </Show>
        <span class="text-xs font-medium">Script Trigger</span>
      </button>

      <Show when={isOpen() && currentScript()}>
        <div class="px-3 pb-3 space-y-3">
          <PropertyRow label="Trigger">
            <select
              class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
              value={currentScript()?.trigger.type ?? "manual"}
              onChange={(e) => handleTriggerChange(e.currentTarget.value as ScriptTrigger)}
            >
              <For each={triggerTypes}>
                {(t) => <option value={t.value}>{t.label}</option>}
              </For>
            </select>
          </PropertyRow>
          <div class="text-[9px] text-foreground-muted">
            {triggerTypes.find((t) => t.value === currentScript()?.trigger.type)?.description}
          </div>

          {/* Component ID for UI events */}
          <Show when={["on_button_click", "on_toggle_change", "on_slider_change"].includes(currentScript()?.trigger.type ?? "")}>
            <PropertyRow label="Component ID">
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="UI component ID"
                value={currentScript()?.trigger.componentId ?? ""}
                onInput={(e) => handleTriggerConfigChange("componentId", e.currentTarget.value)}
              />
            </PropertyRow>
          </Show>

          {/* Hotkey for hotkey events */}
          <Show when={currentScript()?.trigger.type === "on_hotkey"}>
            <PropertyRow label="Hotkey">
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="e.g., Ctrl+F1"
                value={currentScript()?.trigger.hotkey ?? ""}
                onInput={(e) => handleTriggerConfigChange("hotkey", e.currentTarget.value)}
              />
            </PropertyRow>
          </Show>

          {/* Interval for interval events */}
          <Show when={currentScript()?.trigger.type === "on_interval"}>
            <PropertyRow label="Interval (ms)">
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                min={10}
                value={currentScript()?.trigger.intervalMs ?? 1000}
                onInput={(e) => handleTriggerConfigChange("intervalMs", Number(e.currentTarget.value))}
              />
            </PropertyRow>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// Node Properties Panel
interface NodePropertiesProps {
  node: ScriptNode;
}

const NodeProperties: Component<NodePropertiesProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(true);

  const template = createMemo(() =>
    nodeTemplates.find((t) => t.type === props.node.type)
  );

  return (
    <div class="border-b border-border">
      {/* Header */}
      <button
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors"
        onClick={() => setIsOpen(!isOpen())}
      >
        <Show
          when={isOpen()}
          fallback={<ChevronRightIcon class="w-3 h-3" />}
        >
          <ChevronDownIcon class="w-3 h-3" />
        </Show>
        <span class="text-xs font-medium">Node Properties</span>
      </button>

      <Show when={isOpen()}>
        <div class="px-3 pb-3 space-y-3">
          {/* Node Label */}
          <PropertyRow label="Label">
            <input
              type="text"
              class="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
              value={props.node.label}
              onInput={(e) =>
                scriptStore.updateNode(props.node.id, {
                  label: e.currentTarget.value,
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

          {/* Node-specific config */}
          <Show when={props.node.type === "delay"}>
            <PropertyRow label="Delay (ms)">
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
                value={(props.node.config.ms as number) ?? 100}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      ms: Number(e.currentTarget.value),
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "loop"}>
            <PropertyRow label="Max Iterations">
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
                value={(props.node.config.maxIterations as number) ?? 1000}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      maxIterations: Number(e.currentTarget.value),
                    },
                  })
                }
              />
            </PropertyRow>
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

          <Show when={props.node.type === "memory_read" || props.node.type === "memory_write" || props.node.type === "memory_freeze"}>
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
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
                value={(props.node.config.intervalMs as number) ?? 100}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      intervalMs: Number(e.currentTarget.value),
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

          <Show when={props.node.type === "set_variable" || props.node.type === "get_variable"}>
            <VariableSelector node={props.node} />
          </Show>

          <Show when={props.node.type === "call_native"}>
            <NativeFunctionConfig node={props.node} />
          </Show>

          <Show when={props.node.type === "hook_function" || props.node.type === "interceptor_attach"}>
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
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                value={(props.node.config.size as number) ?? 256}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      size: Number(e.currentTarget.value),
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
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="Value: {0}"
                value={(props.node.config.template as string) ?? "Value: {0}"}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      template: e.currentTarget.value,
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

          {/* Read/Write arg index */}
          <Show when={props.node.type === "read_arg" || props.node.type === "write_arg"}>
            <PropertyRow label="Arg Index">
              <input
                type="number"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                min={0}
                max={15}
                value={(props.node.config.index as number) ?? 0}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      index: Number(e.currentTarget.value),
                    },
                  })
                }
              />
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "read_arg" || props.node.type === "read_retval"}>
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

          {/* Bind to label - component selector */}
          <Show when={props.node.type === "bind_to_label"}>
            <PropertyRow label="Format">
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="{value}"
                value={(props.node.config.format as string) ?? "{value}"}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      format: e.currentTarget.value,
                    },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Component ID">
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="Label component ID"
                value={(props.node.config.componentId as string) ?? ""}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      componentId: e.currentTarget.value,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Use {"{"}value{"}"} placeholder in format
            </div>
          </Show>

          {/* Function Define */}
          <Show when={props.node.type === "function_define"}>
            <PropertyRow label="Function Name">
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="myFunction"
                value={(props.node.config.functionName as string) ?? ""}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      functionName: e.currentTarget.value,
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
              <input
                type="text"
                class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
                placeholder="Function to call"
                value={(props.node.config.functionName as string) ?? ""}
                onInput={(e) =>
                  scriptStore.updateNode(props.node.id, {
                    config: {
                      ...props.node.config,
                      functionName: e.currentTarget.value,
                    },
                  })
                }
              />
            </PropertyRow>
            <div class="text-[9px] text-foreground-muted">
              Enter the name of a defined function
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
          <div class="text-[10px] text-foreground-muted font-medium">Argument Types</div>
          <For each={Array.from({ length: argCount() }, (_, i) => i)}>
            {(index) => (
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-foreground-muted w-8">arg{index}</span>
                <select
                  class="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                  value={argTypes()[index] ?? "pointer"}
                  onChange={(e) => handleArgTypeChange(index, e.currentTarget.value)}
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
        <Show
          when={isOpen()}
          fallback={<ChevronRightIcon class="w-3 h-3" />}
        >
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
                onChange={(e) => setNewVarType(e.currentTarget.value as ValueType)}
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

export default NodeInspector;
