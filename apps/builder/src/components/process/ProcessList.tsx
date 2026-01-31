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
import type { ProcessInfo, ApplicationInfo, AttachMode } from "@/lib/tauri";

// Tab types for view switching
type ViewTab = "processes" | "applications";

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

// Attach mode labels
const ATTACH_MODE_LABELS: Record<AttachMode, string> = {
  pid: "PID",
  name: "Name",
  identifier: "Identifier",
};

export const ProcessList: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [attachingTarget, setAttachingTarget] = createSignal<
    string | number | null
  >(null);
  const [changingDevice, setChangingDevice] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<ViewTab>("processes");

  const processes = () => targetStore.processes() ?? [];
  const applications = () => targetStore.applications() ?? [];
  const devices = () => targetStore.devices() ?? [];
  const isLoading = () =>
    targetStore.processes.loading || targetStore.applications.loading;
  const currentDevice = () => targetStore.currentDeviceId();
  const attachMode = () => targetStore.attachMode();
  const supportsApps = () => targetStore.supportsApplications();

  // Filtered processes
  const filteredProcesses = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processes();
    return processes().filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.pid.toString().includes(query) ||
        p.path?.toLowerCase().includes(query),
    );
  });

  // Filtered applications
  const filteredApplications = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return applications();
    return applications().filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.identifier.toLowerCase().includes(query),
    );
  });

  const handleDeviceChange = async (deviceId: string) => {
    if (deviceId === currentDevice()) return;
    setChangingDevice(true);
    try {
      await targetStore.changeDevice(deviceId);
      // Switch to applications tab for USB devices
      const device = devices().find((d) => d.id === deviceId);
      if (device?.device_type === "usb") {
        setActiveTab("applications");
      } else {
        setActiveTab("processes");
      }
    } catch (error) {
      console.error("Failed to change device:", error);
    } finally {
      setChangingDevice(false);
    }
  };

  // Handle attach based on current mode
  const handleAttachProcess = async (process: ProcessInfo) => {
    const mode = attachMode();
    setAttachingTarget(mode === "pid" ? process.pid : process.name);
    try {
      if (mode === "pid") {
        await targetStore.attach(process.pid);
      } else if (mode === "name") {
        await targetStore.attachName(process.name);
      }
    } catch (error) {
      console.error("Failed to attach:", error);
    } finally {
      setAttachingTarget(null);
    }
  };

  // Handle attach for application (identifier-based)
  const handleAttachApplication = async (
    app: ApplicationInfo,
    spawn: boolean = false,
  ) => {
    setAttachingTarget(app.identifier);
    try {
      if (spawn || !app.pid) {
        await targetStore.spawn(app.identifier);
      } else {
        await targetStore.attachIdentifier(app.identifier);
      }
    } catch (error) {
      console.error("Failed to attach to application:", error);
    } finally {
      setAttachingTarget(null);
    }
  };

  const handleRefresh = () => {
    if (activeTab() === "processes") {
      targetStore.refetchProcesses();
    } else {
      targetStore.refetchApplications();
    }
  };

  const isProcessAttached = (process: ProcessInfo) => {
    return (
      targetStore.attachedPid() === process.pid ||
      targetStore.attachedTarget() === process.name
    );
  };

  const isAppAttached = (app: ApplicationInfo) => {
    return targetStore.attachedTarget() === app.identifier;
  };

  return (
    <div class="flex flex-col h-full" role="region" aria-label="Process list">
      {/* Device Selection */}
      <div class="flex items-center gap-2 p-4 border-b border-border bg-background-secondary">
        <span id="device-label" class="text-sm text-foreground-secondary">
          Device:
        </span>
        <Show
          when={devices().length > 0}
          fallback={
            <span class="text-sm text-foreground-muted" role="status">
              Loading devices...
            </span>
          }
        >
          <div
            class="flex gap-1 flex-wrap"
            role="radiogroup"
            aria-labelledby="device-label"
          >
            <For each={devices()}>
              {(device) => {
                const Icon = getDeviceIcon(device.device_type);
                const isSelected = () => currentDevice() === device.id;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected()}
                    class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isSelected()
                        ? "bg-accent text-white"
                        : "bg-background-tertiary text-foreground-secondary hover:bg-background hover:text-foreground"
                    }`}
                    onClick={() => handleDeviceChange(device.id)}
                    disabled={changingDevice()}
                    aria-label={`${device.name} (${device.device_type})`}
                  >
                    <Icon class="w-4 h-4" aria-hidden="true" />
                    <span>{device.name}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
        <button
          type="button"
          class="btn btn-secondary text-xs py-1 px-2"
          onClick={() => targetStore.refetchDevices()}
          title="Refresh device list"
          aria-label="Refresh device list"
        >
          <IconRefresh class="w-3 h-3" aria-hidden="true" />
        </button>
        <Show when={changingDevice()}>
          <span
            class="text-xs text-foreground-muted"
            role="status"
            aria-live="polite"
          >
            Switching...
          </span>
        </Show>
      </div>

      {/* Tab Selection - Show only when USB device supports applications */}
      <Show when={supportsApps()}>
        <div
          class="flex border-b border-border bg-background-secondary"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === "processes"}
            aria-controls="processes-panel"
            class={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab() === "processes"
                ? "text-accent border-b-2 border-accent"
                : "text-foreground-secondary hover:text-foreground"
            }`}
            onClick={() => setActiveTab("processes")}
          >
            Processes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === "applications"}
            aria-controls="applications-panel"
            class={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab() === "applications"
                ? "text-accent border-b-2 border-accent"
                : "text-foreground-secondary hover:text-foreground"
            }`}
            onClick={() => setActiveTab("applications")}
          >
            Applications
          </button>
        </div>
      </Show>

      {/* Attach Mode Selection - For processes tab only */}
      <Show when={activeTab() === "processes"}>
        <div class="flex items-center gap-2 px-4 py-2 border-b border-border bg-background-tertiary">
          <span class="text-xs text-foreground-secondary">Attach by:</span>
          <div class="flex gap-1" role="radiogroup" aria-label="Attach mode">
            <For each={["pid", "name"] as AttachMode[]}>
              {(mode) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={attachMode() === mode}
                  class={`px-2 py-1 text-xs rounded transition-colors ${
                    attachMode() === mode
                      ? "bg-accent text-white"
                      : "bg-background text-foreground-secondary hover:bg-background-secondary"
                  }`}
                  onClick={() => targetStore.setAttachMode(mode)}
                >
                  {ATTACH_MODE_LABELS[mode]}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Search Header */}
      <div class="flex items-center gap-2 p-4 border-b border-border">
        <div class="relative flex-1">
          <IconSearch
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder={
              activeTab() === "processes"
                ? "Search processes..."
                : "Search applications..."
            }
            class="input pl-9"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            aria-label={
              activeTab() === "processes"
                ? "Search processes by name or PID"
                : "Search applications by name or identifier"
            }
            aria-describedby="item-count"
          />
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          onClick={handleRefresh}
          disabled={isLoading() || !currentDevice()}
          aria-label="Refresh list"
        >
          <IconRefresh
            class={`w-4 h-4 ${isLoading() ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Content Area */}
      <div class="flex-1 overflow-auto">
        <Show
          when={currentDevice()}
          fallback={
            <div class="flex items-center justify-center h-32 text-foreground-muted">
              Select a device to view {activeTab()}
            </div>
          }
        >
          <Show
            when={!isLoading()}
            fallback={
              <div class="flex items-center justify-center h-32 text-foreground-muted">
                Loading {activeTab()}...
              </div>
            }
          >
            {/* Processes Panel */}
            <Show when={activeTab() === "processes"}>
              <div
                id="processes-panel"
                role="tabpanel"
                aria-labelledby="processes-tab"
              >
                <Show
                  when={filteredProcesses().length > 0}
                  fallback={
                    <div class="flex items-center justify-center h-32 text-foreground-muted">
                      No processes found
                    </div>
                  }
                >
                  <table class="w-full" role="grid" aria-label="Process list">
                    <thead class="sticky top-0 bg-background-secondary">
                      <tr class="text-left text-sm text-foreground-secondary">
                        <th scope="col" class="px-4 py-2 font-medium">
                          PID
                        </th>
                        <th scope="col" class="px-4 py-2 font-medium">
                          Name
                        </th>
                        <th scope="col" class="px-4 py-2 font-medium w-24">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={filteredProcesses()}>
                        {(process) => (
                          <ProcessRow
                            process={process}
                            isAttaching={
                              attachingTarget() === process.pid ||
                              attachingTarget() === process.name
                            }
                            isAttached={isProcessAttached(process)}
                            attachMode={attachMode()}
                            onAttach={() => handleAttachProcess(process)}
                          />
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </div>
            </Show>

            {/* Applications Panel */}
            <Show when={activeTab() === "applications"}>
              <div
                id="applications-panel"
                role="tabpanel"
                aria-labelledby="applications-tab"
              >
                <Show
                  when={filteredApplications().length > 0}
                  fallback={
                    <div class="flex items-center justify-center h-32 text-foreground-muted">
                      No applications found
                    </div>
                  }
                >
                  <table
                    class="w-full"
                    role="grid"
                    aria-label="Application list"
                  >
                    <thead class="sticky top-0 bg-background-secondary">
                      <tr class="text-left text-sm text-foreground-secondary">
                        <th scope="col" class="px-4 py-2 font-medium">
                          Name
                        </th>
                        <th scope="col" class="px-4 py-2 font-medium">
                          Identifier
                        </th>
                        <th scope="col" class="px-4 py-2 font-medium w-32">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={filteredApplications()}>
                        {(app) => (
                          <ApplicationRow
                            app={app}
                            isAttaching={attachingTarget() === app.identifier}
                            isAttached={isAppAttached(app)}
                            onAttach={() => handleAttachApplication(app, false)}
                            onSpawn={() => handleAttachApplication(app, true)}
                          />
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </div>

      {/* Footer */}
      <div
        id="item-count"
        class="px-4 py-2 border-t border-border text-sm text-foreground-muted"
        role="status"
        aria-live="polite"
      >
        {activeTab() === "processes"
          ? `${filteredProcesses().length} processes`
          : `${filteredApplications().length} applications`}
        {currentDevice() && ` on ${currentDevice()}`}
      </div>
    </div>
  );
};

interface ProcessRowProps {
  process: ProcessInfo;
  isAttaching: boolean;
  isAttached: boolean;
  attachMode: AttachMode;
  onAttach: () => void;
}

const ProcessRow: Component<ProcessRowProps> = (props) => {
  return (
    <tr
      class={`border-b border-border hover:bg-background-tertiary transition-colors ${
        props.isAttached ? "bg-accent/10" : ""
      }`}
      aria-selected={props.isAttached}
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
            <span class="text-xs text-success font-medium" role="status">
              Attached
            </span>
          }
        >
          <button
            type="button"
            class="btn btn-primary text-xs py-1"
            onClick={props.onAttach}
            disabled={props.isAttaching}
            aria-label={`Attach to ${props.process.name} by ${props.attachMode}`}
            aria-busy={props.isAttaching}
          >
            <Show when={!props.isAttaching} fallback="Attaching...">
              <IconPlay class="w-3 h-3" aria-hidden="true" />
              Attach
            </Show>
          </button>
        </Show>
      </td>
    </tr>
  );
};

interface ApplicationRowProps {
  app: ApplicationInfo;
  isAttaching: boolean;
  isAttached: boolean;
  onAttach: () => void;
  onSpawn: () => void;
}

const ApplicationRow: Component<ApplicationRowProps> = (props) => {
  const isRunning = () => props.app.pid !== undefined && props.app.pid !== null;

  return (
    <tr
      class={`border-b border-border hover:bg-background-tertiary transition-colors ${
        props.isAttached ? "bg-accent/10" : ""
      }`}
      aria-selected={props.isAttached}
    >
      <td class="px-4 py-2 text-sm">
        <span class="text-foreground">{props.app.name}</span>
        <Show when={isRunning()}>
          <span class="ml-2 text-xs text-success">(PID: {props.app.pid})</span>
        </Show>
      </td>
      <td class="px-4 py-2 text-sm">
        <span class="font-mono text-xs text-foreground-secondary">
          {props.app.identifier}
        </span>
      </td>
      <td class="px-4 py-2">
        <Show
          when={!props.isAttached}
          fallback={
            <span class="text-xs text-success font-medium" role="status">
              Attached
            </span>
          }
        >
          <div class="flex gap-1">
            <Show when={isRunning()}>
              <button
                type="button"
                class="btn btn-primary text-xs py-1"
                onClick={props.onAttach}
                disabled={props.isAttaching}
                aria-label={`Attach to ${props.app.name}`}
                aria-busy={props.isAttaching}
              >
                <Show when={!props.isAttaching} fallback="...">
                  <IconPlay class="w-3 h-3" aria-hidden="true" />
                  Attach
                </Show>
              </button>
            </Show>
            <button
              type="button"
              class={`btn text-xs py-1 ${isRunning() ? "btn-secondary" : "btn-primary"}`}
              onClick={props.onSpawn}
              disabled={props.isAttaching}
              aria-label={`Spawn and attach to ${props.app.name}`}
              aria-busy={props.isAttaching}
            >
              <Show when={!props.isAttaching} fallback="...">
                Spawn
              </Show>
            </button>
          </div>
        </Show>
      </td>
    </tr>
  );
};
