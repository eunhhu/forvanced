import { createSignal, createRoot } from "solid-js";

// ============================================
// Visual Scripting System Types
// ============================================

// Script Trigger Events - When scripts are executed
export type ScriptTrigger =
  | "on_attach"         // When attached to process
  | "on_detach"         // When detached from process
  | "on_button_click"   // When UI button is clicked (linked by component ID)
  | "on_toggle_change"  // When UI toggle state changes
  | "on_slider_change"  // When UI slider value changes
  | "on_hotkey"         // When hotkey is pressed
  | "on_interval"       // Periodic execution (timer)
  | "manual";           // Manual execution only

// Script Trigger Configuration
export interface ScriptTriggerConfig {
  type: ScriptTrigger;
  componentId?: string;   // For UI events
  hotkey?: string;        // For hotkey events (e.g., "Ctrl+F1")
  intervalMs?: number;    // For interval events
}

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
  | "memory_alloc"    // Allocate memory
  | "memory_protect"  // Change memory protection
  // Pointer Operations
  | "pointer_add"     // Add offset to pointer
  | "pointer_read"    // Read from pointer (with type)
  | "pointer_write"   // Write to pointer (with type)
  // Module/Symbol
  | "get_module"      // Get module by name
  | "find_symbol"     // Find symbol/export in module
  | "get_base_address" // Get module base address
  | "enumerate_exports" // List all exports of a module
  | "enumerate_modules" // List all loaded modules
  // Variables
  | "set_variable"    // Store value in variable
  | "get_variable"    // Retrieve value from variable
  // Math/Logic
  | "math"            // Math operations (+, -, *, /, %)
  | "compare"         // Comparison (==, !=, <, >, <=, >=)
  | "logic"           // Logic operations (and, or, not)
  // String Operations
  | "string_format"   // Format string with values
  | "string_concat"   // Concatenate strings
  | "to_string"       // Convert value to string
  // Native
  | "call_native"     // Call native function with NativeFunction
  | "native_callback" // Create NativeCallback for hooks
  // Interceptor
  | "interceptor_attach" // Attach to function (onEnter/onLeave)
  | "interceptor_replace" // Replace function implementation
  | "interceptor_detach" // Detach from function
  | "read_arg"        // Read argument in hook context
  | "write_arg"       // Modify argument in hook context
  | "read_retval"     // Read return value in hook context
  | "replace_retval"  // Replace return value in hook context
  // Hook (legacy)
  | "hook_function"   // Hook a function
  | "hook_callback"   // Define hook callback behavior
  // Output
  | "log"             // Log to console
  | "notify"          // Show notification
  // UI Binding
  | "bind_to_label"
  // Functions (reusable code blocks)
  | "function_define"   // Define a reusable function
  | "function_call"     // Call a defined function
  | "function_return"   // Return from function          // Show notification

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
  trigger: ScriptTriggerConfig;  // When this script is executed
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
      { name: "address", type: "value", valueType: "pointer", direction: "output" },
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
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
      { name: "size", type: "value", valueType: "uint32", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "success", type: "value", valueType: "boolean", direction: "output" },
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
      { name: "pointer", type: "value", valueType: "pointer", direction: "input" },
      { name: "offset", type: "value", valueType: "int64", direction: "input" },
    ],
    outputs: [
      { name: "result", type: "value", valueType: "pointer", direction: "output" },
    ],
  },
  {
    type: "pointer_read",
    label: "Pointer Read",
    category: "Pointer",
    description: "Read value at pointer (readU32, readPointer, etc.)",
    defaultConfig: { readType: "uint32" },
    inputs: [
      { name: "pointer", type: "value", valueType: "pointer", direction: "input" },
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
      { name: "pointer", type: "value", valueType: "pointer", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
    ],
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
  {
    type: "enumerate_modules",
    label: "Enumerate Modules",
    category: "Module",
    description: "List all loaded modules with Process.enumerateModules()",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
    ],
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
      { name: "moduleName", type: "value", valueType: "string", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "exports", type: "value", valueType: "any", direction: "output" },
      { name: "count", type: "value", valueType: "int32", direction: "output" },
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

  // String Operations
  {
    type: "string_format",
    label: "Format String",
    category: "String",
    description: "Format string with placeholders ({0}, {1}, etc.)",
    defaultConfig: { template: "Value: {0}" },
    inputs: [
      { name: "arg0", type: "value", valueType: "any", direction: "input" },
      { name: "arg1", type: "value", valueType: "any", direction: "input" },
      { name: "arg2", type: "value", valueType: "any", direction: "input" },
      { name: "arg3", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "result", type: "value", valueType: "string", direction: "output" }],
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
    outputs: [{ name: "result", type: "value", valueType: "string", direction: "output" }],
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
    outputs: [{ name: "result", type: "value", valueType: "string", direction: "output" }],
  },

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
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
      // Dynamic args will be added based on argCount
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "return", type: "value", valueType: "any", direction: "output" },
    ],
  },

  // Interceptor (Frida-native hooking)
  {
    type: "interceptor_attach",
    label: "Interceptor Attach",
    category: "Interceptor",
    description: "Attach to function with Interceptor.attach()",
    defaultConfig: {
      onEnter: true,
      onLeave: true,
      argCount: 0,
    },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "address", type: "value", valueType: "pointer", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "onEnter", type: "flow", direction: "output" },
      { name: "onLeave", type: "flow", direction: "output" },
      { name: "context", type: "value", valueType: "any", direction: "output" },
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
      { name: "target", type: "value", valueType: "pointer", direction: "input" },
      { name: "replacement", type: "value", valueType: "pointer", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
    ],
  },
  {
    type: "interceptor_detach",
    label: "Interceptor Detach",
    category: "Interceptor",
    description: "Detach all hooks with Interceptor.detachAll()",
    defaultConfig: {},
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
    ],
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
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
    ],
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
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
    ],
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
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
    ],
    outputs: [
      { name: "exec", type: "flow", direction: "output" },
      { name: "callback", type: "value", valueType: "pointer", direction: "output" },
      { name: "onCall", type: "flow", direction: "output" },
    ],
  },

  // Hook (legacy - kept for compatibility)
  {
    type: "hook_function",
    label: "Hook Function (Legacy)",
    category: "Hook",
    description: "Hook a function at address (use Interceptor Attach instead)",
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

  // UI Binding
  {
    type: "bind_to_label",
    label: "Bind to Label",
    category: "UI",
    description: "Bind a value to a UI label component for display",
    defaultConfig: { componentId: "", format: "{value}" },
    inputs: [
      { name: "exec", type: "flow", direction: "input" },
      { name: "value", type: "value", valueType: "any", direction: "input" },
    ],
    outputs: [{ name: "exec", type: "flow", direction: "output" }],
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
  function createScript(name: string, trigger: ScriptTrigger = "manual"): Script {
    const script: Script = {
      id: crypto.randomUUID(),
      name,
      trigger: { type: trigger },
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

  // Update call_native node argument count
  function updateNativeNodeArgCount(nodeId: string, argCount: number) {
    const script = getCurrentScript();
    if (!script) return;

    const node = script.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "call_native") return;

    // Keep existing base inputs (exec, address)
    const baseInputs = node.inputs.filter(
      (p) => p.name === "exec" || p.name === "address"
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
          : n
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

  // Connection validation result
  interface ConnectionValidation {
    valid: boolean;
    error?: string;
  }

  // Check if two value types are compatible
  function areTypesCompatible(fromType: ValueType | undefined, toType: ValueType | undefined): boolean {
    // If either is "any", always compatible
    if (fromType === "any" || toType === "any") return true;
    // If types are the same, compatible
    if (fromType === toType) return true;
    // Numeric types can be implicitly converted
    const numericTypes: ValueType[] = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float", "double"];
    if (fromType && toType && numericTypes.includes(fromType) && numericTypes.includes(toType)) return true;
    // Pointer can be converted to/from numeric types (for address arithmetic)
    if ((fromType === "pointer" && toType && numericTypes.includes(toType)) ||
        (toType === "pointer" && fromType && numericTypes.includes(fromType))) return true;
    return false;
  }

  // Validate a connection before creating it
  function validateConnection(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string
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
      return { valid: false, error: `Cannot connect ${fromPort.type} to ${toPort.type}` };
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
        c.toPortId === toPortId
    );
    if (exists) return { valid: false, error: "Connection already exists" };

    return { valid: true };
  }

  // Add connection
  function addConnection(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string
  ): Connection | null {
    const validation = validateConnection(fromNodeId, fromPortId, toNodeId, toPortId);
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
    updateNativeNodeArgCount,
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
