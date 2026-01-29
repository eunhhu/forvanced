import { createSignal, createRoot } from "solid-js";

// ============================================
// Visual Scripting System Types
// ============================================

// Node Types - What kind of operation
export type ScriptNodeType =
  // Flow Control
  | "start"           // Entry point
  | "end"             // Exit point
  | "if"              // Conditional branch
  | "loop"            // Loop (while/for)
  | "delay"           // Wait for ms
  // Memory Operations
  | "memory_scan"     // Scan for value pattern
  | "memory_read"     // Read from address
  | "memory_write"    // Write to address
  | "memory_freeze"   // Freeze value at address
  // Module/Symbol
  | "get_module"      // Get module by name
  | "find_symbol"     // Find symbol/export in module
  | "get_base_address" // Get module base address
  // Variables
  | "set_variable"    // Store value in variable
  | "get_variable"    // Retrieve value from variable
  // Math/Logic
  | "math"            // Math operations (+, -, *, /, %)
  | "compare"         // Comparison (==, !=, <, >, <=, >=)
  | "logic"           // Logic operations (and, or, not)
  // Native
  | "call_native"     // Call native function
  // Hook
  | "hook_function"   // Hook a function
  | "hook_callback"   // Define hook callback behavior
  // Output
  | "log"             // Log to console
  | "notify"          // Show notification

// Value Types
export type ValueType =
  | "int8" | "uint8"
  | "int16" | "uint16"
  | "int32" | "uint32"
  | "int64" | "uint64"
  | "float" | "double"
  | "pointer" | "string"
  | "boolean" | "any";

// Port Types (for connections)
export type PortType = "flow" | "value";

// Port Definition
export interface Port {
  id: string;
  name: string;
  type: PortType;
  valueType?: ValueType;  // For value ports
  direction: "input" | "output";
}

// Connection between nodes
export interface Connection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

// Node Configuration (varies by node type)
export interface NodeConfig {
  [key: string]: unknown;
}

// Script Node
export interface ScriptNode {
  id: string;
  type: ScriptNodeType;
  label: string;
  x: number;
  y: number;
  config: NodeConfig;
  inputs: Port[];
  outputs: Port[];
}

// Variable Definition
export interface ScriptVariable {
  id: string;
  name: string;
  type: ValueType;
  defaultValue?: unknown;
  description?: string;
}

// Complete Script
export interface Script {
  id: string;
  name: string;
  description?: string;
  variables: ScriptVariable[];
  nodes: ScriptNode[];
  connections: Connection[];
}

// ============================================
// Node Templates - Define available nodes
// ============================================

interface NodeTemplate {
  type: ScriptNodeType;
  label: string;
  category: string;
  description: string;
  defaultConfig: NodeConfig;
  inputs: Omit<Port, "id">[];
  outputs: Omit<Port, "id">[];
}

