import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
} from "solid-js";
import { targetStore } from "@/stores/target";
import { scriptStore, getNodeContext } from "@/stores/script";
import { designerStore } from "@/stores/designer";
import { compileVisualScript, CompileResult } from "@/lib/script-compiler";
import { injectScript, unloadScript } from "@/lib/tauri";

// ============================================
// Types
// ============================================

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

// ============================================
// TestPanel Component
// ============================================

export const TestPanel: Component = () => {
  // State
  const [selectedScriptId, setSelectedScriptId] = createSignal<string | null>(
    null,
  );
  const [compileResult, setCompileResult] = createSignal<CompileResult | null>(
    null,
  );
  const [isRunning, setIsRunning] = createSignal(false);
  const [injectedScriptId, setInjectedScriptId] = createSignal<string | null>(
    null,
  );
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [showCode, setShowCode] = createSignal(false);

  // Derived state
  const scripts = () => scriptStore.scripts();
  const sessionId = () => targetStore.sessionId();
  const uiComponents = () => designerStore.components();

  const selectedScript = createMemo(() => {
    const id = selectedScriptId();
    if (!id) return null;
    return scripts().find((s) => s.id === id) ?? null;
  });

  // Check if the script has any target nodes (requires Frida session)
  const hasTargetNodes = createMemo(() => {
    const script = selectedScript();
    if (!script) return false;
    return script.nodes.some((node) => getNodeContext(node.type) === "target");
  });

  // Script can only run if:
  // - For scripts with target nodes: need Frida session
  // - For host-only scripts: can run without session
  const canRun = createMemo(() => {
    const script = selectedScript();
    const result = compileResult();
    if (!script || result?.success !== true || isRunning()) return false;

    // If script has target nodes, require Frida session
    if (hasTargetNodes() && !sessionId()) return false;

    return true;
  });

  // Reason why script cannot run
  const cannotRunReason = createMemo(() => {
    if (!selectedScript()) return "No script selected";
    if (compileResult()?.success !== true) return "Script not compiled";
    if (isRunning()) return "Script is running";
    if (hasTargetNodes() && !sessionId()) return "Attach to process first (script uses target nodes)";
    return null;
  });

  // Auto-select first script if none selected
  createEffect(() => {
    const allScripts = scripts();
    if (allScripts.length > 0 && !selectedScriptId()) {
      setSelectedScriptId(allScripts[0].id);
    }
  });

  // Actions
  const handleCompile = () => {
    const script = selectedScript();
    if (!script) return;

    addLog("info", `Compiling script: ${script.name}`);
    const result = compileVisualScript(script, uiComponents());
    setCompileResult(result);

    if (result.success) {
      addLog("info", "Compilation successful");
      for (const warning of result.warnings) {
        addLog("warn", warning);
      }
    } else {
      addLog("error", "Compilation failed");
      for (const error of result.errors) {
        addLog("error", error.message);
      }
    }
  };

  const handleRun = async () => {
    const session = sessionId();
    const result = compileResult();

    if (!session || !result?.success) return;

    setIsRunning(true);
    addLog("info", "Injecting script...");

    try {
      const scriptId = await injectScript(session, result.code);
      setInjectedScriptId(scriptId);
      addLog("info", `Script injected successfully (ID: ${scriptId})`);
    } catch (error) {
      addLog("error", `Failed to inject script: ${error}`);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    const session = sessionId();
    const scriptId = injectedScriptId();

    if (!session || !scriptId) return;

    addLog("info", "Unloading script...");

    try {
      await unloadScript(session, scriptId);
      setInjectedScriptId(null);
      setIsRunning(false);
      addLog("info", "Script unloaded");
    } catch (error) {
      addLog("error", `Failed to unload script: ${error}`);
    }
  };

  const addLog = (level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
    };
    setLogs((prev) => [...prev, entry].slice(-100)); // Keep last 100 logs
  };

  const clearLogs = () => setLogs([]);

  return (
    <div class="flex flex-col h-full bg-surface">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 class="text-lg font-semibold text-text-primary">Script Testing</h2>
        <ConnectionStatus />
      </div>

      {/* Script Selector */}
      <div class="px-4 py-3 border-b border-border">
        <label class="block text-xs text-text-tertiary mb-1">
          Select Script
        </label>
        <select
          class="w-full px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary"
          value={selectedScriptId() ?? ""}
          onChange={(e) => setSelectedScriptId(e.currentTarget.value || null)}
        >
          <option value="">-- Select a script --</option>
          <For each={scripts()}>
            {(script) => <option value={script.id}>{script.name}</option>}
          </For>
        </select>
      </div>

      {/* Script Info */}
      <Show when={selectedScript()}>
        <div class="px-4 py-2 border-b border-border bg-surface-raised">
          <div class="flex items-center gap-3 text-xs">
            <span class="text-text-tertiary">
              {selectedScript()?.nodes.length} nodes
            </span>
            <Show when={hasTargetNodes()}>
              <span class="px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                Requires Frida
              </span>
            </Show>
            <Show when={!hasTargetNodes()}>
              <span class="px-1.5 py-0.5 rounded bg-success/20 text-success">
                Host-only
              </span>
            </Show>
          </div>
        </div>
      </Show>

      {/* Controls */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          class="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
          onClick={handleCompile}
          disabled={!selectedScript()}
        >
          Compile
        </button>

        <Show when={!isRunning()}>
          <button
            class="px-3 py-1.5 text-sm rounded bg-success text-white hover:bg-success/90 disabled:opacity-50"
            onClick={handleRun}
            disabled={!canRun()}
            title={cannotRunReason() ?? undefined}
          >
            Run
          </button>
        </Show>

        <Show when={isRunning()}>
          <button
            class="px-3 py-1.5 text-sm rounded bg-error text-white hover:bg-error/90"
            onClick={handleStop}
          >
            Stop
          </button>
        </Show>

        <div class="flex-1" />

        <Show when={cannotRunReason() && !isRunning()}>
          <span class="text-xs text-text-tertiary">{cannotRunReason()}</span>
        </Show>

        <button
          class={`px-2 py-1 text-xs rounded ${
            showCode() ? "bg-accent text-white" : "bg-surface-raised text-text-secondary"
          }`}
          onClick={() => setShowCode(!showCode())}
        >
          {showCode() ? "Hide Code" : "Show Code"}
        </button>
      </div>

      {/* Compile Result / Code Preview */}
      <Show when={showCode() && compileResult()}>
        <div class="flex-1 max-h-[300px] overflow-auto bg-background p-4 border-b border-border">
          <pre class="text-xs font-mono text-text-secondary whitespace-pre-wrap">
            {compileResult()?.code}
          </pre>
        </div>
      </Show>

      {/* Console Output */}
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-raised">
          <span class="text-sm font-medium text-text-secondary">Console</span>
          <button
            class="text-xs text-text-tertiary hover:text-text-secondary"
            onClick={clearLogs}
          >
            Clear
          </button>
        </div>
        <div class="flex-1 overflow-auto p-2 bg-background">
          <For each={logs()}>
            {(entry) => <LogLine entry={entry} />}
          </For>
          <Show when={logs().length === 0}>
            <div class="text-xs text-text-tertiary text-center py-4">
              No logs yet
            </div>
          </Show>
        </div>
      </div>

      {/* Status Footer */}
      <div class="px-4 py-2 border-t border-border text-xs text-text-tertiary flex items-center justify-between">
        <span>
          {isRunning() ? "Script running" : "Idle"}
        </span>
        <Show when={compileResult()}>
          <span
            class={
              compileResult()?.success ? "text-success" : "text-error"
            }
          >
            {compileResult()?.success
              ? `Compiled (${compileResult()?.warnings.length ?? 0} warnings)`
              : `${compileResult()?.errors.length ?? 0} errors`}
          </span>
        </Show>
      </div>
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

const ConnectionStatus: Component = () => {
  const sessionId = () => targetStore.sessionId();
  const attachedPid = () => targetStore.attachedPid();

  return (
    <div class="flex items-center gap-2">
      <div
        class={`w-2 h-2 rounded-full ${
          sessionId() ? "bg-success" : "bg-error"
        }`}
      />
      <span class="text-sm text-text-secondary">
        {sessionId()
          ? `Attached (PID: ${attachedPid()})`
          : "Not attached"}
      </span>
    </div>
  );
};

interface LogLineProps {
  entry: LogEntry;
}

const LogLine: Component<LogLineProps> = (props) => {
  const levelColors: Record<string, string> = {
    info: "text-text-secondary",
    warn: "text-warning",
    error: "text-error",
    debug: "text-text-tertiary",
  };

  const levelIcons: Record<string, string> = {
    info: "i",
    warn: "!",
    error: "x",
    debug: "d",
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
    <div class="flex items-start gap-2 py-0.5 font-mono text-xs">
      <span class="text-text-tertiary">{formatTime(props.entry.timestamp)}</span>
      <span
        class={`w-4 text-center ${levelColors[props.entry.level]}`}
      >
        [{levelIcons[props.entry.level]}]
      </span>
      <span class={levelColors[props.entry.level]}>{props.entry.message}</span>
    </div>
  );
};

export default TestPanel;
