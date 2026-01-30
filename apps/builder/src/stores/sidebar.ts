import { createSignal, createRoot, createEffect } from "solid-js";

// OS detection helper
async function getOS(): Promise<string> {
  if (
    typeof window === "undefined" ||
    !("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  ) {
    return "unknown";
  }
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    return platform();
  } catch {
    return "unknown";
  }
}

function createSidebarStore() {
  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const [currentOS, setCurrentOS] = createSignal<string>("unknown");
  const [initialized, setInitialized] = createSignal(false);

  // Width constants
  const SIDEBAR_WIDTH_EXPANDED = 240;
  const SIDEBAR_WIDTH_COLLAPSED = 56;

  // Initialize immediately (not in onMount since this is a store)
  async function initialize() {
    if (initialized()) return;

    const os = await getOS();
    setCurrentOS(os);

    // Load saved state from localStorage
    try {
      const savedCollapsed = localStorage.getItem("sidebar-collapsed");
      if (savedCollapsed !== null) {
        setIsCollapsed(savedCollapsed === "true");
      }
    } catch {
      // localStorage not available (SSR or privacy mode)
    }

    setInitialized(true);
  }

  // Start initialization
  initialize();

  // Persist collapse state
  createEffect(() => {
    if (!initialized()) return;
    const collapsed = isCollapsed();
    try {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
    } catch {
      // localStorage not available
    }
  });

  function toggle() {
    setIsCollapsed((prev) => !prev);
  }

  function expand() {
    setIsCollapsed(false);
  }

  function collapse() {
    setIsCollapsed(true);
  }

  // Check if current platform is macOS (for native sidebar behavior)
  function isMacOS(): boolean {
    return currentOS() === "macos";
  }

  return {
    isCollapsed,
    currentOS,
    initialized,
    isMacOS,
    toggle,
    expand,
    collapse,
    SIDEBAR_WIDTH_EXPANDED,
    SIDEBAR_WIDTH_COLLAPSED,
  };
}

export const sidebarStore = createRoot(createSidebarStore);
