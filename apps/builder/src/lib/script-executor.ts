import {
  executeScript,
  setUiValuesBatch,
  clearAllScriptStates,
  type ScriptData,
  type ExecutionResult,
} from "@/lib/tauri";
import type {
  Script,
  ScriptNode,
  ScriptVariable,
  Connection,
} from "@/stores/script";
import type { UIComponent } from "@/stores/project";

// Convert frontend Script model to backend ScriptData format
export function convertScript(script: Script): ScriptData {
  return {
    id: script.id,
    name: script.name,
    description: script.description,
    variables: script.variables.map((v: ScriptVariable) => ({
      id: v.id,
      name: v.name,
      valueType: v.type,
      defaultValue: v.defaultValue ?? null,
    })),
    nodes: script.nodes.map((n: ScriptNode) => ({
      id: n.id,
      nodeType: n.type,
      label: n.label,
      x: n.x,
      y: n.y,
      config: n.config,
      inputs: n.inputs.map((p) => ({
        id: p.id,
        name: p.name,
        portType: p.type,
        valueType: p.valueType,
        direction: "input",
      })),
      outputs: n.outputs.map((p) => ({
        id: p.id,
        name: p.name,
        portType: p.type,
        valueType: p.valueType,
        direction: "output",
      })),
    })),
    connections: script.connections.map((c: Connection) => ({
      id: c.id,
      fromNodeId: c.fromNodeId,
      fromPortId: c.fromPortId,
      toNodeId: c.toNodeId,
      toPortId: c.toPortId,
    })),
  };
}

// Sync UI component default values to backend
export async function syncUiValues(components: UIComponent[]): Promise<void> {
  const values: Record<string, unknown> = {};

  for (const comp of components) {
    switch (comp.type) {
      case "toggle":
        values[comp.id] = comp.props?.defaultValue ?? false;
        break;
      case "slider":
        values[comp.id] = comp.props?.defaultValue ?? comp.props?.min ?? 0;
        break;
      case "input":
        values[comp.id] = comp.props?.defaultValue ?? "";
        break;
      case "dropdown": {
        const options = (comp.props?.options ?? []) as string[];
        values[comp.id] = options[0] ?? "";
        break;
      }
    }
  }

  if (Object.keys(values).length > 0) {
    await setUiValuesBatch(values);
  }
}

// Execute a single event node
export async function executeEventNode(
  scriptData: ScriptData,
  eventNode: ScriptNode,
  eventValue: unknown = null,
  componentId?: string,
): Promise<ExecutionResult> {
  return executeScript(scriptData, eventNode.id, eventValue, componentId);
}

// Reset all script variable states
export async function resetScriptStates(): Promise<void> {
  await clearAllScriptStates();
}
