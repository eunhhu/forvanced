import { Component, For, Show } from "solid-js";
import {
  IconFolder,
  IconCpu,
  IconLayout,
  IconPackage,
  IconSettings,
  IconWorkflow,
  IconPanelLeftClose,
  IconPanelLeftOpen,
} from "@/components/common/Icons";
import { sidebarStore } from "@/stores/sidebar";

interface NavItem {
  id: string;
  label: string;
  icon: Component<{ class?: string }>;
}

const navItems: NavItem[] = [
  { id: "project", label: "Project", icon: IconFolder },
  { id: "target", label: "Target", icon: IconCpu },
  { id: "designer", label: "Designer", icon: IconLayout },
  { id: "scripts", label: "Scripts", icon: IconWorkflow },
  { id: "build", label: "Build", icon: IconPackage },
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
          class={`no-drag p-1.5 rounded-md transition-colors hover:bg-background-tertiary text-foreground-secondary hover:text-foreground ${
            isCollapsed() ? "mx-auto" : ""
          }`}
          onClick={() => sidebarStore.toggle()}
          title={
            isCollapsed()
              ? `Expand sidebar (${isMac() ? "Cmd" : "Ctrl"}+\\)`
              : `Collapse sidebar (${isMac() ? "Cmd" : "Ctrl"}+\\)`
          }
        >
          <Show
            when={isCollapsed()}
            fallback={<IconPanelLeftClose class="w-4 h-4" />}
          >
            <IconPanelLeftOpen class="w-4 h-4" />
          </Show>
        </button>
      </div>

      {/* Navigation */}
      <nav class="flex-1 p-2 space-y-1">
        <For each={navItems}>
          {(item) => (
            <button
              class={`sidebar-item w-full ${props.activeTab === item.id ? "active" : ""} ${
                isCollapsed() ? "justify-center px-0" : ""
              }`}
              onClick={() => props.onTabChange(item.id)}
              title={isCollapsed() ? item.label : undefined}
            >
              <item.icon class="w-4 h-4 flex-shrink-0" />
              <Show when={!isCollapsed()}>
                <span class="truncate">{item.label}</span>
              </Show>
            </button>
          )}
        </For>
      </nav>

      {/* Bottom actions */}
      <div class="p-2 border-t border-border">
        <button
          class={`sidebar-item w-full ${isCollapsed() ? "justify-center px-0" : ""}`}
          onClick={props.onOpenSettings}
          title={isCollapsed() ? "Settings" : undefined}
        >
          <IconSettings class="w-4 h-4 flex-shrink-0" />
          <Show when={!isCollapsed()}>
            <span class="truncate">Settings</span>
          </Show>
        </button>
      </div>
    </aside>
  );
};
