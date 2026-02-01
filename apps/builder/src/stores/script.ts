import { createSignal, createRoot } from "solid-js";

// ============================================
// Visual Scripting System Types
// ============================================

// UI Event Types - Events emitted by UI components
export type UIEventType =
  | "click" // Button click
  | "toggle" // Toggle on/off (boolean value)
  | "change" // Input/dropdown value change (any value)
  | "slide" // Slider value change (number value)
  | "slide_end"; // Slider released (number value)

// System Event Types - Events from the runtime
export type SystemEventType =
  | "attach" // When attached to process
  | "detach" // When detached from process
  | "hotkey" // When hotkey is pressed
  | "interval"; // Periodic timer tick

// Combined Event Type
export type EventType = UIEventType | SystemEventType;

// Script metadata (no more trigger config - events are defined by nodes)
export interface ScriptMetadata {
  description?: string;
}

// Node Types - What kind of operation
export type ScriptNodeType =
  // Event Listeners (Entry Points - replaces start/end)
  | "event_ui" // Listen to UI component events (click, toggle, change, slide)
  | "event_attach" // When attached to process
  | "event_detach" // When detached from process
  | "event_hotkey" // When hotkey is pressed
  | "event_interval" // Periodic execution (timer)
  | "event_hook" // When a native/Java hook is triggered
  | "event_memory_watch" // When watched memory is accessed
  // Constants (Literal Values)
  | "const_string" // String literal input
  | "const_number" // Number literal input
  | "const_boolean" // Boolean literal input
  | "const_pointer" // Pointer/Address literal (hex string)
  // Flow Control
  | "if" // Conditional branch
  | "switch" // Multi-way branch (switch/case)
  | "for_each" // Iterate over array
  | "for_range" // Loop from start to end
  | "loop" // Loop (while/for)
  | "delay" // Wait for ms
  | "break" // Break from loop
  | "continue" // Continue to next iteration
  // Memory Operations
  | "memory_scan" // Scan for value pattern
  | "memory_read" // Read from address
  | "memory_write" // Write to address
  | "memory_freeze" // Freeze value at address
  | "memory_alloc" // Allocate memory
  | "memory_protect" // Change memory protection
  | "memory_watch" // Watch memory for access (triggers event_memory_watch)
  | "memory_unwatch" // Remove memory watch
  // Pointer Operations
  | "pointer_add" // Add offset to pointer
  | "pointer_read" // Read from pointer (with type)
  | "pointer_write" // Write to pointer (with type)
  // Module/Symbol
  | "get_module" // Get module by name
  | "find_symbol" // Find symbol/export in module
  | "get_base_address" // Get module base address
  | "enumerate_exports" // List all exports of a module
  | "enumerate_modules" // List all loaded modules
  // Variables
  | "set_variable" // Store value in variable
  | "get_variable" // Retrieve value from variable
  | "declare_variable" // Declare and initialize a variable
  // Array Operations
  | "array_create" // Create an array
  | "array_get" // Get element at index
  | "array_set" // Set element at index
  | "array_push" // Add element to end
  | "array_length" // Get array length
  | "array_find" // Find element in array
  // Object Operations
  | "object_get" // Get property from object
  | "object_set" // Set property on object
  | "object_keys" // Get all keys of object
  // Math/Logic
  | "math" // Math operations (+, -, *, /, %)
  | "compare" // Comparison (==, !=, <, >, <=, >=)
  | "logic" // Logic operations (and, or, not)
  // String Operations
  | "string_format" // Format string with values
  | "string_concat" // Concatenate strings
  | "to_string" // Convert value to string
  | "parse_int" // Parse string to integer
  | "parse_float" // Parse string to float
  // Type Conversion
  | "to_pointer" // Convert number/string to pointer (ptr())
  // Native
  | "call_native" // Call native function with NativeFunction
  | "native_callback" // Create NativeCallback for hooks
  // Interceptor
  | "interceptor_attach" // Attach to function (onEnter/onLeave)
  | "interceptor_replace" // Replace function implementation
  | "interceptor_detach" // Detach from function
  | "read_arg" // Read argument in hook context
  | "write_arg" // Modify argument in hook context
  | "read_retval" // Read return value in hook context
  | "replace_retval" // Replace return value in hook context
  // Output
  | "log" // Log to console
  | "notify" // Show notification
  // Device Management (Frida Device Manager)
  | "device_enumerate" // List available devices (local, usb, remote)
  | "device_select" // Select a device by id or type
  | "device_get_current" // Get currently selected device info
  // Process/Application Enumeration
  | "process_enumerate" // List running processes on selected device
  | "application_enumerate" // List installed applications on device (mobile)
  // Process Control
  | "process_attach" // Attach to process (PID, name, or identifier)
  | "process_detach" // Detach from current process
  | "process_spawn" // Spawn and attach to application
  | "process_is_attached" // Check if attached
  // Functions (reusable code blocks)
  | "function_define" // Define a reusable function
  | "function_call" // Call a defined function
  | "function_return" // Return from function
  // UI Value Operations (for UI-Script binding)
  | "ui_get_value" // Read current UI component value
  | "ui_set_value" // Set UI component value programmatically
  | "ui_get_props"; // Read UI component properties (label, min, max, etc.)

// Value Types
export type ValueType =
  | "int8"
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "int64"
  | "uint64"
  | "float"
  | "double"
  | "pointer"
  | "string"
  | "boolean"
  | "any";

// Node Execution Context
// - host: Executes in Rust backend (UI operations, flow control, variables)
// - target: Executes via Frida RPC in target process (memory, hooks, native calls)
export type NodeContext = "host" | "target";

// Port Types (for connections)
export type PortType = "flow" | "value";