export const nodeTemplates: NodeTemplate[] = [
  // Flow Control
  {
    type: "start",
    label: "Start",
    category: "Flow",
    description: "Script entry point",
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "end",
    label: "End",
    category: "Flow",
    description: "Script exit point",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [],
  },
  {
    type: "if",
    label: "If",
    category: "Flow",
    description: "Conditional branch",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "condition", type: "value", valueType: "boolean", direction: "input" },
    ],
    outputs: [
      { name: "true", type: "flow", direction: "output" },
      { name: "false", type: "flow", direction: "output" },
    ],
  },
  {
    type: "loop",
    label: "Loop",
    category: "Flow",
    description: "Repeat execution while condition is true",
    defaultConfig: { maxIterations: 1000 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "condition", type: "value", valueType: "boolean", direction: "input" },
    ],
    outputs: [
      { name: "body", type: "flow", direction: "output" },
      { name: "done", type: "flow", direction: "output" },
      { name: "index", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "delay",
    label: "Delay",
    category: "Flow",
    description: "Wait for specified milliseconds",
    defaultConfig: { ms: 100 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "ms", type: "value", valueType: "int32", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },

  // Memory Operations
  {
    type: "memory_scan",
    label: "Memory Scan",
    category: "Memory",
    description: "Scan memory for value/pattern",
    defaultConfig: { scanType: "value", protection: "rw-" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
      { name: "type", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "results", type: "value", valueType: "pointer", direction: "output" },
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "memory_read",
    label: "Read Memory",
    category: "Memory",
    description: "Read value from memory address",
    defaultConfig: { valueType: "int32" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "memory_write",
    label: "Write Memory",
    category: "Memory",
    description: "Write value to memory address",
    defaultConfig: { valueType: "int32" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "memory_freeze",
    label: "Freeze Memory",
    category: "Memory",
    description: "Continuously write value to freeze it",
    defaultConfig: { valueType: "int32", intervalMs: 100 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
      { name: "enabled", type: "value", valueType: "boolean", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },

  // Module/Symbol
  {
    type: "get_module",
    label: "Get Module",
    category: "Module",
    description: "Get module info by name",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "name", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "module", type: "value", valueType: "pointer", direction: "output" },
      { name: "base", type: "value", valueType: "pointer", direction: "output" },
      { name: "size", type: "value", valueType: "uint64", direction: "output" },
    ],
  },
  {
    type: "find_symbol",
    label: "Find Symbol",
    category: "Module",
    description: "Find exported symbol in module",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "module", type: "value", valueType: "string", direction: "input" },
      { name: "symbol", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "address", type: "value", valueType: "pointer", direction: "output" },
    ],
  },
  {
    type: "get_base_address",
    label: "Get Base Address",
    category: "Module",
    description: "Get module base address",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "moduleName", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "address", type: "value", valueType: "pointer", direction: "output" },
    ],
  },

  // Variables
  {
    type: "set_variable",
    label: "Set Variable",
    category: "Variable",
    description: "Store a value in a variable",
    defaultConfig: { variableId: "" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "get_variable",
    label: "Get Variable",
    category: "Variable",
    description: "Retrieve a value from a variable",
    defaultConfig: { variableId: "" },
    inputs: [],
    outputs: [{ name: "value", type: "value", valueType: "any", direction: "output" }],
  },

  // Math
  {
    type: "math",
    label: "Math",
    category: "Math",
    description: "Perform math operation",
    defaultConfig: { operation: "add" },
    inputs: [
      { name: "a", type: "value", valueType: "any", direction: "input" },
      { name: "b", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "result", type: "value", valueType: "any", direction: "output" }],
  },
  {
    type: "compare",
    label: "Compare",
    category: "Math",
    description: "Compare two values",
    defaultConfig: { operation: "equals" },
    inputs: [
      { name: "a", type: "value", valueType: "any", direction: "input" },
      { name: "b", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "result", type: "value", valueType: "boolean", direction: "output" }],
  },
  {
    type: "logic",
    label: "Logic",
    category: "Math",
    description: "Logic operation (and, or, not)",
    defaultConfig: { operation: "and" },
    inputs: [
      { name: "a", type: "value", valueType: "boolean", direction: "input" },
      { name: "b", type: "value", valueType: "boolean", direction: "input" },
    ],
    outputs: [{ name: "result", type: "value", valueType: "boolean", direction: "output" }],
  },

  // Native
  {
    type: "call_native",
    label: "Call Native",
    category: "Native",
    description: "Call a native function",
    defaultConfig: { returnType: "void", argTypes: [] },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
      { name: "arg0", type: "value", valueType: "any", direction: "input" },
      { name: "arg1", type: "value", valueType: "any", direction: "input" },
      { name: "arg2", type: "value", valueType: "any", direction: "input" },
      { name: "arg3", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "return", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // Hook
  {
    type: "hook_function",
    label: "Hook Function",
    category: "Hook",
    description: "Hook a function at address",
    defaultConfig: { onEnter: true, onLeave: true },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "onEnter", type: "flow", direction: "output" },
      { name: "onLeave", type: "flow", direction: "output" },
      { name: "args", type: "value", valueType: "pointer", direction: "output" },
      { name: "retval", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // Output
  {
    type: "log",
    label: "Log",
    category: "Output",
    description: "Log message to console",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "message", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "notify",
    label: "Notify",
    category: "Output",
    description: "Show notification to user",
    defaultConfig: { level: "info" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "title", type: "value", valueType: "string", direction: "input" },
      { name: "message", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
];

// ============================================
// Script Store
// ============================================

function createScriptStore() {
  const [scripts, setScripts] = createSignal<Script[]>([]);
  const [currentScriptId, setCurrentScriptId] = createSignal<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = createSignal<string | null>(null);

  // Get current script
  function getCurrentScript(): Script | null {
    const id = currentScriptId();
    if (!id) return null;
    return scripts().find((s) => s.id === id) ?? null;
  }

  // Create new script
  function createScript(name: string): Script {
    const script: Script = {
      id: crypto.randomUUID(),
      name,
      variables: [],
      nodes: [
        // Add start node by default
        createNode("start", 100, 200),
      ],
      connections: [],
    };
    setScripts((prev) => [...prev, script]);
    setCurrentScriptId(script.id);
    return script;
  }

  // Delete script
  function deleteScript(id: string) {
    setScripts((prev) => prev.filter((s) => s.id !== id));
    if (currentScriptId() === id) {
      setCurrentScriptId(null);
    }
  }

  // Create node from template
  function createNode(type: ScriptNodeType, x: number, y: number): ScriptNode {
    const template = nodeTemplates.find((t) => t.type === type);
    if (!template) throw new Error(`Unknown node type: ${type}`);

    return {
      id: crypto.randomUUID(),
      type,
      label: template.label,
      x,
      y,
      config: { ...template.defaultConfig },
      inputs: template.inputs.map((p) => ({ ...p, id: crypto.randomUUID() })),
      outputs: template.outputs.map((p) => ({ ...p, id: crypto.randomUUID() })),
    };
  }

  // Add node to current script
  function addNode(type: ScriptNodeType, x: number, y: number): ScriptNode | null {
    const script = getCurrentScript();
    if (!script) return null;

    const node = createNode(type, x, y);
    updateScript(script.id, {
      nodes: [...script.nodes, node],
    });
    setSelectedNodeId(node.id);
    return node;
  }

  // Update node
  function updateNode(nodeId: string, updates: Partial<ScriptNode>) {
    const script = getCurrentScript();
    if (!script) return;

    updateScript(script.id, {
      nodes: script.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    });
  }

  // Delete node
  function deleteNode(nodeId: string) {
    const script = getCurrentScript();
    if (!script) return;

    // Also delete connections to/from this node
    const newConnections = script.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
    );

    updateScript(script.id, {
      nodes: script.nodes.filter((n) => n.id !== nodeId),
      connections: newConnections,
    });

    if (selectedNodeId() === nodeId) {
      setSelectedNodeId(null);
    }
  }

  // Add connection
  function addConnection(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string
  ): Connection | null {
    const script = getCurrentScript();
    if (!script) return null;

    // Validate connection
    const fromNode = script.nodes.find((n) => n.id === fromNodeId);
    const toNode = script.nodes.find((n) => n.id === toNodeId);
    if (!fromNode || !toNode) return null;

    const fromPort = fromNode.outputs.find((p) => p.id === fromPortId);
    const toPort = toNode.inputs.find((p) => p.id === toPortId);
    if (!fromPort || !toPort) return null;

    // Check port types match
    if (fromPort.type !== toPort.type) return null;

    // Check if connection already exists
    const exists = script.connections.some(
      (c) =>
        c.fromNodeId === fromNodeId &&
        c.fromPortId === fromPortId &&
        c.toNodeId === toNodeId &&
        c.toPortId === toPortId
    );
    if (exists) return null;

    // For flow ports, remove existing connection to input (only one allowed)
    let newConnections = [...script.connections];
    if (toPort.type === "flow") {
      newConnections = newConnections.filter(
        (c) => !(c.toNodeId === toNodeId && c.toPortId === toPortId)
      );
    }

    const connection: Connection = {
      id: crypto.randomUUID(),
      fromNodeId,
      fromPortId,
      toNodeId,
      toPortId,
    };

    updateScript(script.id, {
      connections: [...newConnections, connection],
    });

    return connection;
  }

  // Delete connection
  function deleteConnection(connectionId: string) {
    const script = getCurrentScript();
    if (!script) return;

    updateScript(script.id, {
      connections: script.connections.filter((c) => c.id !== connectionId),
    });

    if (selectedConnectionId() === connectionId) {
      setSelectedConnectionId(null);
    }
  }

  // Add variable
  function addVariable(name: string, type: ValueType): ScriptVariable | null {
    const script = getCurrentScript();
    if (!script) return null;

    const variable: ScriptVariable = {
      id: crypto.randomUUID(),
      name,
      type,
    };

    updateScript(script.id, {
      variables: [...script.variables, variable],
    });

    return variable;
  }

  // Delete variable
  function deleteVariable(variableId: string) {
    const script = getCurrentScript();
    if (!script) return;

    updateScript(script.id, {
      variables: script.variables.filter((v) => v.id !== variableId),
    });
  }

  // Update script
  function updateScript(scriptId: string, updates: Partial<Script>) {
    setScripts((prev) =>
      prev.map((s) => (s.id === scriptId ? { ...s, ...updates } : s))
    );
  }

  // Get node categories for palette
  function getNodeCategories(): { category: string; nodes: NodeTemplate[] }[] {
    const categories = new Map<string, NodeTemplate[]>();
    for (const template of nodeTemplates) {
      if (!categories.has(template.category)) {
        categories.set(template.category, []);
      }
      categories.get(template.category)!.push(template);
    }
    return Array.from(categories.entries()).map(([category, nodes]) => ({
      category,
      nodes,
    }));
  }

  return {
    scripts,
    currentScriptId,
    selectedNodeId,
    selectedConnectionId,
    setCurrentScriptId,
    setSelectedNodeId,
    setSelectedConnectionId,
    getCurrentScript,
    createScript,
    deleteScript,
    addNode,
    updateNode,
    deleteNode,
    addConnection,
    deleteConnection,
    addVariable,
    deleteVariable,
    updateScript,
    getNodeCategories,
    nodeTemplates,
  };
}

export const scriptStore = createRoot(createScriptStore);
