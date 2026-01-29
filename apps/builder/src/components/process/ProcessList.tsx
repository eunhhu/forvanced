import { Component, For, Show, createSignal, createMemo } from "solid-js";
import { targetStore } from "@/stores/target";
import { IconRefresh, IconSearch, IconPlay } from "@/components/common/Icons";
import type { ProcessInfo } from "@/lib/tauri";

export const ProcessList: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [attachingPid, setAttachingPid] = createSignal<number | null>(null);

  const processes = () => targetStore.processes() ?? [];
  const isLoading = () => targetStore.processes.loading;

  const filteredProcesses = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processes();
    return processes().filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.pid.toString().includes(query)
    );
  });

  const handleAttach = async (pid: number) => {
    setAttachingPid(pid);
    try {
      await targetStore.attach(pid);
    } catch (error) {
      console.error("Failed to attach:", error);
    } finally {
      setAttachingPid(null);
    }
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center gap-2 p-4 border-b border-border">
        <div class="relative flex-1">
          <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search processes..."
            class="input pl-9"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>
        <button
          class="btn btn-secondary"
          onClick={() => targetStore.refetchProcesses()}
          disabled={isLoading()}
        >
          <IconRefresh class={`w-4 h-4 ${isLoading() ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Process list */}
      <div class="flex-1 overflow-auto">
        <Show
          when={!isLoading()}
          fallback={
            <div class="flex items-center justify-center h-32 text-foreground-muted">
              Loading processes...
            </div>
          }
        >
          <Show
            when={filteredProcesses().length > 0}
            fallback={
              <div class="flex items-center justify-center h-32 text-foreground-muted">
                No processes found
              </div>
            }
          >
            <table class="w-full">
              <thead class="sticky top-0 bg-background-secondary">
                <tr class="text-left text-sm text-foreground-secondary">
                  <th class="px-4 py-2 font-medium">PID</th>
                  <th class="px-4 py-2 font-medium">Name</th>
                  <th class="px-4 py-2 font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                <For each={filteredProcesses()}>
                  {(process) => (
                    <ProcessRow
                      process={process}
                      isAttaching={attachingPid() === process.pid}
                      isAttached={targetStore.attachedPid() === process.pid}
                      onAttach={() => handleAttach(process.pid)}
                    />
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </Show>
      </div>

      {/* Footer */}
      <div class="px-4 py-2 border-t border-border text-sm text-foreground-muted">
        {filteredProcesses().length} processes
      </div>
    </div>
  );
};

interface ProcessRowProps {
  process: ProcessInfo;
  isAttaching: boolean;
  isAttached: boolean;
  onAttach: () => void;
}

const ProcessRow: Component<ProcessRowProps> = (props) => {
  return (
    <tr
      class={`border-b border-border hover:bg-background-tertiary transition-colors ${
        props.isAttached ? "bg-accent/10" : ""
      }`}
    >
      <td class="px-4 py-2 font-mono text-sm text-foreground-secondary">
        {props.process.pid}
      </td>
      <td class="px-4 py-2 text-sm">
        <span class="text-foreground">{props.process.name}</span>
        <Show when={props.process.path}>
          <span class="block text-xs text-foreground-muted truncate max-w-md">
            {props.process.path}
          </span>
        </Show>
      </td>
      <td class="px-4 py-2">
        <Show
          when={!props.isAttached}
          fallback={
            <span class="text-xs text-success font-medium">Attached</span>
          }
        >
          <button
            class="btn btn-primary text-xs py-1"
            onClick={props.onAttach}
            disabled={props.isAttaching}
          >
            <Show when={!props.isAttaching} fallback="Attaching...">
              <IconPlay class="w-3 h-3" />
              Attach
            </Show>
          </button>
        </Show>
      </td>
    </tr>
  );
};
