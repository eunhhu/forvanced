import { createSignal, createResource } from "solid-js";
import {
  enumerateProcesses,
  attachToProcess,
  detachFromProcess,
  selectAdapter,
} from "@/lib/tauri";

// Current adapter
const [currentAdapterId, setCurrentAdapterId] =
  createSignal<string>("local_pc");

// Connection state
const [sessionId, setSessionId] = createSignal<string | null>(null);
const [attachedPid, setAttachedPid] = createSignal<number | null>(null);

// Process list resource
const [processes, { refetch: refetchProcesses }] = createResource(
  currentAdapterId,
  async () => {
    try {
      return await enumerateProcesses();
    } catch (error) {
      console.error("Failed to enumerate processes:", error);
      return [];
    }
  },
);

// Actions
async function changeAdapter(adapterId: string) {
  try {
    await selectAdapter(adapterId);
    setCurrentAdapterId(adapterId);
    setSessionId(null);
    setAttachedPid(null);
  } catch (error) {
    console.error("Failed to change adapter:", error);
    throw error;
  }
}

async function attach(pid: number) {
  try {
    const id = await attachToProcess(pid);
    setSessionId(id);
    setAttachedPid(pid);
    return id;
  } catch (error) {
    console.error("Failed to attach to process:", error);
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
  } catch (error) {
    console.error("Failed to detach from process:", error);
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
  currentAdapterId,
  sessionId,
  attachedPid,
  processes,

  // Actions
  changeAdapter,
  attach,
  detach,
  refetchProcesses,

  // Computed
  isAttached,
  currentSession,
};
