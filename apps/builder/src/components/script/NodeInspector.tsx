import { Component, For, Show, createMemo, createSignal } from "solid-js";
import {
  scriptStore,
  type ScriptNode,
  type ValueType,
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
                <option value="int">int</option>
                <option value="uint">uint</option>
                <option value="int64">int64</option>
                <option value="uint64">uint64</option>
                <option value="float">float</option>
                <option value="double">double</option>
                <option value="pointer">pointer</option>
              </select>
            </PropertyRow>
          </Show>

          <Show when={props.node.type === "hook_function"}>
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
