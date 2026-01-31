import { Component, For, Show, createEffect, onCleanup } from "solid-js";
import {
  hotkeysStore,
  formatHotkey,
  categoryLabels,
  type HotkeyCategory,
} from "@/stores/hotkeys";
import { IconKeyboard, IconX } from "./Icons";

export const HotkeysHelp: Component = () => {
  const isOpen = () => hotkeysStore.isHelpOpen();
  const hotkeysByCategory = () => hotkeysStore.getHotkeysByCategory();

  // Close on Escape
  createEffect(() => {
    if (!isOpen()) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hotkeysStore.closeHelp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  // Focus trap
  let dialogRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (isOpen() && dialogRef) {
      dialogRef.focus();
    }
  });

  const categoryOrder: HotkeyCategory[] = [
    "general",
    "navigation",
    "project",
    "designer",
    "script",
  ];

  return (
    <Show when={isOpen()}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && hotkeysStore.closeHelp()}
        role="presentation"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotkeys-title"
          tabIndex={-1}
          class="bg-background-secondary rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col outline-none"
        >
          {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-border">
            <h2
              id="hotkeys-title"
              class="text-lg font-semibold flex items-center gap-2"
            >
              <IconKeyboard class="w-5 h-5 text-accent" />
              Keyboard Shortcuts
            </h2>
            <button
              class="p-1.5 hover:bg-background-tertiary rounded transition-colors"
              onClick={() => hotkeysStore.closeHelp()}
              aria-label="Close keyboard shortcuts"
            >
              <IconX class="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div class="flex-1 overflow-y-auto p-4 space-y-6">
            <For each={categoryOrder}>
              {(category) => {
                const hotkeys = () => hotkeysByCategory().get(category);
                return (
                  <Show when={hotkeys()?.length}>
                    <section>
                      <h3 class="text-sm font-medium text-foreground-secondary mb-3">
                        {categoryLabels[category]}
                      </h3>
                      <div class="space-y-2">
                        <For each={hotkeys()}>
                          {(hotkey) => (
                            <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-background-tertiary">
                              <span class="text-sm text-foreground">
                                {hotkey.description}
                              </span>
                              <kbd class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-background rounded border border-border text-foreground-secondary">
                                {formatHotkey(hotkey.keys)}
                              </kbd>
                            </div>
                          )}
                        </For>
                      </div>
                    </section>
                  </Show>
                );
              }}
            </For>

            <Show when={hotkeysByCategory().size === 0}>
              <div class="text-center py-8 text-foreground-muted">
                No keyboard shortcuts registered
              </div>
            </Show>
          </div>

          {/* Footer */}
          <div class="p-4 border-t border-border text-center">
            <p class="text-xs text-foreground-muted">
              Press <kbd class="px-1.5 py-0.5 bg-background rounded border border-border font-mono">?</kbd> anytime to show this help
            </p>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default HotkeysHelp;
