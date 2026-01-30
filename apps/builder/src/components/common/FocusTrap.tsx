import { Component, JSX, createEffect, onCleanup } from "solid-js";

interface FocusTrapProps {
  children: JSX.Element;
  active?: boolean;
  restoreFocus?: boolean;
  initialFocus?: string; // CSS selector for initial focus element
}

/**
 * Focus trap component for modals and dialogs.
 * Traps focus within the component when active.
 */
export const FocusTrap: Component<FocusTrapProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let previousActiveElement: HTMLElement | null = null;

  const getFocusableElements = (): HTMLElement[] => {
    if (!containerRef) return [];

    const focusable = containerRef.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled]), ' +
      '[contenteditable="true"]'
    );

    return Array.from(focusable).filter(
      (el) => el.offsetParent !== null // visible elements only
    );
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.active || e.key !== "Tab") return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift + Tab: going backwards
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: going forwards
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  createEffect(() => {
    if (props.active) {
      // Store current active element
      previousActiveElement = document.activeElement as HTMLElement;

      // Set initial focus
      setTimeout(() => {
        if (props.initialFocus && containerRef) {
          const initial = containerRef.querySelector<HTMLElement>(props.initialFocus);
          if (initial) {
            initial.focus();
            return;
          }
        }

        // Default: focus first focusable element
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }, 10);

      // Add event listener
      document.addEventListener("keydown", handleKeyDown);
    }

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus when trap is deactivated
      if (props.restoreFocus !== false && previousActiveElement) {
        previousActiveElement.focus();
      }
    });
  });

  return (
    <div ref={containerRef} class="focus-trap-container">
      {props.children}
    </div>
  );
};

export default FocusTrap;
