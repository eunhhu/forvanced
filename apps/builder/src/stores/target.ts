import { createSignal, createResource } from "solid-js";
import {
  listDevices,
  selectDevice,
  enumerateProcesses,
  enumerateApplications,
  attachToProcess,
  attachByName,
  attachByIdentifier,
  spawnAndAttach,
  detachFromProcess,
} from "@/lib/tauri";
import type { AttachMode } from "@/lib/tauri";
import { errorStore } from "./error";

// Current device
const [currentDeviceId, setCurrentDeviceId] = createSignal<string | null>(null);

// Attach mode: "pid" | "name" | "identifier"
const [attachMode, setAttachMode] = createSignal<AttachMode>("pid");

// Connection state
const [sessionId, setSessionId] = createSignal<string | null>(null);
const [attachedPid, setAttachedPid] = createSignal<number | null>(null);
const [attachedTarget, setAttachedTarget] = createSignal<string | null>(null);

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

// Application list resource - for mobile/USB devices
const [applications, { refetch: refetchApplications }] = createResource(
  currentDeviceId,
  async (deviceId) => {
    if (!deviceId) return [];
    try {
      return await enumerateApplications();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to enumerate applications:", error);
      // Don't show error for local devices (they don't support applications)
      if (!message.includes("not supported")) {
        errorStore.showError("Application Enumeration Failed", message);
      }
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
    setAttachedTarget(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to change device:", error);
    errorStore.showError("Device Change Failed", message);
    throw error;
  }
}

// Attach by PID
async function attach(pid: number) {
  try {
    const id = await attachToProcess(pid);
    setSessionId(id);
    setAttachedPid(pid);
    setAttachedTarget(null);
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

// Attach by process name
async function attachName(name: string) {
  try {
    const id = await attachByName(name);
    setSessionId(id);
    setAttachedPid(null);
    setAttachedTarget(name);
    errorStore.showInfo("Attached", `Successfully attached to "${name}"`);
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to attach by name:", error);
    errorStore.showError(
      "Attach Failed",
      `Failed to attach to "${name}"`,
      message,
    );
    throw error;
  }
}

// Attach by bundle identifier (for mobile apps)
async function attachIdentifier(identifier: string) {
  try {
    const id = await attachByIdentifier(identifier);
    setSessionId(id);
    setAttachedPid(null);
    setAttachedTarget(identifier);
    errorStore.showInfo("Attached", `Successfully attached to "${identifier}"`);
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to attach by identifier:", error);
    errorStore.showError(
      "Attach Failed",
      `Failed to attach to "${identifier}"`,
      message,
    );
    throw error;
  }
}

// Spawn and attach (for apps not running)
async function spawn(identifier: string) {
  try {
    const id = await spawnAndAttach(identifier);
    setSessionId(id);
    setAttachedPid(null);
    setAttachedTarget(identifier);
    errorStore.showInfo("Spawned", `Successfully spawned and attached to "${identifier}"`);
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to spawn and attach:", error);
    errorStore.showError(
      "Spawn Failed",
      `Failed to spawn "${identifier}"`,
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
    setAttachedTarget(null);
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

// Check if current device supports applications (USB/mobile devices)
function supportsApplications() {
  const deviceId = currentDeviceId();
  if (!deviceId) return false;
  const device = devices()?.find((d) => d.id === deviceId);
  return device?.device_type === "usb";
}

export const targetStore = {
  // State
  currentDeviceId,
  sessionId,
  attachedPid,
  attachedTarget,
  attachMode,
  devices,
  processes,
  applications,

  // Actions
  changeDevice,
  attach,
  attachName,
  attachIdentifier,
  spawn,
  detach,
  setAttachMode,
  refetchDevices,
  refetchProcesses,
  refetchApplications,

  // Computed
  isAttached,
  currentSession,
  supportsApplications,
};