// Port Definition
export interface Port {
  id: string;
  name: string;
  type: PortType;
  valueType?: ValueType; // For value ports
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
  // No more trigger config - events are defined by Event Listener nodes
  // Multiple event listeners can exist in one script (parallel processing)
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

// Get the execution context for a node type
// Host nodes execute in Rust backend, Target nodes execute via Frida RPC
export function getNodeContext(nodeType: ScriptNodeType): NodeContext {
  // Target nodes - require Frida session and execute in target process
  const targetNodes: ScriptNodeType[] = [
    // Memory operations
    "memory_scan",
    "memory_read",
    "memory_write",
    "memory_freeze",
    "memory_alloc",
    "memory_protect",
    "memory_watch",
    "memory_unwatch",
    // Pointer operations (executed in target for memory access)
    "pointer_add",
    "pointer_read",
    "pointer_write",
    // Module operations
    "get_module",
    "find_symbol",
    "get_base_address",
    "enumerate_modules",
    "enumerate_exports",
    // Native function calls
    "call_native",
    "native_callback",
    // Interceptor hooks
    "interceptor_attach",
    "interceptor_replace",
    "interceptor_detach",
    "read_arg",
    "write_arg",
    "read_retval",
    "replace_retval",
  ];

  return targetNodes.includes(nodeType) ? "target" : "host";
}

// Check if a node type is a target node (requires Frida session)
export function isTargetNode(nodeType: ScriptNodeType): boolean {
  return getNodeContext(nodeType) === "target";
}

// Check if a node type is a host node (executes locally)
export function isHostNode(nodeType: ScriptNodeType): boolean {
  return getNodeContext(nodeType) === "host";
}

export const nodeTemplates: NodeTemplate[] = [
  // ============================================
  // Constants (Literal Values) - Entry points for data
  // ============================================
  {
    type: "const_string",
    label: "String",
    category: "Constants",
    description: "A constant string value",
    defaultConfig: { value: "" },
    inputs: [],
    outputs: [
      {
        name: "value",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "const_number",
    label: "Number",
    category: "Constants",
    description: "A constant number value",
    defaultConfig: { value: 0, isFloat: false },
    inputs: [],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "const_boolean",
    label: "Boolean",
    category: "Constants",
    description: "A constant boolean value (true/false)",
    defaultConfig: { value: true },
    inputs: [],
    outputs: [
      {
        name: "value",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },
  {
    type: "const_pointer",
    label: "Address",
    category: "Constants",
    description: "A constant memory address (hex string like 0x12345678)",
    defaultConfig: { value: "0x0" },
    inputs: [],
    outputs: [
      {
        name: "value",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
    ],
  },

  // ============================================
  // Event Listeners (Entry Points)
  // ============================================
  {
    type: "event_ui",
    label: "UI Event",
    category: "Events",
    description: "Triggered when a UI component fires an event",
    defaultConfig: {
      componentId: "", // Selected from dropdown
      eventType: "click", // click, toggle, change, slide
    },
    inputs: [],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "value", type: "value", valueType: "any", direction: "output" }, // Event value (boolean for toggle, number for slider, string for input)
      {
        name: "componentId",
        type: "value",
        valueType: "string",
        direction: "output",
      }, // The component ID for reference
    ],
  },
  {
    type: "event_attach",
    label: "On Attach",
    category: "Events",
    description: "Triggered when attached to a process",
    defaultConfig: {},
    inputs: [],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "processName",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      { name: "pid", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "event_detach",
    label: "On Detach",
    category: "Events",
    description: "Triggered when detached from a process",
    defaultConfig: {},
    inputs: [],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "event_hotkey",
    label: "On Hotkey",
    category: "Events",
    description: "Triggered when a hotkey is pressed",
    defaultConfig: {
      hotkey: "", // e.g., "Ctrl+F1"
    },
    inputs: [],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "event_interval",
    label: "On Interval",
    category: "Events",
    description: "Triggered periodically at a set interval",
    defaultConfig: {
      intervalMs: 1000, // Default 1 second
      autoStart: true, // Start automatically on attach
    },
    inputs: [],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "tick", type: "value", valueType: "int32", direction: "output" }, // Tick count
    ],
  },
  {
    type: "event_hook",
    label: "On Hook",
    category: "Events",
    description: "Triggered when a native or Java function hook fires",
    defaultConfig: {
      hookId: "", // Hook identifier
      phase: "enter", // "enter" or "leave"
    },
    inputs: [],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "hookId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      { name: "args", type: "value", valueType: "any", direction: "output" }, // Array of arguments (enter only)
      { name: "retval", type: "value", valueType: "any", direction: "output" }, // Return value (leave only)
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
      {
        name: "threadId",
        type: "value",
        valueType: "int32",
        direction: "output",
      },
    ],
  },
  {
    type: "event_memory_watch",
    label: "On Memory Access",
    category: "Events",
    description: "Triggered when watched memory is read/written/executed",
    defaultConfig: {
      watchId: "", // Watch identifier
    },
    inputs: [],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "watchId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
      {
        name: "operation",
        type: "value",
        valueType: "string",
        direction: "output",
      }, // "read", "write", "execute"
      {
        name: "from",
        type: "value",
        valueType: "pointer",
        direction: "output",
      }, // Instruction that accessed
      {
        name: "threadId",
        type: "value",
        valueType: "int32",
        direction: "output",
      },
    ],
  },
  // ============================================
  // Flow Control
  // ============================================
  {
    type: "if",
    label: "If",
    category: "Flow",
    description: "Conditional branch",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "condition",
        type: "value",
        valueType: "boolean",
        direction: "input",
      },
    ],
    outputs: [
      { name: "true", type: "flow", direction: "output" },
      { name: "false", type: "flow", direction: "output" },
    ],
  },
  {
    type: "switch",
    label: "Switch",
    category: "Flow",
    description: "Multi-way branch based on value (like switch/case)",
    defaultConfig: { caseCount: 3, caseValues: ["case1", "case2", "case3"] },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "case0", type: "flow", direction: "output" },
      { name: "case1", type: "flow", direction: "output" },
      { name: "case2", type: "flow", direction: "output" },
      { name: "default", type: "flow", direction: "output" },
    ],
  },
  {
    type: "for_each",
    label: "For Each",
    category: "Flow",
    description: "Iterate over each element in an array",
    defaultConfig: { maxIterations: 10000 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "array", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "body", type: "flow", direction: "output" },
      { name: "done", type: "flow", direction: "output" },
      { name: "element", type: "value", valueType: "any", direction: "output" },
      { name: "index", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "for_range",
    label: "For Range",
    category: "Flow",
    description: "Loop from start to end (exclusive)",
    defaultConfig: { maxIterations: 10000 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "start", type: "value", valueType: "int32", direction: "input" },
      { name: "end", type: "value", valueType: "int32", direction: "input" },
      { name: "step", type: "value", valueType: "int32", direction: "input" },
    ],
    outputs: [
      { name: "body", type: "flow", direction: "output" },
      { name: "done", type: "flow", direction: "output" },
      { name: "index", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "loop",
    label: "While Loop",
    category: "Flow",
    description: "Repeat execution while condition is true",
    defaultConfig: { maxIterations: 1000 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "condition",
        type: "value",
        valueType: "boolean",
        direction: "input",
      },
    ],
    outputs: [
      { name: "body", type: "flow", direction: "output" },
      { name: "done", type: "flow", direction: "output" },
      { name: "index", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "break",
    label: "Break",
    category: "Flow",
    description: "Break out of the current loop",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [],
  },
  {
    type: "continue",
    label: "Continue",
    category: "Flow",
    description: "Skip to next iteration of the loop",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [],
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
    defaultConfig: { scanType: "value", protection: "rw-", valueType: "int32" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "int32", direction: "input" }, // Dynamic based on config
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "results",
        type: "value",
        valueType: "pointer",
        direction: "output",
      }, // Array of pointers
      {
        name: "count",
        type: "value",
        valueType: "uint32",
        direction: "output",
      },
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
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "value", type: "value", valueType: "int32", direction: "output" }, // Dynamic based on config
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
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "value", type: "value", valueType: "int32", direction: "input" }, // Dynamic based on config
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
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "value", type: "value", valueType: "any", direction: "input" },
      {
        name: "enabled",
        type: "value",
        valueType: "boolean",
        direction: "input",
      },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "memory_alloc",
    label: "Allocate Memory",
    category: "Memory",
    description: "Allocate memory with Memory.alloc()",
    defaultConfig: { size: 256 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "size", type: "value", valueType: "uint32", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
    ],
  },
  {
    type: "memory_protect",
    label: "Protect Memory",
    category: "Memory",
    description: "Change memory protection with Memory.protect()",
    defaultConfig: { protection: "rwx" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "size", type: "value", valueType: "uint32", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "success",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },
  {
    type: "memory_watch",
    label: "Watch Memory",
    category: "Memory",
    description: "Watch memory region for read/write/execute access",
    defaultConfig: { read: true, write: true, execute: false },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "size", type: "value", valueType: "uint32", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "watchId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "memory_unwatch",
    label: "Unwatch Memory",
    category: "Memory",
    description: "Remove memory watch by ID",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "watchId",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "success",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },

  // Pointer Operations
  {
    type: "pointer_add",
    label: "Pointer Add",
    category: "Pointer",
    description: "Add offset to pointer address",
    defaultConfig: {},
    inputs: [
      {
        name: "pointer",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "offset", type: "value", valueType: "int64", direction: "input" },
    ],
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
    ],
  },
  {
    type: "pointer_read",
    label: "Pointer Read",
    category: "Pointer",
    description: "Read value at pointer (readU32, readPointer, etc.)",
    defaultConfig: { readType: "uint32" },
    inputs: [
      {
        name: "pointer",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
    ],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "pointer_write",
    label: "Pointer Write",
    category: "Pointer",
    description: "Write value at pointer (writeU32, writePointer, etc.)",
    defaultConfig: { writeType: "uint32" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "pointer",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      { name: "value", type: "value", valueType: "any", direction: "input" },
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
      {
        name: "module",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
      {
        name: "base",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
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
      {
        name: "module",
        type: "value",
        valueType: "string",
        direction: "input",
      },
      {
        name: "symbol",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
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
      {
        name: "moduleName",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
    ],
  },
  {
    type: "enumerate_modules",
    label: "Enumerate Modules",
    category: "Module",
    description: "List all loaded modules with Process.enumerateModules()",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "modules", type: "value", valueType: "any", direction: "output" },
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "enumerate_exports",
    label: "Enumerate Exports",
    category: "Module",
    description: "List all exports of a module",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "moduleName",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "exports", type: "value", valueType: "any", direction: "output" },
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },

  // ============================================
  // Variables
  // ============================================
  {
    type: "declare_variable",
    label: "Declare Variable",
    category: "Variable",
    description: "Declare a new variable with initial value",
    defaultConfig: {
      variableName: "myVar",
      variableType: "any" as ValueType,
      inlineValue: "", // For simple initial values
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "initialValue",
        type: "value",
        valueType: "any",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
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
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "value", type: "value", valueType: "any", direction: "output" }, // Pass through for chaining
    ],
  },
  {
    type: "get_variable",
    label: "Get Variable",
    category: "Variable",
    description: "Retrieve a value from a variable",
    defaultConfig: { variableId: "" },
    inputs: [],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // ============================================
  // Array Operations
  // ============================================
  {
    type: "array_create",
    label: "Create Array",
    category: "Array",
    description: "Create an empty array or from elements",
    defaultConfig: { elementCount: 0 },
    inputs: [
      { name: "elem0", type: "value", valueType: "any", direction: "input" },
      { name: "elem1", type: "value", valueType: "any", direction: "input" },
      { name: "elem2", type: "value", valueType: "any", direction: "input" },
      { name: "elem3", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "array", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "array_get",
    label: "Array Get",
    category: "Array",
    description: "Get element at index from array",
    defaultConfig: {},
    inputs: [
      { name: "array", type: "value", valueType: "any", direction: "input" },
      { name: "index", type: "value", valueType: "int32", direction: "input" },
    ],
    outputs: [
      { name: "element", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "array_set",
    label: "Array Set",
    category: "Array",
    description: "Set element at index in array",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "array", type: "value", valueType: "any", direction: "input" },
      { name: "index", type: "value", valueType: "int32", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "array", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "array_push",
    label: "Array Push",
    category: "Array",
    description: "Add element to end of array",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "array", type: "value", valueType: "any", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "array", type: "value", valueType: "any", direction: "output" },
      {
        name: "length",
        type: "value",
        valueType: "int32",
        direction: "output",
      },
    ],
  },
  {
    type: "array_length",
    label: "Array Length",
    category: "Array",
    description: "Get the length of an array",
    defaultConfig: {},
    inputs: [
      { name: "array", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      {
        name: "length",
        type: "value",
        valueType: "int32",
        direction: "output",
      },
    ],
  },
  {
    type: "array_find",
    label: "Array Find",
    category: "Array",
    description: "Find element in array, returns index (-1 if not found)",
    defaultConfig: {},
    inputs: [
      { name: "array", type: "value", valueType: "any", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "index", type: "value", valueType: "int32", direction: "output" },
      {
        name: "found",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },

  // ============================================
  // Object Operations
  // ============================================
  {
    type: "object_get",
    label: "Get Property",
    category: "Object",
    description: "Get a property value from an object",
    defaultConfig: { propertyName: "" },
    inputs: [
      { name: "object", type: "value", valueType: "any", direction: "input" },
      { name: "key", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "object_set",
    label: "Set Property",
    category: "Object",
    description: "Set a property value on an object",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "object", type: "value", valueType: "any", direction: "input" },
      { name: "key", type: "value", valueType: "string", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "object", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "object_keys",
    label: "Object Keys",
    category: "Object",
    description: "Get all keys of an object as array",
    defaultConfig: {},
    inputs: [
      { name: "object", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "keys", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // ============================================
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
    outputs: [
      { name: "result", type: "value", valueType: "any", direction: "output" },
    ],
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
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
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
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },

  // String Operations
  {
    type: "string_format",
    label: "Format String",
    category: "String",
    description: "Format string with placeholders ({0}, {1}, etc.)",
    defaultConfig: { template: "Value: {0}", argCount: 1 },
    inputs: [
      { name: "arg0", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "string_concat",
    label: "Concat Strings",
    category: "String",
    description: "Concatenate two strings",
    defaultConfig: {},
    inputs: [
      { name: "a", type: "value", valueType: "string", direction: "input" },
      { name: "b", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "to_string",
    label: "To String",
    category: "String",
    description: "Convert value to string (hex for pointers)",
    defaultConfig: { format: "auto" }, // auto, hex, decimal
    inputs: [
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      {
        name: "result",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "parse_int",
    label: "Parse Int",
    category: "String",
    description: "Parse string to integer (supports 0x hex prefix)",
    defaultConfig: { radix: 10 },
    inputs: [
      {
        name: "string",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      { name: "value", type: "value", valueType: "int64", direction: "output" },
      {
        name: "success",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },
  {
    type: "parse_float",
    label: "Parse Float",
    category: "String",
    description: "Parse string to floating point number",
    defaultConfig: {},
    inputs: [
      {
        name: "string",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [
      {
        name: "value",
        type: "value",
        valueType: "double",
        direction: "output",
      },
      {
        name: "success",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },

  // ============================================
  // Type Conversion
  // ============================================
  {
    type: "to_pointer",
    label: "To Pointer",
    category: "Conversion",
    description: "Convert number or hex string to NativePointer (ptr())",
    defaultConfig: {},
    inputs: [
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      {
        name: "pointer",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
    ],
  },

  // ============================================
  // Native
  {
    type: "call_native",
    label: "Call Native",
    category: "Native",
    description: "Call a native function with NativeFunction",
    defaultConfig: {
      returnType: "void",
      argCount: 0,
      argTypes: [] as string[], // Array of type strings for each argument
      abi: "default", // default, sysv, stdcall, fastcall, thiscall, win64, unix64
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      // Dynamic args will be added based on argCount
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "return", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // Interceptor (Frida-native hooking)
  // Registers a hook and returns hookId. Use event_hook to handle callbacks.
  {
    type: "interceptor_attach",
    label: "Interceptor Attach",
    category: "Interceptor",
    description:
      "Attach to native function. Use 'On Hook' event to handle callbacks.",
    defaultConfig: {
      hookId: "", // Unique hook identifier (auto-generated if empty)
      onEnter: true, // Enable onEnter callback
      onLeave: true, // Enable onLeave callback
      captureArgs: 4, // Number of args to capture (0-10)
      captureRetval: true, // Capture return value on leave
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "address",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "hookId",
        type: "value",
        valueType: "string",
        direction: "output",
      }, // Use this in event_hook
      {
        name: "success",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },
  {
    type: "interceptor_replace",
    label: "Interceptor Replace",
    category: "Interceptor",
    description: "Replace function with Interceptor.replace()",
    defaultConfig: {
      returnType: "void",
      argCount: 0,
      argTypes: [] as string[],
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "target",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
      {
        name: "replacement",
        type: "value",
        valueType: "pointer",
        direction: "input",
      },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "interceptor_detach",
    label: "Interceptor Detach",
    category: "Interceptor",
    description: "Detach all hooks with Interceptor.detachAll()",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "read_arg",
    label: "Read Argument",
    category: "Interceptor",
    description: "Read function argument (args[index]) in hook context",
    defaultConfig: { index: 0, asType: "pointer" },
    inputs: [
      { name: "context", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "write_arg",
    label: "Write Argument",
    category: "Interceptor",
    description: "Modify function argument in hook context",
    defaultConfig: { index: 0 },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "context", type: "value", valueType: "any", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "read_retval",
    label: "Read Return Value",
    category: "Interceptor",
    description: "Read return value in onLeave hook context",
    defaultConfig: { asType: "pointer" },
    inputs: [
      { name: "context", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "replace_retval",
    label: "Replace Return Value",
    category: "Interceptor",
    description: "Replace return value with retval.replace()",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "context", type: "value", valueType: "any", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "native_callback",
    label: "Native Callback",
    category: "Native",
    description: "Create NativeCallback for hooks or replacements",
    defaultConfig: {
      returnType: "void",
      argCount: 0,
      argTypes: [] as string[],
    },
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "callback",
        type: "value",
        valueType: "pointer",
        direction: "output",
      },
      { name: "onCall", type: "flow", direction: "output" },
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
      {
        name: "message",
        type: "value",
        valueType: "string",
        direction: "input",
      },
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
      {
        name: "message",
        type: "value",
        valueType: "string",
        direction: "input",
      },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },

  // ============================================
  // Device Management - Frida Device enumeration and selection
  // ============================================
  {
    type: "device_enumerate",
    label: "Enumerate Devices",
    category: "Device",
    description:
      "List all available Frida devices (local, USB, remote). Returns array of device info objects.",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "devices", type: "value", valueType: "any", direction: "output" }, // Array of {id, name, type}
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "device_select",
    label: "Select Device",
    category: "Device",
    description:
      "Select a device by ID or type (local, usb, remote). All subsequent process operations will use this device.",
    defaultConfig: {
      selectionMode: "type", // "id" | "type"
      deviceType: "local", // "local" | "usb" | "remote"
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "deviceId",
        type: "value",
        valueType: "string",
        direction: "input",
      }, // Used when selectionMode is "id"
    ],
    outputs: [
      { name: "success", type: "flow", direction: "output" },
      { name: "failure", type: "flow", direction: "output" },
      { name: "device", type: "value", valueType: "any", direction: "output" }, // Selected device info
      {
        name: "error",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "device_get_current",
    label: "Get Current Device",
    category: "Device",
    description:
      "Get information about the currently selected device. Returns null if no device is selected.",
    defaultConfig: {},
    inputs: [],
    outputs: [
      { name: "device", type: "value", valueType: "any", direction: "output" }, // {id, name, type} or null
      {
        name: "hasDevice",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
    ],
  },

  // ============================================
  // Process/Application Enumeration
  // ============================================
  {
    type: "process_enumerate",
    label: "Enumerate Processes",
    category: "Device",
    description:
      "List all running processes on the selected device. Returns array of process info objects.",
    defaultConfig: {
      scope: "minimal", // "minimal" | "full" - minimal is faster, full includes more details
    },
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "processes",
        type: "value",
        valueType: "any",
        direction: "output",
      }, // Array of {pid, name, ...}
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },
  {
    type: "application_enumerate",
    label: "Enumerate Applications",
    category: "Device",
    description:
      "List all installed applications on the device (primarily for mobile devices). Returns array of app info objects.",
    defaultConfig: {
      scope: "minimal", // "minimal" | "full"
      includeRunning: true, // Include currently running apps
      includeInstalled: true, // Include all installed apps
    },
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      {
        name: "applications",
        type: "value",
        valueType: "any",
        direction: "output",
      }, // Array of {identifier, name, pid?, ...}
      { name: "count", type: "value", valueType: "int32", direction: "output" },
    ],
  },

  // ============================================
  // Process Control - Attach/Detach actions
  // ============================================
  {
    type: "process_attach",
    label: "Attach to Process",
    category: "Process",
    description:
      "Attach to a process on the currently selected device. Use 'Select Device' first to choose the target device.",
    defaultConfig: {
      attachMode: "pid", // "pid" | "name" | "identifier"
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "target", type: "value", valueType: "any", direction: "input" }, // PID (number) or name/identifier (string)
    ],
    outputs: [
      { name: "success", type: "flow", direction: "output" },
      { name: "failure", type: "flow", direction: "output" },
      {
        name: "sessionId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      { name: "pid", type: "value", valueType: "int32", direction: "output" },
      {
        name: "processName",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      {
        name: "error",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "process_detach",
    label: "Detach from Process",
    category: "Process",
    description: "Detach from the currently attached process",
    defaultConfig: {},
    inputs: [{ name: "exec", type: "flow", direction: "input" }],
    outputs: [
      { name: "success", type: "flow", direction: "output" },
      { name: "failure", type: "flow", direction: "output" },
      {
        name: "error",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "process_spawn",
    label: "Spawn & Attach",
    category: "Process",
    description:
      "Spawn an application on the selected device and attach to it. Use 'Select Device' first. Ideal for apps not yet running.",
    defaultConfig: {
      resumeAfterSpawn: true, // Whether to resume the app after spawning
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      {
        name: "identifier",
        type: "value",
        valueType: "string",
        direction: "input",
      }, // Bundle identifier (e.g., com.example.app)
    ],
    outputs: [
      { name: "success", type: "flow", direction: "output" },
      { name: "failure", type: "flow", direction: "output" },
      {
        name: "sessionId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      { name: "pid", type: "value", valueType: "int32", direction: "output" },
      {
        name: "error",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "process_is_attached",
    label: "Is Attached?",
    category: "Process",
    description: "Check if currently attached to a process",
    defaultConfig: {},
    inputs: [],
    outputs: [
      {
        name: "attached",
        type: "value",
        valueType: "boolean",
        direction: "output",
      },
      {
        name: "sessionId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
      { name: "pid", type: "value", valueType: "int32", direction: "output" },
    ],
  },

  // Functions
  {
    type: "function_define",
    label: "Define Function",
    category: "Function",
    description: "Define a reusable function block",
    defaultConfig: {
      functionName: "myFunction",
      paramCount: 0,
      paramNames: [] as string[],
      returnType: "void",
    },
    inputs: [],
    outputs: [
      { name: "body", type: "flow", direction: "output" },
      // Dynamic param outputs will be added based on paramCount
    ],
  },
  {
    type: "function_call",
    label: "Call Function",
    category: "Function",
    description: "Call a defined function",
    defaultConfig: { functionName: "" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      // Dynamic param inputs will be added based on function definition
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "return", type: "value", valueType: "any", direction: "output" },
    ],
  },
  {
    type: "function_return",
    label: "Return",
    category: "Function",
    description: "Return from function with optional value",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [],
  },

  // ============================================
  // UI Value Operations - Read/Write UI component values
  // ============================================
  {
    type: "ui_get_value",
    label: "Get UI Value",
    category: "UI",
    description:
      "Read the current value of a UI component (toggle state, slider value, input text, dropdown selection)",
    defaultConfig: { componentId: "" },
    inputs: [],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
      {
        name: "componentId",
        type: "value",
        valueType: "string",
        direction: "output",
      },
    ],
  },
  {
    type: "ui_set_value",
    label: "Set UI Value",
    category: "UI",
    description:
      "Set the value of a UI component programmatically (toggle on/off, slider position, input text)",
    defaultConfig: { componentId: "" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
  },
  {
    type: "ui_get_props",
    label: "Get UI Props",
    category: "UI",
    description:
      "Read a property of a UI component (label, min, max, options, placeholder)",
    defaultConfig: { componentId: "", propName: "label" },
    inputs: [],
    outputs: [
      { name: "value", type: "value", valueType: "any", direction: "output" },
    ],
  },
];

// ============================================
// Script Store
// ============================================

// Callback for notifying external stores of script changes (to avoid circular import)
type OnScriptChangeCallback = () => void;
let onScriptChangeCallback: OnScriptChangeCallback | null = null;

function notifyScriptChange() {
  if (onScriptChangeCallback) {
    onScriptChangeCallback();
  }
}

function createScriptStore() {
  const [scripts, setScripts] = createSignal<Script[]>([]);
  const [currentScriptId, setCurrentScriptId] = createSignal<string | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  // Multi-selection support for nodes
  const [selectedNodeIds, setSelectedNodeIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [selectedConnectionId, setSelectedConnectionId] = createSignal<
    string | null
  >(null);

  // Register callback for script changes (called by projectStore)
  function onScriptChange(callback: OnScriptChangeCallback) {
    onScriptChangeCallback = callback;
  }

  // Get current script
  function getCurrentScript(): Script | null {
    const id = currentScriptId();
    if (!id) return null;
    return scripts().find((s) => s.id === id) ?? null;
  }

  // Check if node is selected
  function isNodeSelected(nodeId: string): boolean {
    return selectedNodeIds().has(nodeId);
  }

  // Get all selected nodes
  function getSelectedNodes(): ScriptNode[] {
    const script = getCurrentScript();
    if (!script) return [];
    const ids = selectedNodeIds();
    return script.nodes.filter((n) => ids.has(n.id));
  }

  // Select single node (clears multi-selection)
  function selectNode(nodeId: string | null, addToSelection = false) {
    if (!nodeId) {
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set<string>());
      return;
    }

    if (addToSelection) {
      // Toggle selection when adding
      setSelectedNodeIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
          // Update primary selection
          if (selectedNodeId() === nodeId) {
            const remaining = Array.from(newSet);
            setSelectedNodeId(remaining.length > 0 ? remaining[0] : null);
          }
        } else {
          newSet.add(nodeId);
          setSelectedNodeId(nodeId);
        }
        return newSet;
      });
    } else {
      // Replace selection
      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
    }
  }

  // Select multiple nodes (for box selection)
  function selectMultipleNodes(nodeIds: string[], addToSelection = false) {
    if (nodeIds.length === 0 && !addToSelection) {
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set<string>());
      return;
    }

    if (addToSelection) {
      setSelectedNodeIds((prev) => {
        const newSet = new Set(prev);
        for (const id of nodeIds) {
          newSet.add(id);
        }
        return newSet;
      });
      if (nodeIds.length > 0 && !selectedNodeId()) {
        setSelectedNodeId(nodeIds[0]);
      }
    } else {
      setSelectedNodeIds(new Set(nodeIds));
      setSelectedNodeId(nodeIds.length > 0 ? nodeIds[0] : null);
    }
  }

  // Move all selected nodes
  function moveSelectedNodes(dx: number, dy: number) {
    const script = getCurrentScript();
    if (!script) return;

    const ids = selectedNodeIds();
    if (ids.size === 0) return;

    const updatedNodes = script.nodes.map((n) =>
      ids.has(n.id)
        ? { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) }
        : n,
    );

    updateScript(script.id, { nodes: updatedNodes });
  }

  // Delete all selected nodes
  function deleteSelectedNodes() {
    const script = getCurrentScript();
    if (!script) return;

    const ids = Array.from(selectedNodeIds());
    if (ids.length === 0) return;

    // Remove nodes and their connections
    const newNodes = script.nodes.filter((n) => !ids.includes(n.id));
    const newConnections = script.connections.filter(
      (c) => !ids.includes(c.fromNodeId) && !ids.includes(c.toNodeId),
    );

    updateScript(script.id, {
      nodes: newNodes,
      connections: newConnections,
    });

    setSelectedNodeIds(new Set<string>());
    setSelectedNodeId(null);
  }

  // Create new script
  function createScript(name: string): Script {
    const script: Script = {
      id: crypto.randomUUID(),
      name,
      variables: [],
      nodes: [
        // Add a UI Event node by default as the entry point
        createNode("event_ui", 100, 200),
      ],
      connections: [],
    };
    setScripts((prev) => [...prev, script]);
    setCurrentScriptId(script.id);
    // Notify project store of script change
    notifyScriptChange();
    return script;
  }

  // Delete script
  function deleteScript(id: string) {
    setScripts((prev) => prev.filter((s) => s.id !== id));
    if (currentScriptId() === id) {
      const remaining = scripts().filter((s) => s.id !== id);
      setCurrentScriptId(remaining.length > 0 ? remaining[0].id : null);
    }
    // Notify project store of script change
    notifyScriptChange();
  }

  // Rename script
  function renameScript(id: string, newName: string) {
    setScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s)),
    );
    // Notify project store of script change
    notifyScriptChange();
  }

  // Duplicate script
  function duplicateScript(id: string) {
    const script = scripts().find((s) => s.id === id);
    if (!script) return null;

    const newId = crypto.randomUUID();
    const nodeIdMap = new Map<string, string>();
    const portIdMap = new Map<string, string>();

    // Deep clone nodes with new IDs
    const newNodes = script.nodes.map((node) => {
      const newNodeId = crypto.randomUUID();
      nodeIdMap.set(node.id, newNodeId);

      const newInputs = node.inputs.map((port) => {
        const newPortId = crypto.randomUUID();
        portIdMap.set(port.id, newPortId);
        return { ...port, id: newPortId };
      });

      const newOutputs = node.outputs.map((port) => {
        const newPortId = crypto.randomUUID();
        portIdMap.set(port.id, newPortId);
        return { ...port, id: newPortId };
      });

      return {
        ...node,
        id: newNodeId,
        inputs: newInputs,
        outputs: newOutputs,
        config: { ...node.config },
      };
    });

    // Remap connections
    const newConnections = script.connections.map((conn) => ({
      id: crypto.randomUUID(),
      fromNodeId: nodeIdMap.get(conn.fromNodeId) || conn.fromNodeId,
      fromPortId: portIdMap.get(conn.fromPortId) || conn.fromPortId,
      toNodeId: nodeIdMap.get(conn.toNodeId) || conn.toNodeId,
      toPortId: portIdMap.get(conn.toPortId) || conn.toPortId,
    }));

    const newScript: Script = {
      id: newId,
      name: `${script.name} (Copy)`,
      nodes: newNodes,
      connections: newConnections,
      variables: script.variables.map((v) => ({
        ...v,
        id: crypto.randomUUID(),
      })),
    };

    setScripts((prev) => [...prev, newScript]);
    setCurrentScriptId(newId);
    // Notify project store of script change
    notifyScriptChange();

    return newScript;
  }

  // Update port types when config.valueType changes (for memory nodes)
  function updatePortTypesForValueType(
    node: ScriptNode,
    valueType: ValueType,
  ): ScriptNode {
    const updatePort = (port: Port): Port => {
      // Update "value" named ports that should match the config type
      if (port.type === "value" && port.name === "value") {
        return { ...port, valueType };
      }
      return port;
    };

    return {
      ...node,
      inputs: node.inputs.map(updatePort),
      outputs: node.outputs.map(updatePort),
    };
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
  function addNode(
    type: ScriptNodeType,
    x: number,
    y: number,
  ): ScriptNode | null {
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

    const node = script.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // If config.valueType changed, update port types for memory nodes
    let updatedNode = { ...node, ...updates };
    if (updates.config && "valueType" in updates.config) {
      const newValueType = updates.config.valueType as ValueType;
      if (
        [
          "memory_read",
          "memory_write",
          "memory_scan",
          "memory_freeze",
        ].includes(node.type)
      ) {
        updatedNode = updatePortTypesForValueType(updatedNode, newValueType);
      }
    }

    updateScript(script.id, {
      nodes: script.nodes.map((n) => (n.id === nodeId ? updatedNode : n)),
    });
  }

  // Update call_native node argument count
  function updateNativeNodeArgCount(nodeId: string, argCount: number) {
    const script = getCurrentScript();
    if (!script) return;

    const node = script.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "call_native") return;

    // Keep existing base inputs (exec, address)
    const baseInputs = node.inputs.filter(
      (p) => p.name === "exec" || p.name === "address",
    );

    // Get current argTypes array, defaulting to empty
    const currentArgTypes = (node.config.argTypes as string[]) || [];

    // Create new arg inputs
    const argInputs: Port[] = [];
    for (let i = 0; i < argCount; i++) {
      // Try to preserve existing arg port id if it exists
      const existingArgPort = node.inputs.find((p) => p.name === `arg${i}`);
      argInputs.push({
        id: existingArgPort?.id || crypto.randomUUID(),
        name: `arg${i}`,
        type: "value",
        valueType: "any",
        direction: "input",
      });
    }

    // Pad or trim argTypes array to match argCount
    const newArgTypes = [...currentArgTypes];
    while (newArgTypes.length < argCount) {
      newArgTypes.push("pointer"); // Default type
    }
    newArgTypes.length = argCount; // Trim if needed

    // Remove connections to deleted arg ports
    const validArgNames = new Set([
      "exec",
      "address",
      ...argInputs.map((p) => p.name),
    ]);
    const newConnections = script.connections.filter((conn) => {
      if (conn.toNodeId !== nodeId) return true;
      const port = node.inputs.find((p) => p.id === conn.toPortId);
      if (!port) return true;
      return validArgNames.has(port.name);
    });

    updateScript(script.id, {
      nodes: script.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              inputs: [...baseInputs, ...argInputs],
              config: {
                ...n.config,
                argCount,
                argTypes: newArgTypes,
              },
            }
          : n,
      ),
      connections: newConnections,
    });
  }

  // Update string_format node argument count
  function updateFormatStringArgCount(nodeId: string, argCount: number) {
    const script = getCurrentScript();
    if (!script) return;

    const node = script.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "string_format") return;

    // Create new arg inputs
    const argInputs: Port[] = [];
    for (let i = 0; i < argCount; i++) {
      // Try to preserve existing arg port id if it exists
      const existingArgPort = node.inputs.find((p) => p.name === `arg${i}`);
      argInputs.push({
        id: existingArgPort?.id || crypto.randomUUID(),
        name: `arg${i}`,
        type: "value",
        valueType: "any",
        direction: "input",
      });
    }

    // Remove connections to deleted arg ports
    const validArgNames = new Set(argInputs.map((p) => p.name));
    const newConnections = script.connections.filter((conn) => {
      if (conn.toNodeId !== nodeId) return true;
      const port = node.inputs.find((p) => p.id === conn.toPortId);
      if (!port) return true;
      return validArgNames.has(port.name);
    });

    updateScript(script.id, {
      nodes: script.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              inputs: argInputs,
              config: {
                ...n.config,
                argCount,
              },
            }
          : n,
      ),
      connections: newConnections,
    });
  }

  // Delete node
  function deleteNode(nodeId: string) {
    const script = getCurrentScript();
    if (!script) return;

    // Also delete connections to/from this node
    const newConnections = script.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId,
    );

    updateScript(script.id, {
      nodes: script.nodes.filter((n) => n.id !== nodeId),
      connections: newConnections,
    });

    if (selectedNodeId() === nodeId) {
      setSelectedNodeId(null);
    }
  }

  // Connection validation result
  interface ConnectionValidation {
    valid: boolean;
    error?: string;
  }

  // Check if two value types are compatible
  function areTypesCompatible(
    fromType: ValueType | undefined,
    toType: ValueType | undefined,
  ): boolean {
    // If either is "any", always compatible
    if (fromType === "any" || toType === "any") return true;
    // If types are the same, compatible
    if (fromType === toType) return true;
    // Numeric types can be implicitly converted
    const numericTypes: ValueType[] = [
      "int8",
      "uint8",
      "int16",
      "uint16",
      "int32",
      "uint32",
      "int64",
      "uint64",
      "float",
      "double",
    ];
    if (
      fromType &&
      toType &&
      numericTypes.includes(fromType) &&
      numericTypes.includes(toType)
    )
      return true;
    // Pointer can be converted to/from numeric types (for address arithmetic)
    if (
      (fromType === "pointer" && toType && numericTypes.includes(toType)) ||
      (toType === "pointer" && fromType && numericTypes.includes(fromType))
    )
      return true;
    return false;
  }

  // Validate a connection before creating it
  function validateConnection(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string,
  ): ConnectionValidation {
    const script = getCurrentScript();
    if (!script) return { valid: false, error: "No active script" };

    // Can't connect to self
    if (fromNodeId === toNodeId) {
      return { valid: false, error: "Cannot connect node to itself" };
    }

    const fromNode = script.nodes.find((n) => n.id === fromNodeId);
    const toNode = script.nodes.find((n) => n.id === toNodeId);
    if (!fromNode) return { valid: false, error: "Source node not found" };
    if (!toNode) return { valid: false, error: "Target node not found" };

    const fromPort = fromNode.outputs.find((p) => p.id === fromPortId);
    const toPort = toNode.inputs.find((p) => p.id === toPortId);
    if (!fromPort) return { valid: false, error: "Source port not found" };
    if (!toPort) return { valid: false, error: "Target port not found" };

    // Check port types match (flow vs value)
    if (fromPort.type !== toPort.type) {
      return {
        valid: false,
        error: `Cannot connect ${fromPort.type} to ${toPort.type}`,
      };
    }

    // For value ports, check value type compatibility
    if (fromPort.type === "value") {
      if (!areTypesCompatible(fromPort.valueType, toPort.valueType)) {
        return {
          valid: false,
          error: `Type mismatch: ${fromPort.valueType} → ${toPort.valueType}`,
        };
      }
    }

    // Check if connection already exists
    const exists = script.connections.some(
      (c) =>
        c.fromNodeId === fromNodeId &&
        c.fromPortId === fromPortId &&
        c.toNodeId === toNodeId &&
        c.toPortId === toPortId,
    );
    if (exists) return { valid: false, error: "Connection already exists" };

    return { valid: true };
  }

  // Add connection
  function addConnection(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string,
  ): Connection | null {
    const validation = validateConnection(
      fromNodeId,
      fromPortId,
      toNodeId,
      toPortId,
    );
    if (!validation.valid) {
      console.warn("Connection rejected:", validation.error);
      return null;
    }

    const script = getCurrentScript()!;
    const toNode = script.nodes.find((n) => n.id === toNodeId)!;
    const toPort = toNode.inputs.find((p) => p.id === toPortId)!;

    // For flow ports, remove existing connection to input (only one allowed)
    let newConnections = [...script.connections];
    if (toPort.type === "flow") {
      newConnections = newConnections.filter(
        (c) => !(c.toNodeId === toNodeId && c.toPortId === toPortId),
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
      prev.map((s) => (s.id === scriptId ? { ...s, ...updates } : s)),
    );
    // Notify project store of script change
    notifyScriptChange();
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

  // Set all scripts (for loading from project)
  function setScriptsFromProject(projectScripts: Script[]) {
    setScripts(projectScripts);
    // Select first script if available and none selected
    if (projectScripts.length > 0 && !currentScriptId()) {
      setCurrentScriptId(projectScripts[0].id);
    } else if (projectScripts.length === 0) {
      setCurrentScriptId(null);
    }
  }

  // Get all scripts (for saving to project)
  function getAllScripts(): Script[] {
    return scripts();
  }

  // Clear all scripts (for closing project)
  function clearScripts() {
    setScripts([]);
    setCurrentScriptId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set<string>());
    setSelectedConnectionId(null);
  }

  return {
    scripts,
    currentScriptId,
    selectedNodeId,
    selectedNodeIds,
    selectedConnectionId,
    setCurrentScriptId,
    setSelectedNodeId,
    setSelectedNodeIds,
    setSelectedConnectionId,
    // Multi-selection functions
    isNodeSelected,
    getSelectedNodes,
    selectNode,
    selectMultipleNodes,
    moveSelectedNodes,
    deleteSelectedNodes,
    // Original functions
    getCurrentScript,
    createScript,
    deleteScript,
    renameScript,
    duplicateScript,
    addNode,
    updateNode,
    updateNativeNodeArgCount,
    updateFormatStringArgCount,
    deleteNode,
    addConnection,
    deleteConnection,
    addVariable,
    deleteVariable,
    updateScript,
    getNodeCategories,
    nodeTemplates,
    // Project integration functions
    onScriptChange,
    setScriptsFromProject,
    getAllScripts,
    clearScripts,
  };
}

export const scriptStore = createRoot(createScriptStore);
