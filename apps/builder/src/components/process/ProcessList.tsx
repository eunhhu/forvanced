import { Component, For, Show, createSignal, createMemo } from "solid-js";
import { targetStore } from "@/stores/target";
import {
  IconRefresh,
  IconSearch,
  IconPlay,
  IconMonitor,
  IconUsb,
  IconGlobe,
} from "@/components/common/Icons";
import type { ProcessInfo } from "@/lib/tauri";

// Get icon for device type
const getDeviceIcon = (deviceType: string) => {
  switch (deviceType) {
    case "local":
      return IconMonitor;
    case "usb":
      return IconUsb;
    case "remote":
      return IconGlobe;
    default:
      return IconMonitor;
  }
};

export const ProcessList: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [attachingPid, setAttachingPid] = createSignal<number | null>(null);
  const [changingDevice, setChangingDevice] = createSignal(false);

  const processes = () => targetStore.processes() ?? [];
  const devices = () => targetStore.devices() ?? [];
  const isLoading = () => targetStore.processes.loading;
  const currentDevice = () => targetStore.currentDeviceId();

  const filteredProcesses = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processes();
    return processes().filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.pid.toString().includes(query),
    );
  });

  const handleDeviceChange = async (deviceId: string) => {
    if (deviceId === currentDevice()) return;
    setChangingDevice(true);
    try {
      await targetStore.changeDevice(deviceId);
    } catch (error) {
      console.error("Failed to change device:", error);
    } finally {
      setChangingDevice(false);
    }
  };

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
      {/* Device Selection */}
      <div class="flex items-center gap-2 p-4 border-b border-border bg-background-secondary">
        <span class="text-sm text-foreground-secondary">Device:</span>
        <Show
          when={devices().length > 0}
          fallback={
            <span class="text-sm text-foreground-muted">Loading devices...</span>
          }
        >
          <div class="flex gap-1 flex-wrap">
            <For each={devices()}>
              {(device) => {
                const Icon = getDeviceIcon(device.device_type);
                return (
                  <button
                    class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      currentDevice() === device.id
                        ? "bg-accent text-white"
                        : "bg-background-tertiary text-foreground-secondary hover:bg-background hover:text-foreground"
                    }`}
                    onClick={() => handleDeviceChange(device.id)}
                    disabled={changingDevice()}
                  >
                    <Icon class="w-4 h-4" />
                    <span>{device.name}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
        <button
          class="btn btn-secondary text-xs py-1 px-2"
          onClick={() => targetStore.refetchDevices()}
          title="Refresh device list"
        >
          <IconRefresh class="w-3 h-3" />
        </button>
        <Show when={changingDevice()}>
          <span class="text-xs text-foreground-muted">Switching...</span>
        </Show>
      </div>

      {/* Search Header */}
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
          disabled={isLoading() || !currentDevice()}
        >
          <IconRefresh class={`w-4 h-4 ${isLoading() ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Process list */}
      <div class="flex-1 overflow-auto">
        <Show
          when={currentDevice()}
          fallback={
            <div class="flex items-center justify-center h-32 text-foreground-muted">
              Select a device to view processes
            </div>
          }
        >
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
        </Show>
      </div>

      {/* Footer */}
      <div class="px-4 py-2 border-t border-border text-sm text-foreground-muted">
        {filteredProcesses().length} processes
        {currentDevice() && ` on ${currentDevice()}`}
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
