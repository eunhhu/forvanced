import { Component, For } from "solid-js";
import {
  IconFolder,
  IconCpu,
  IconLayout,
  IconPackage,
  IconSettings,
  IconWorkflow,
} from "@/components/common/Icons";

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
  return (
    <aside class="w-sidebar h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div class="h-header flex items-center px-4 border-b border-border drag-region">
        <h1 class="text-lg font-semibold text-foreground no-drag">Forvanced</h1>
      </div>

      {/* Navigation */}
      <nav class="flex-1 p-2 space-y-1">
        <For each={navItems}>
          {(item) => (
            <button
              class={`sidebar-item w-full ${props.activeTab === item.id ? "active" : ""}`}
              onClick={() => props.onTabChange(item.id)}
            >
              <item.icon class="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </nav>

      {/* Bottom actions */}
      <div class="p-2 border-t border-border">
        <button class="sidebar-item w-full" onClick={props.onOpenSettings}>
          <IconSettings class="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
