import {
  Component,
  createSignal,
  Show,
  For,
  createEffect,
  untrack,
} from "solid-js";
import { IconSettings, IconFolder } from "@/components/common/Icons";

// Check if running in Tauri environment
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  defaultAdapter: string;
  autoAttach: boolean;
  showProcessPath: boolean;
  defaultOutputDir: string;
  recentProjectsLimit: number;
}

const defaultSettings: AppSettings = {
  theme: "dark",
  defaultAdapter: "local_pc",
  autoAttach: false,
  showProcessPath: true,
  defaultOutputDir: "./dist",
  recentProjectsLimit: 10,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: Component<SettingsModalProps> = (props) => {
  const [settings, setSettings] = createSignal<AppSettings>(loadSettings());
  const [activeSection, setActiveSection] = createSignal("general");

  function loadSettings(): AppSettings {
    if (typeof localStorage === "undefined") return defaultSettings;
    const stored = localStorage.getItem("forvanced-settings");
    if (stored) {
      try {
        return { ...defaultSettings, ...JSON.parse(stored) };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  function saveSettings() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("forvanced-settings", JSON.stringify(settings()));
    }
    props.onClose();
  }

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const handleSelectOutputDir = async () => {
    try {
      if (!isTauri()) {
        updateSetting("defaultOutputDir", "/mock/output/directory");
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Default Output Directory",
      });
      if (selected && typeof selected === "string") {
        updateSetting("defaultOutputDir", selected);
      }
    } catch (e) {
      console.error("Failed to select directory:", e);
    }
  };

  const sections = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "build", label: "Build" },
    { id: "advanced", label: "Advanced" },
  ];

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          class="bg-surface rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col"
        >
          {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-border">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <IconSettings class="w-5 h-5" />
              Settings
            </h2>
            <button
              class="p-1 hover:bg-surface-hover rounded text-xl leading-none"
              onClick={props.onClose}
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div class="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div class="w-48 border-r border-border p-2 space-y-1">
              <For each={sections}>
                {(section) => (
                  <button
                    class={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      activeSection() === section.id
                        ? "bg-accent text-white"
                        : "hover:bg-surface-hover"
                    }`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </button>
                )}
              </For>
            </div>

            {/* Settings Panel */}
            <div class="flex-1 p-4 overflow-y-auto">
              <Show when={activeSection() === "general"}>
                <div class="space-y-6">
                  <h3 class="text-sm font-medium text-foreground-muted">
                    General Settings
                  </h3>

                  {/* Default Adapter */}
                  <SettingItem
                    label="Default Adapter"
                    description="The adapter to use by default when starting the app"
                  >
                    <select
                      class="px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
                      value={settings().defaultAdapter}
                      onChange={(e) =>
                        updateSetting("defaultAdapter", e.currentTarget.value)
                      }
                    >
                      <option value="local_pc">Local PC</option>
                      <option value="usb_device">USB Device</option>
                      <option value="emulator">Emulator</option>
                      <option value="remote">Remote</option>
                    </select>
                  </SettingItem>

                  {/* Auto Attach */}
                  <SettingItem
                    label="Auto Attach"
                    description="Automatically attach to process when selected"
                  >
                    <ToggleSwitch
                      checked={settings().autoAttach}
                      onChange={(v) => updateSetting("autoAttach", v)}
                    />
                  </SettingItem>

                  {/* Show Process Path */}
                  <SettingItem
                    label="Show Process Path"
                    description="Display full path for processes in the list"
                  >
                    <ToggleSwitch
                      checked={settings().showProcessPath}
                      onChange={(v) => updateSetting("showProcessPath", v)}
                    />
                  </SettingItem>

                  {/* Recent Projects Limit */}
                  <SettingItem
                    label="Recent Projects Limit"
                    description="Maximum number of recent projects to remember"
                  >
                    <SettingsNumberInput
                      min={1}
                      max={50}
                      value={settings().recentProjectsLimit}
                      onChange={(val) =>
                        updateSetting("recentProjectsLimit", val)
                      }
                    />
                  </SettingItem>
                </div>
              </Show>

              <Show when={activeSection() === "appearance"}>
                <div class="space-y-6">
                  <h3 class="text-sm font-medium text-foreground-muted">
                    Appearance
                  </h3>

                  {/* Theme */}
                  <SettingItem
                    label="Theme"
                    description="Choose the color theme for the app"
                  >
                    <select
                      class="px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
                      value={settings().theme}
                      onChange={(e) =>
                        updateSetting(
                          "theme",
                          e.currentTarget.value as AppSettings["theme"],
                        )
                      }
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                      <option value="system">System</option>
                    </select>
                  </SettingItem>
                </div>
              </Show>

              <Show when={activeSection() === "build"}>
                <div class="space-y-6">
                  <h3 class="text-sm font-medium text-foreground-muted">
                    Build Settings
                  </h3>

                  {/* Default Output Directory */}
                  <SettingItem
                    label="Default Output Directory"
                    description="Default directory for build output"
                  >
                    <div class="flex gap-2">
                      <SettingsTextInput
                        value={settings().defaultOutputDir}
                        onChange={(val) =>
                          updateSetting("defaultOutputDir", val)
                        }
                      />
                      <button
                        class="px-3 py-2 bg-surface border border-border rounded hover:bg-surface-hover transition-colors"
                        onClick={handleSelectOutputDir}
                      >
                        <IconFolder class="w-4 h-4" />
                      </button>
                    </div>
                  </SettingItem>
                </div>
              </Show>

              <Show when={activeSection() === "advanced"}>
                <div class="space-y-6">
                  <h3 class="text-sm font-medium text-foreground-muted">
                    Advanced Settings
                  </h3>

                  <div class="p-4 bg-background rounded-lg">
                    <p class="text-sm text-foreground-muted">
                      Advanced settings will be available in future updates.
                    </p>
                  </div>

                  {/* Reset to Defaults */}
                  <SettingItem
                    label="Reset Settings"
                    description="Reset all settings to their default values"
                  >
                    <button
                      class="px-4 py-2 bg-error/10 text-error border border-error/20 rounded hover:bg-error/20 transition-colors text-sm"
                      onClick={() => setSettings(defaultSettings)}
                    >
                      Reset to Defaults
                    </button>
                  </SettingItem>
                </div>
              </Show>
            </div>
          </div>

          {/* Footer */}
          <div class="flex justify-end gap-2 p-4 border-t border-border">
            <button
              class="px-4 py-2 text-sm hover:bg-surface-hover rounded transition-colors"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors"
              onClick={saveSettings}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

interface SettingItemProps {
  label: string;
  description: string;
  children: any;
}

const SettingItem: Component<SettingItemProps> = (props) => {
  return (
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <div class="text-sm font-medium">{props.label}</div>
        <div class="text-xs text-foreground-muted mt-0.5">
          {props.description}
        </div>
      </div>
      <div class="flex-shrink-0">{props.children}</div>
    </div>
  );
};

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

const ToggleSwitch: Component<ToggleSwitchProps> = (props) => {
  return (
    <button
      class={`w-10 h-5 rounded-full transition-colors relative ${
        props.checked ? "bg-accent" : "bg-background-secondary"
      }`}
      onClick={() => props.onChange(!props.checked)}
    >
      <div
        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          props.checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
};

// Uncontrolled number input that doesn't lose focus
interface SettingsNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

const SettingsNumberInput: Component<SettingsNumberInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(String(props.value));
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(String(val));
    }
  });

  return (
    <input
      type="number"
      min={props.min}
      max={props.max}
      class="w-20 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
      value={localValue()}
      onFocus={() => setIsFocused(true)}
      onInput={(e) => {
        const strVal = e.currentTarget.value;
        setLocalValue(strVal);
        const num = parseInt(strVal);
        if (!isNaN(num)) {
          props.onChange(num);
        }
      }}
      onBlur={() => setIsFocused(false)}
    />
  );
};

// Uncontrolled text input that doesn't lose focus
interface SettingsTextInputProps {
  value: string;
  onChange: (value: string) => void;
}

const SettingsTextInput: Component<SettingsTextInputProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value);
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const val = props.value;
    if (untrack(() => !isFocused())) {
      setLocalValue(val);
    }
  });

  return (
    <input
      type="text"
      class="flex-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
      value={localValue()}
      onFocus={() => setIsFocused(true)}
      onInput={(e) => {
        const val = e.currentTarget.value;
        setLocalValue(val);
        props.onChange(val);
      }}
      onBlur={() => setIsFocused(false)}
    />
  );
};

export default SettingsModal;
