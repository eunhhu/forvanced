import { Component, For, Show } from "solid-js";
import {
  IconFolder,
  IconLayout,
  IconPackage,
  IconSettings,
  IconWorkflow,
  IconPlay,
  IconPanelLeftClose,
  IconPanelLeftOpen,
} from "@/components/common/Icons";
import { sidebarStore } from "@/stores/sidebar";
import { formatHotkey } from "@/stores/hotkeys";

interface NavItem {
  id: string;
  label: string;
  icon: Component<{ class?: string }>;
  shortcut: string[];
}

const navItems: NavItem[] = [
  { id: "project", label: "Project", icon: IconFolder, shortcut: ["Cmd", "1"] },
  {
    id: "designer",
    label: "Designer",
    icon: IconLayout,
    shortcut: ["Cmd", "2"],
  },
  {
    id: "scripts",
    label: "Scripts",
    icon: IconWorkflow,
    shortcut: ["Cmd", "3"],
  },
  { id: "testing", label: "Testing", icon: IconPlay, shortcut: ["Cmd", "4"] },
  { id: "build", label: "Build", icon: IconPackage, shortcut: ["Cmd", "5"] },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onOpenSettings: () => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const isCollapsed = () => sidebarStore.isCollapsed();
  const isMac = () => sidebarStore.isMacOS();

  return (
    <aside
      class={`h-full bg-background-secondary border-r border-border flex flex-col transition-all duration-200 ease-in-out ${
        isCollapsed() ? "w-14" : "w-sidebar"
      }`}
      aria-label="Main navigation"
    >
      {/* Logo & Collapse Button */}
      <div class="h-header flex items-center justify-between px-3 border-b border-border drag-region">
        <Show when={!isCollapsed()}>
          <h1 class="text-lg font-semibold text-foreground no-drag truncate">
            Forvanced
          </h1>
        </Show>

        {/* Toggle button */}
        <button
          type="button"
          class={`no-drag p-1.5 rounded-md transition-colors hover:bg-background-tertiary text-foreground-secondary hover:text-foreground ${
            isCollapsed() ? "mx-auto" : ""
          }`}
          onClick={() => sidebarStore.toggle()}
          aria-expanded={!isCollapsed()}
          aria-controls="sidebar-nav"
          aria-label={isCollapsed() ? "Expand sidebar" : "Collapse sidebar"}
          title={
            isCollapsed()
              ? `Expand sidebar (${isMac() ? "⌘" : "Ctrl"}+\\)`
              : `Collapse sidebar (${isMac() ? "⌘" : "Ctrl"}+\\)`
          }
        >
          <Show
            when={isCollapsed()}
            fallback={<IconPanelLeftClose class="w-4 h-4" aria-hidden="true" />}
          >
            <IconPanelLeftOpen class="w-4 h-4" aria-hidden="true" />
          </Show>
        </button>
      </div>

      {/* Navigation */}
      <nav
        id="sidebar-nav"
        class="flex-1 p-2 space-y-1"
        aria-label="App sections"
      >
        <ul role="list" class="space-y-1">
          <For each={navItems}>
            {(item) => (
              <li>
                <button
                  type="button"
                  class={`sidebar-item w-full ${props.activeTab === item.id ? "active" : ""} ${
                    isCollapsed() ? "justify-center px-0" : ""
                  }`}
                  onClick={() => props.onTabChange(item.id)}
                  aria-current={
                    props.activeTab === item.id ? "page" : undefined
                  }
                  aria-label={
                    isCollapsed()
                      ? `${item.label} (${formatHotkey(item.shortcut)})`
                      : undefined
                  }
                  title={
                    isCollapsed()
                      ? `${item.label} (${formatHotkey(item.shortcut)})`
                      : formatHotkey(item.shortcut)
                  }
                >
                  <item.icon class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <Show when={!isCollapsed()}>
                    <span class="truncate">{item.label}</span>
                    <kbd class="ml-auto text-xs text-foreground-muted opacity-60">
                      {formatHotkey(item.shortcut)}
                    </kbd>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </nav>

      {/* Bottom actions */}
      <div class="p-2 border-t border-border">
        <button
          type="button"
          class={`sidebar-item w-full ${isCollapsed() ? "justify-center px-0" : ""}`}
          onClick={props.onOpenSettings}
          aria-label={
            isCollapsed()
              ? `Settings (${isMac() ? "⌘," : "Ctrl+,"})`
              : undefined
          }
          title={
            isCollapsed()
              ? `Settings (${isMac() ? "⌘," : "Ctrl+,"})`
              : `Settings (${isMac() ? "⌘," : "Ctrl+,"})`
          }
        >
          <IconSettings class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <Show when={!isCollapsed()}>
            <span class="truncate">Settings</span>
            <kbd class="ml-auto text-xs text-foreground-muted opacity-60">
              {isMac() ? "⌘," : "Ctrl+,"}
            </kbd>
          </Show>
        </button>
      </div>
    </aside>
  );
};
