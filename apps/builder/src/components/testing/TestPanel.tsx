import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import { scriptStore, getNodeContext } from "@/stores/script";
import { designerStore } from "@/stores/designer";
import {
  listDevices,
  selectDevice,
  enumerateProcesses,
  attachToProcess,
  detachFromProcess,
  injectScript,
  unloadScript,
  onFridaMessage,
  executeScript,
  setExecutorSession,
  clearExecutorSession,
  setUiValuesBatch,
  type DeviceInfo,
  type ProcessInfo,
  type FridaMessageEvent,
  type ScriptData,
} from "@/lib/tauri";
import type {
  Script,
  ScriptNode,
  Connection,
  ScriptVariable,
} from "@/stores/script";
import { FRIDA_AGENT_SCRIPT } from "@/lib/frida-agent";

// ============================================
// Types
// ============================================

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug" | "frida" | "exec" | "hook";
  message: string;
}

// Forvanced event from Frida agent
interface ForvancedEvent {
  type: "forvanced_event";
  eventType:
    | "hook_enter"
    | "hook_leave"
    | "memory_access"
    | "java_hook_enter"
    | "java_hook_leave";
  data: Record<string, unknown>;
  timestamp: number;
}

// ============================================
// TestPanel Component
// ============================================

export const TestPanel: Component = () => {
  // Device/Process State
  const [devices, setDevices] = createSignal<DeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = createSignal<string | null>(
    null,
  );
  const [processes, setProcesses] = createSignal<ProcessInfo[]>([]);
  const [processFilter, setProcessFilter] = createSignal("");
  const [isLoadingDevices, setIsLoadingDevices] = createSignal(false);
  const [isLoadingProcesses, setIsLoadingProcesses] = createSignal(false);

  // Session State
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  const [injectedScriptId, setInjectedScriptId] = createSignal<string | null>(
    null,
  );
  const [attachedPid, setAttachedPid] = createSignal<number | null>(null);
  const [attachedName, setAttachedName] = createSignal<string | null>(null);
  const [isExecutorReady, setIsExecutorReady] = createSignal(false);

  // Script State
  const [selectedScriptId, setSelectedScriptId] = createSignal<string | null>(
    null,
  );
  const [isRunning, setIsRunning] = createSignal(false);
  const [logs, setLogs] = createSignal<LogEntry[]>([]);

  // UI State
  const [activeSection, setActiveSection] = createSignal<"device" | "script">(
    "device",
  );

  // Derived state
  const scripts = () => scriptStore.scripts();
  const uiComponents = () => designerStore.components();

  const selectedScript = createMemo(() => {
    const id = selectedScriptId();
    if (!id) return null;
    return scripts().find((s) => s.id === id) ?? null;
  });

  const filteredProcesses = createMemo(() => {
    const filter = processFilter().toLowerCase();
    if (!filter) return processes();
    return processes().filter(
      (p) =>
        p.name.toLowerCase().includes(filter) || String(p.pid).includes(filter),
    );
  });

  // Check if the script has any target nodes (requires Frida session)
  const hasTargetNodes = createMemo(() => {
    const script = selectedScript();
    if (!script) return false;
    return script.nodes.some((node) => getNodeContext(node.type) === "target");
  });

  // Find event nodes in the script
  const eventNodes = createMemo(() => {
    const script = selectedScript();
    if (!script) return [];
    return script.nodes.filter((node) => node.type.startsWith("event_"));
  });

  const canRun = createMemo(() => {
    const script = selectedScript();
    if (!script || isRunning()) return false;
    if (hasTargetNodes() && !isExecutorReady()) return false;
    if (eventNodes().length === 0) return false;
    return true;
  });

  const cannotRunReason = createMemo(() => {
    if (!selectedScript()) return "No script selected";
    if (eventNodes().length === 0) return "No event nodes in script";
    if (isRunning()) return "Script is running";
    if (hasTargetNodes() && !isExecutorReady())
      return "Attach to process first";
    return null;
  });

  // Initialize
  onMount(async () => {
    await loadDevices();

    const unsubscribe = await onFridaMessage(handleFridaMessage);
    onCleanup(() => {
      unsubscribe();
    });
  });

  // Auto-select first script if none selected
  createEffect(() => {
    const allScripts = scripts();
    if (allScripts.length > 0 && !selectedScriptId()) {
      setSelectedScriptId(allScripts[0].id);
    }
  });

  // ============================================
  // Device/Process Actions
  // ============================================

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const deviceList = await listDevices();
      setDevices(deviceList);
      const local = deviceList.find((d) => d.device_type === "local");
      if (local && !selectedDeviceId()) {
        setSelectedDeviceId(local.id);
        await handleDeviceSelect(local.id);
      }
    } catch (error) {
      addLog("error", `Failed to list devices: ${error}`);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    try {
      await selectDevice(deviceId);
      await loadProcesses();
    } catch (error) {
      addLog("error", `Failed to select device: ${error}`);
    }
  };

  const loadProcesses = async () => {
    setIsLoadingProcesses(true);
    try {
      const procs = await enumerateProcesses();
      setProcesses(procs);
    } catch (error) {
      addLog("error", `Failed to enumerate processes: ${error}`);
    } finally {
      setIsLoadingProcesses(false);
    }
  };

  const handleAttach = async (pid: number, name: string) => {
    addLog("info", `Attaching to ${name} (PID: ${pid})...`);
    try {
      const session = await attachToProcess(pid);
      setSessionId(session);
      setAttachedPid(pid);
      setAttachedName(name);
      addLog("info", `Attached (Session: ${session})`);

      addLog("info", "Injecting RPC bridge...");
      const scriptId = await injectScript(session, FRIDA_AGENT_SCRIPT);
      setInjectedScriptId(scriptId);
      addLog("info", `Agent injected (Script: ${scriptId})`);

      await setExecutorSession(session, scriptId);
      setIsExecutorReady(true);
      addLog("info", "Executor ready");
    } catch (error) {
      addLog("error", `Failed to attach: ${error}`);
      if (sessionId()) {
        try {
          await detachFromProcess(sessionId()!);
        } catch {
          /* ignore */
        }
      }
      setSessionId(null);
      setAttachedPid(null);
      setAttachedName(null);
      setInjectedScriptId(null);
      setIsExecutorReady(false);
    }
  };

  const handleDetach = async () => {
    const session = sessionId();
    if (!session) return;

    addLog("info", "Detaching...");
    try {
      await clearExecutorSession();
      setIsExecutorReady(false);

      const scriptId = injectedScriptId();
      if (scriptId) {
        await unloadScript(session, scriptId);
        setInjectedScriptId(null);
      }

      await detachFromProcess(session);
      setSessionId(null);
      setAttachedPid(null);
      setAttachedName(null);
      addLog("info", "Detached");
    } catch (error) {
      addLog("error", `Failed to detach: ${error}`);
    }
  };

  // ============================================
  // Script Execution
  // ============================================

  const convertScript = (script: Script): ScriptData => {
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
  };

  const syncUiValues = async () => {
    const components = uiComponents();
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
        case "dropdown":
          const options = (comp.props?.options ?? []) as string[];
          values[comp.id] = options[0] ?? "";
          break;
      }
    }

    if (Object.keys(values).length > 0) {
      await setUiValuesBatch(values);
    }
  };

  const handleRun = async () => {
    const script = selectedScript();
    if (!script) return;

    setIsRunning(true);
    addLog("info", `Running: ${script.name}`);

    try {
      await syncUiValues();

      const events = eventNodes();
      const scriptData = convertScript(script);

      for (const eventNode of events) {
        addLog("exec", `Trigger: ${eventNode.label}`);

        const result = await executeScript(
          scriptData,
          eventNode.id,
          null,
          undefined,
        );

        if (result.success) {
          addLog("exec", `✓ ${eventNode.label} done`);
          for (const log of result.logs) {
            addLog("debug", log);
          }
        } else {
          addLog("error", `✗ ${eventNode.label}: ${result.error}`);
        }
      }

      addLog("info", "Execution complete");
    } catch (error) {
      addLog("error", `Error: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
    addLog("info", "Stopped");
  };

  // ============================================
  // Frida Message Handler
  // ============================================

  const handleFridaMessage = async (event: FridaMessageEvent) => {
    const { message } = event;

    switch (message.type) {
      case "log":
        addLog("frida", `[${message.level}] ${message.text}`);
        break;
      case "send":
        // Check if it's a Forvanced event
        const payload = message.payload as Record<string, unknown>;
        if (payload?.type === "forvanced_event") {
          await handleForvancedEvent(payload as unknown as ForvancedEvent);
        } else {
          addLog("frida", `[send] ${JSON.stringify(message.payload)}`);
        }
        break;
      case "error":
        addLog("error", `[Frida] ${message.description}`);
        if (message.stack) {
          addLog("debug", message.stack);
        }
        break;
    }
  };

  /**
   * Handle Forvanced events from Frida agent (hooks, memory watches, etc.)
   */
  const handleForvancedEvent = async (event: ForvancedEvent) => {
    const { eventType, data } = event;

    switch (eventType) {
      case "hook_enter":
        addLog("hook", `Hook Enter: ${data.hookId} @ ${data.address}`);
        if (data.args) {
          addLog("debug", `  Args: ${JSON.stringify(data.args)}`);
        }
        // TODO: Trigger connected script nodes
        await triggerHookEvent(data.hookId as string, "enter", data);
        break;

      case "hook_leave":
        addLog("hook", `Hook Leave: ${data.hookId}`);
        if (data.retval !== undefined) {
          addLog("debug", `  Return: ${data.retval}`);
        }
        await triggerHookEvent(data.hookId as string, "leave", data);
        break;

      case "memory_access":
        addLog(
          "hook",
          `Memory ${data.operation}: ${data.address} from ${data.from}`,
        );
        await triggerMemoryWatchEvent(data.watchId as string, data);
        break;

      case "java_hook_enter":
        addLog("hook", `Java Enter: ${data.className}.${data.methodName}`);
        await triggerHookEvent(data.hookId as string, "enter", data);
        break;

      case "java_hook_leave":
        addLog("hook", `Java Leave: ${data.className}.${data.methodName}`);
        await triggerHookEvent(data.hookId as string, "leave", data);
        break;
    }
  };

  /**
   * Trigger script execution from hook event
   */
  const triggerHookEvent = async (
    hookId: string,
    phase: "enter" | "leave",
    data: Record<string, unknown>,
  ) => {
    const script = selectedScript();
    if (!script) return;

    // Find event nodes that listen to this hook
    const hookEventNodes = script.nodes.filter(
      (node) =>
        node.type === "event_hook" &&
        node.config.hookId === hookId &&
        node.config.phase === phase,
    );

    if (hookEventNodes.length === 0) return;

    const scriptData = convertScript(script);

    for (const eventNode of hookEventNodes) {
      addLog("exec", `Hook triggered: ${eventNode.label}`);
      try {
        const result = await executeScript(
          scriptData,
          eventNode.id,
          data,
          undefined,
        );
        if (!result.success) {
          addLog("error", `Hook handler failed: ${result.error}`);
        }
      } catch (error) {
        addLog("error", `Hook execution error: ${error}`);
      }
    }
  };

  /**
   * Trigger script execution from memory watch event
   */
  const triggerMemoryWatchEvent = async (
    watchId: string,
    data: Record<string, unknown>,
  ) => {
    const script = selectedScript();
    if (!script) return;

    // Find event nodes that listen to this memory watch
    const watchEventNodes = script.nodes.filter(
      (node) =>
        node.type === "event_memory_watch" && node.config.watchId === watchId,
    );

    if (watchEventNodes.length === 0) return;

    const scriptData = convertScript(script);

    for (const eventNode of watchEventNodes) {
      addLog("exec", `Memory watch triggered: ${eventNode.label}`);
      try {
        const result = await executeScript(
          scriptData,
          eventNode.id,
          data,
          undefined,
        );
        if (!result.success) {
          addLog("error", `Watch handler failed: ${result.error}`);
        }
      } catch (error) {
        addLog("error", `Watch execution error: ${error}`);
      }
    }
  };

  // ============================================
  // Utility
  // ============================================

  const addLog = (level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
    };
    setLogs((prev) => [...prev, entry].slice(-200));
  };

  const clearLogs = () => setLogs([]);

  // ============================================
  // Render
  // ============================================

  return (
    <div class="flex h-full bg-surface">
      {/* Left Panel */}
      <div class="w-80 border-r border-border flex flex-col">
        {/* Tabs */}
        <div class="flex border-b border-border">
          <button
            class={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeSection() === "device"
                ? "text-accent border-b-2 border-accent"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setActiveSection("device")}
          >
            Device
          </button>
          <button
            class={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeSection() === "script"
                ? "text-accent border-b-2 border-accent"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setActiveSection("script")}
          >
            Script
          </button>
        </div>

        {/* Device Section */}
        <Show when={activeSection() === "device"}>
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="p-3 border-b border-border">
              <label class="block text-xs text-foreground-muted mb-1">
                Device
              </label>
              <div class="flex gap-2">
                <select
                  class="flex-1 px-2 py-1.5 text-sm bg-background border border-border rounded"
                  value={selectedDeviceId() ?? ""}
                  onChange={(e) => handleDeviceSelect(e.currentTarget.value)}
                  disabled={isLoadingDevices()}
                >
                  <For each={devices()}>
                    {(device) => (
                      <option value={device.id}>
                        {device.name} ({device.device_type})
                      </option>
                    )}
                  </For>
                </select>
                <button
                  class="px-2 py-1 text-xs bg-background border border-border rounded hover:bg-surface-hover"
                  onClick={loadDevices}
                  disabled={isLoadingDevices()}
                >
                  ↻
                </button>
              </div>
            </div>

            <Show when={sessionId()}>
              <div class="px-3 py-2 bg-success/10 border-b border-success/20 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span class="text-xs text-success font-medium">
                    {attachedName()} ({attachedPid()})
                  </span>
                </div>
                <button
                  class="px-2 py-0.5 text-xs bg-error/20 text-error rounded hover:bg-error/30"
                  onClick={handleDetach}
                >
                  Detach
                </button>
              </div>
            </Show>

            <Show when={sessionId()}>
              <div
                class={`px-3 py-1.5 text-xs border-b ${
                  isExecutorReady()
                    ? "bg-accent/10 text-accent border-accent/20"
                    : "bg-warning/10 text-warning border-warning/20"
                }`}
              >
                {isExecutorReady() ? "✓ Executor ready" : "⏳ Initializing..."}
              </div>
            </Show>

            <div class="p-3 border-b border-border">
              <input
                type="text"
                placeholder="Filter processes..."
                class="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
                value={processFilter()}
                onInput={(e) => setProcessFilter(e.currentTarget.value)}
              />
            </div>

            <div class="flex-1 overflow-y-auto">
              <Show
                when={!isLoadingProcesses()}
                fallback={
                  <div class="p-4 text-center text-foreground-muted text-sm">
                    Loading...
                  </div>
                }
              >
                <For each={filteredProcesses()}>
                  {(proc) => (
                    <button
                      class={`w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors border-b border-border/50 ${
                        attachedPid() === proc.pid ? "bg-accent/10" : ""
                      }`}
                      onClick={() => handleAttach(proc.pid, proc.name)}
                      disabled={!!sessionId()}
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-foreground truncate">
                          {proc.name}
                        </span>
                        <span class="text-xs text-foreground-muted">
                          {proc.pid}
                        </span>
                      </div>
                      <Show when={proc.path}>
                        <div class="text-[10px] text-foreground-muted truncate">
                          {proc.path}
                        </div>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Show>

        {/* Script Section */}
        <Show when={activeSection() === "script"}>
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="p-3 border-b border-border">
              <label class="block text-xs text-foreground-muted mb-1">
                Script
              </label>
              <select
                class="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
                value={selectedScriptId() ?? ""}
                onChange={(e) =>
                  setSelectedScriptId(e.currentTarget.value || null)
                }
              >
                <option value="">-- Select --</option>
                <For each={scripts()}>
                  {(script) => <option value={script.id}>{script.name}</option>}
                </For>
              </select>
            </div>

            <Show when={selectedScript()}>
              <div class="p-3 border-b border-border space-y-2">
                <div class="flex items-center gap-2 text-xs flex-wrap">
                  <span class="text-foreground-muted">
                    {selectedScript()?.nodes.length} nodes
                  </span>
                  <span class="text-foreground-muted">
                    {eventNodes().length} events
                  </span>
                  <Show when={hasTargetNodes()}>
                    <span class="px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                      Frida
                    </span>
                  </Show>
                  <Show when={!hasTargetNodes()}>
                    <span class="px-1.5 py-0.5 rounded bg-success/20 text-success">
                      Host
                    </span>
                  </Show>
                </div>

                <Show when={eventNodes().length > 0}>
                  <div class="text-xs text-foreground-muted">
                    <span class="font-medium">Events:</span>
                    <div class="mt-1 space-y-0.5">
                      <For each={eventNodes()}>
                        {(node) => (
                          <div class="flex items-center gap-1">
                            <span class="text-accent">•</span>
                            <span>{node.label || node.type}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <div class="p-3 space-y-2">
              <div class="flex gap-2">
                <Show when={!isRunning()}>
                  <button
                    class="flex-1 px-3 py-2 text-sm rounded bg-success text-white hover:bg-success/90 disabled:opacity-50"
                    onClick={handleRun}
                    disabled={!canRun()}
                    title={cannotRunReason() ?? undefined}
                  >
                    ▶ Run
                  </button>
                </Show>
                <Show when={isRunning()}>
                  <button
                    class="flex-1 px-3 py-2 text-sm rounded bg-error text-white hover:bg-error/90"
                    onClick={handleStop}
                  >
                    ■ Stop
                  </button>
                </Show>
              </div>

              <Show when={cannotRunReason() && !isRunning()}>
                <div class="text-[10px] text-foreground-muted text-center">
                  {cannotRunReason()}
                </div>
              </Show>
            </div>

            <div class="p-3 border-t border-border bg-background/50">
              <div class="text-[10px] text-foreground-muted space-y-1">
                <p class="font-medium">Architecture:</p>
                <p>• Host nodes → Rust</p>
                <p>• Target nodes → Frida RPC</p>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Console */}
      <div class="flex-1 flex flex-col">
        <div class="flex items-center justify-between px-4 py-2 border-b border-border">
          <span class="text-sm font-medium">Console</span>
          <button
            class="text-xs text-foreground-muted hover:text-foreground"
            onClick={clearLogs}
          >
            Clear
          </button>
        </div>

        <div class="flex-1 overflow-auto p-3 bg-background font-mono text-xs">
          <For each={logs()}>{(entry) => <LogLine entry={entry} />}</For>
          <Show when={logs().length === 0}>
            <div class="text-foreground-muted text-center py-8">
              Console output
            </div>
          </Show>
        </div>

        <div class="px-4 py-2 border-t border-border text-xs text-foreground-muted flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1">
              <div
                class={`w-2 h-2 rounded-full ${sessionId() ? "bg-success" : "bg-foreground-muted"}`}
              />
              {sessionId() ? "Connected" : "Disconnected"}
            </span>
            <span class="flex items-center gap-1">
              <div
                class={`w-2 h-2 rounded-full ${isExecutorReady() ? "bg-accent" : "bg-foreground-muted"}`}
              />
              {isExecutorReady() ? "Ready" : "Idle"}
            </span>
          </div>
          <span>{logs().length} msgs</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// LogLine Component
// ============================================

interface LogLineProps {
  entry: LogEntry;
}

const LogLine: Component<LogLineProps> = (props) => {
  const levelColors: Record<string, string> = {
    info: "text-foreground-secondary",
    warn: "text-warning",
    error: "text-error",
    debug: "text-foreground-muted",
    frida: "text-accent",
    exec: "text-success",
    hook: "text-purple-400",
  };

  const levelIcons: Record<string, string> = {
    info: "i",
    warn: "!",
    error: "✗",
    debug: "·",
    frida: "→",
    exec: "▶",
    hook: "⚡",
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div class="flex items-start gap-2 py-0.5 hover:bg-surface/50">
      <span class="text-foreground-muted shrink-0">
        {formatTime(props.entry.timestamp)}
      </span>
      <span
        class={`w-4 text-center shrink-0 ${levelColors[props.entry.level]}`}
      >
        [{levelIcons[props.entry.level]}]
      </span>
      <span class={`break-all ${levelColors[props.entry.level]}`}>
        {props.entry.message}
      </span>
    </div>
  );
};

export default TestPanel;
