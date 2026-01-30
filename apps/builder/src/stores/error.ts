import { createSignal } from "solid-js";

export type ErrorSeverity = "error" | "warning" | "info";

export interface AppError {
  id: string;
  title: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  details?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Error queue
const [errors, setErrors] = createSignal<AppError[]>([]);

// Auto-dismiss timeout (ms)
const AUTO_DISMISS_TIMEOUT: Record<ErrorSeverity, number> = {
  info: 3000,
  warning: 5000,
  error: 0, // Don't auto-dismiss errors
};

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Add error to queue
function addError(
  title: string,
  message: string,
  options: {
    severity?: ErrorSeverity;
    details?: string;
    action?: AppError["action"];
    autoDismiss?: boolean;
  } = {},
): string {
  const {
    severity = "error",
    details,
    action,
    autoDismiss = true,
  } = options;

  const id = generateId();
  const error: AppError = {
    id,
    title,
    message,
    severity,
    timestamp: Date.now(),
    details,
    action,
  };

  setErrors((prev) => [...prev, error]);

  // Auto-dismiss based on severity
  const timeout = AUTO_DISMISS_TIMEOUT[severity];
  if (autoDismiss && timeout > 0) {
    setTimeout(() => {
      dismissError(id);
    }, timeout);
  }

  return id;
}

// Dismiss specific error
function dismissError(id: string): void {
  setErrors((prev) => prev.filter((e) => e.id !== id));
}

// Dismiss all errors
function dismissAll(): void {
  setErrors([]);
}

// Convenience methods
function showError(
  title: string,
  message: string,
  details?: string,
  action?: AppError["action"],
): string {
  return addError(title, message, { severity: "error", details, action });
}

function showWarning(
  title: string,
  message: string,
  details?: string,
): string {
  return addError(title, message, { severity: "warning", details });
}

function showInfo(title: string, message: string): string {
  return addError(title, message, { severity: "info" });
}

// Handle async operation errors
async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorTitle: string,
  options: {
    successMessage?: string;
    rethrow?: boolean;
  } = {},
): Promise<T | null> {
  const { successMessage, rethrow = false } = options;

  try {
    const result = await operation();
    if (successMessage) {
      showInfo("Success", successMessage);
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showError(errorTitle, message);

    if (rethrow) {
      throw err;
    }
    return null;
  }
}

export const errorStore = {
  // State
  errors,

  // Actions
  addError,
  dismissError,
  dismissAll,

  // Convenience methods
  showError,
  showWarning,
  showInfo,

  // Utility
  withErrorHandling,
};
