import { createSignal, createResource } from "solid-js";
import {
  listDevices,
  selectDevice,
  enumerateProcesses,
  attachToProcess,
  detachFromProcess,
} from "@/lib/tauri";
import { errorStore } from "./error";

// Current device
const [currentDeviceId, setCurrentDeviceId] = createSignal<string | null>(null);

// Connection state
const [sessionId, setSessionId] = createSignal<string | null>(null);
const [attachedPid, setAttachedPid] = createSignal<number | null>(null);

// Device list resource
const [devices, { refetch: refetchDevices }] = createResource(async () => {
  try {
    return await listDevices();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to list devices:", error);
    errorStore.showError("Device List Failed", message);
    return [];
  }
});

// Process list resource - depends on currentDeviceId
const [processes, { refetch: refetchProcesses }] = createResource(
  currentDeviceId,
  async (deviceId) => {
    if (!deviceId) return [];
    try {
      return await enumerateProcesses();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to enumerate processes:", error);
      errorStore.showError("Process Enumeration Failed", message);
      return [];
    }
  },
);

// Actions
async function changeDevice(deviceId: string) {
  try {
    await selectDevice(deviceId);
    setCurrentDeviceId(deviceId);
    setSessionId(null);
    setAttachedPid(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to change device:", error);
    errorStore.showError("Device Change Failed", message);
    throw error;
  }
}

async function attach(pid: number) {
  try {
    const id = await attachToProcess(pid);
    setSessionId(id);
    setAttachedPid(pid);
    errorStore.showInfo("Attached", `Successfully attached to process ${pid}`);
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to attach to process:", error);
    errorStore.showError(
      "Attach Failed",
      `Failed to attach to process ${pid}`,
      message,
    );
    throw error;
  }
}

async function detach() {
  const id = sessionId();
  if (!id) return;

  try {
    await detachFromProcess(id);
    setSessionId(null);
    setAttachedPid(null);
    errorStore.showInfo("Detached", "Successfully detached from process");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to detach from process:", error);
    errorStore.showError("Detach Failed", message);
    throw error;
  }
}

// Computed
function isAttached() {
  return sessionId() !== null;
}

// Alias for scripts panel
function currentSession() {
  return sessionId();
}

export const targetStore = {
  // State
  currentDeviceId,
  sessionId,
  attachedPid,
  devices,
  processes,

  // Actions
  changeDevice,
  attach,
  detach,
  refetchDevices,
  refetchProcesses,

  // Computed
  isAttached,
  currentSession,
};
