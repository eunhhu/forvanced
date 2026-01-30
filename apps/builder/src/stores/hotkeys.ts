import { createSignal } from "solid-js";

export interface Hotkey {
  id: string;
  keys: string[]; // e.g., ["Ctrl", "S"] or ["Cmd", "S"] or ["Delete"] or ["Backspace"]
  description: string;
  category: HotkeyCategory;
  action: () => void;
  enabled?: () => boolean;
  global?: boolean; // Works even when input is focused
}

export type HotkeyCategory =
  | "general"
  | "navigation"
  | "project"
  | "designer"
  | "script"
  | "target";

// Detect OS
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Hotkey registry
const [registeredHotkeys, setRegisteredHotkeys] = createSignal<Hotkey[]>([]);
const [isHelpOpen, setIsHelpOpen] = createSignal(false);

// Format key for display
export function formatKey(key: string): string {
  if (isMac) {
    return key
      .replace("Ctrl", "⌃")
      .replace("Alt", "⌥")
      .replace("Shift", "⇧")
      .replace("Cmd", "⌘")
      .replace("Meta", "⌘");
  }
  return key.replace("Meta", "Ctrl").replace("Cmd", "Ctrl");
}

// Format hotkey for display
export function formatHotkey(keys: string[]): string {
  return keys.map(formatKey).join(isMac ? "" : "+");
}

// Check if a keyboard event matches a hotkey
function matchesHotkey(event: KeyboardEvent, keys: string[]): boolean {
  const modifiers = {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    cmd: isMac ? event.metaKey : event.ctrlKey,
  };

  const keyLower = event.key.toLowerCase();
  const requiredModifiers = new Set<string>();
  let requiredKey = "";

  for (const k of keys) {
    const kLower = k.toLowerCase();
    if (
      kLower === "ctrl" ||
      kLower === "control" ||
      kLower === "cmd" ||
      kLower === "meta"
    ) {
      requiredModifiers.add("cmd");
    } else if (kLower === "alt" || kLower === "option") {
      requiredModifiers.add("alt");
    } else if (kLower === "shift") {
      requiredModifiers.add("shift");
    } else {
      requiredKey = kLower;
    }
  }

  // Check modifiers
  const cmdRequired = requiredModifiers.has("cmd");
  const altRequired = requiredModifiers.has("alt");
  const shiftRequired = requiredModifiers.has("shift");

  const cmdMatch = cmdRequired === modifiers.cmd;
  const altMatch = altRequired === modifiers.alt;
  const shiftMatch = shiftRequired === modifiers.shift;

  // Key match - special handling for Delete/Backspace
  let keyMatch = false;
  if (requiredKey === "delete" || requiredKey === "backspace") {
    // On macOS: Delete key sends "Backspace", Fn+Delete sends "Delete"
    // On Windows: Delete sends "Delete", Backspace sends "Backspace"
    // We want both to work for deletion, so match either
    keyMatch = keyLower === "delete" || keyLower === "backspace";
  } else {
    keyMatch =
      keyLower === requiredKey ||
      event.code.toLowerCase() === `key${requiredKey}` ||
      event.code.toLowerCase() === requiredKey;
  }

  return cmdMatch && altMatch && shiftMatch && keyMatch;
}

// Handle keydown events
function handleKeyDown(event: KeyboardEvent) {
  // Don't handle if in an input field (unless global)
  const target = event.target as HTMLElement;
  const isInputField =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  for (const hotkey of registeredHotkeys()) {
    // Skip if in input and not global
    if (isInputField && !hotkey.global) continue;

    // Skip if disabled
    if (hotkey.enabled && !hotkey.enabled()) continue;

    if (matchesHotkey(event, hotkey.keys)) {
      event.preventDefault();
      event.stopPropagation();
      hotkey.action();
      return;
    }
  }
}

// Register a hotkey
function registerHotkey(hotkey: Hotkey): () => void {
  // Prevent duplicate registration
  setRegisteredHotkeys((prev) => {
    // Remove existing hotkey with same id before adding
    const filtered = prev.filter((h) => h.id !== hotkey.id);
    return [...filtered, hotkey];
  });

  // Return unregister function
  return () => {
    setRegisteredHotkeys((prev) => prev.filter((h) => h.id !== hotkey.id));
  };
}

// Register multiple hotkeys
function registerHotkeys(hotkeys: Hotkey[]): () => void {
  const unregisters = hotkeys.map((h) => registerHotkey(h));
  return () => unregisters.forEach((u) => u());
}

// Get hotkeys by category
function getHotkeysByCategory(): Map<HotkeyCategory, Hotkey[]> {
  const map = new Map<HotkeyCategory, Hotkey[]>();
  for (const hotkey of registeredHotkeys()) {
    const list = map.get(hotkey.category) || [];
    list.push(hotkey);
    map.set(hotkey.category, list);
  }
  return map;
}

// Initialize global listener
let initialized = false;
function initializeHotkeyListener() {
  if (initialized) return;
  initialized = true;

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeyDown);
  }
}

// Cleanup listener
function cleanupHotkeyListener() {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleKeyDown);
  }
  initialized = false;
}

// Toggle help panel
function toggleHelp() {
  setIsHelpOpen(!isHelpOpen());
}

function openHelp() {
  setIsHelpOpen(true);
}

function closeHelp() {
  setIsHelpOpen(false);
}

// Export store
export const hotkeysStore = {
  // State
  registeredHotkeys,
  isHelpOpen,
  isMac,

  // Actions
  registerHotkey,
  registerHotkeys,
  initializeHotkeyListener,
  cleanupHotkeyListener,
  toggleHelp,
  openHelp,
  closeHelp,

  // Computed
  getHotkeysByCategory,
};

// Category labels for display
export const categoryLabels: Record<HotkeyCategory, string> = {
  general: "General",
  navigation: "Navigation",
  project: "Project",
  designer: "Designer",
  script: "Script",
  target: "Target",
};
