import { Component, For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { errorStore, type AppError, type ErrorSeverity } from "@/stores/error";
import {
  IconX,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfo,
  IconChevronDown,
  IconChevronUp,
} from "./Icons";

const severityConfig: Record<
  ErrorSeverity,
  {
    icon: Component<{ class?: string }>;
    bgColor: string;
    borderColor: string;
    textColor: string;
    iconColor: string;
  }
> = {
  error: {
    icon: IconAlertCircle,
    bgColor: "bg-error/10",
    borderColor: "border-error/30",
    textColor: "text-error",
    iconColor: "text-error",
  },
  warning: {
    icon: IconAlertTriangle,
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    textColor: "text-warning",
    iconColor: "text-warning",
  },
  info: {
    icon: IconInfo,
    bgColor: "bg-accent/10",
    borderColor: "border-accent/30",
    textColor: "text-accent",
    iconColor: "text-accent",
  },
};

interface ErrorItemProps {
  error: AppError;
  onDismiss: () => void;
}

const ErrorItem: Component<ErrorItemProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const config = () => severityConfig[props.error.severity];

  return (
    <div
      class={`${config().bgColor} ${config().borderColor} border rounded-lg shadow-lg overflow-hidden animate-slide-in`}
      role="alert"
    >
      <div class="p-3">
        <div class="flex items-start gap-3">
          {/* Icon */}
          <div class={`flex-shrink-0 mt-0.5 ${config().iconColor}`}>
            <Dynamic component={config().icon} class="w-5 h-5" />
          </div>

          {/* Content */}
          <div class="flex-1 min-w-0">
            <h4 class={`text-sm font-medium ${config().textColor}`}>
              {props.error.title}
            </h4>
            <p class="mt-1 text-sm text-foreground-secondary">
              {props.error.message}
            </p>

            {/* Details (expandable) */}
            <Show when={props.error.details}>
              <button
                type="button"
                class="mt-2 flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground-secondary transition-colors"
                onClick={() => setExpanded(!expanded())}
              >
                <Show
                  when={expanded()}
                  fallback={<IconChevronDown class="w-3 h-3" />}
                >
                  <IconChevronUp class="w-3 h-3" />
                </Show>
                <span>{expanded() ? "Hide details" : "Show details"}</span>
              </button>
              <Show when={expanded()}>
                <pre class="mt-2 p-2 bg-background/50 rounded text-xs text-foreground-muted overflow-x-auto max-h-32 overflow-y-auto">
                  {props.error.details}
                </pre>
              </Show>
            </Show>

            {/* Action button */}
            <Show when={props.error.action}>
              <button
                type="button"
                class={`mt-2 text-sm font-medium ${config().textColor} hover:underline`}
                onClick={props.error.action?.onClick}
              >
                {props.error.action?.label}
              </button>
            </Show>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            class="flex-shrink-0 p-1 rounded hover:bg-background/50 text-foreground-muted hover:text-foreground transition-colors"
            onClick={props.onDismiss}
            aria-label="Dismiss"
          >
            <IconX class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ErrorAlert: Component = () => {
  const errors = () => errorStore.errors();

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      <For each={errors()}>
        {(error) => (
          <div class="pointer-events-auto">
            <ErrorItem
              error={error}
              onDismiss={() => errorStore.dismissError(error.id)}
            />
          </div>
        )}
      </For>
    </div>
  );
};

// CSS animation (add to global styles or use inline)
// Add this to your global CSS:
// @keyframes slide-in {
//   from { transform: translateX(100%); opacity: 0; }
//   to { transform: translateX(0); opacity: 1; }
// }
// .animate-slide-in { animation: slide-in 0.2s ease-out; }
