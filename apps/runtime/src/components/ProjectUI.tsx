import { Component, For, Show, createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// Types
interface ProjectConfig {
  name: string;
  targetProcess: string | null;
  components: UIComponent[];
  scripts: Script[];
  canvas: CanvasSettings;
}

interface CanvasSettings {
  width: number;
  height: number;
  padding: number;
  gap: number;
}

interface UIComponent {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  parentId?: string;
  children?: string[];
  zIndex: number;
  visible?: boolean;
  widthMode?: string;
  heightMode?: string;
}

interface Script {
  id: string;
  name: string;
  nodes: ScriptNode[];
  connections: ScriptConnection[];
}

interface ScriptNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface ScriptConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

interface ProjectUIProps {
  config: ProjectConfig;
}

export const ProjectUI: Component<ProjectUIProps> = (props) => {
  const [componentValues, setComponentValues] = createSignal<Map<string, unknown>>(new Map());

  // Initialize default values
  const initValues = createMemo(() => {
    const values = new Map<string, unknown>();
    for (const comp of props.config.components) {
      const defaultValue = getDefaultValue(comp);
      if (defaultValue !== undefined) {
        values.set(comp.id, defaultValue);
      }
    }
    setComponentValues(values);
    return values;
  });

  // Get root components (no parent)
  const rootComponents = createMemo(() =>
    props.config.components
      .filter((c) => !c.parentId && c.visible !== false)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  );

  // Get children of a component
  const getChildren = (parentId: string) =>
    props.config.components
      .filter((c) => c.parentId === parentId && c.visible !== false)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Get/Set component value
  const getValue = (id: string) => {
    // Initialize on first access
    if (componentValues().size === 0) {
      initValues();
    }
    return componentValues().get(id);
  };

  const setValue = async (id: string, value: unknown, eventType?: string) => {
    setComponentValues((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });

    // Sync to backend and trigger event
    try {
      await invoke("set_component_value", { componentId: id, value });
      // Trigger UI event for script execution
      if (eventType) {
        await invoke("trigger_ui_event", {
          componentId: id,
          eventType,
          value,
        });
      }
    } catch (e) {
      console.error("Failed to sync value:", e);
    }
  };

  // Execute action when component triggers it
  const executeAction = async (actionType: string, params: Record<string, unknown>) => {
    try {
      const result = await invoke("execute_action", { actionType, params });
      console.log("Action result:", result);
      return result;
    } catch (e) {
      console.error("Action failed:", e);
    }
  };

  const canvas = () => props.config.canvas;

  return (
    <div
      class="flex flex-col h-full"
      style={{
        padding: `${canvas().padding}px`,
        gap: `${canvas().gap}px`,
      }}
    >
      <For each={rootComponents()}>
        {(comp) => (
          <RuntimeComponent
            component={comp}
            getChildren={getChildren}
            getValue={getValue}
            setValue={setValue}
            executeAction={executeAction}
            gap={canvas().gap}
            parentDirection="vertical"
          />
        )}
      </For>
    </div>
  );
};

// Get default value for a component
function getDefaultValue(comp: UIComponent): unknown {
  switch (comp.type) {
    case "toggle":
      return (comp.props?.defaultValue as boolean) ?? false;
    case "slider":
      return (comp.props?.defaultValue as number) ?? (comp.props?.min as number) ?? 0;
    case "input":
      return (comp.props?.defaultValue as string) ?? "";
    case "dropdown": {
      const options = (comp.props?.options ?? []) as string[];
      return options[0] ?? "";
    }
    case "page": {
      const tabs = (comp.props?.tabs ?? []) as Array<{ id: string; label: string }>;
      return tabs[0]?.id ?? "";
    }
    default:
      return undefined;
  }
}

// ============================================
// Runtime Component Renderer
// ============================================

interface RuntimeComponentProps {
  component: UIComponent;
  getChildren: (parentId: string) => UIComponent[];
  getValue: (id: string) => unknown;
  setValue: (id: string, value: unknown, eventType?: string) => Promise<void>;
  executeAction: (actionType: string, params: Record<string, unknown>) => Promise<unknown>;
  gap: number;
  parentDirection?: "horizontal" | "vertical";
}

const RuntimeComponent: Component<RuntimeComponentProps> = (props) => {
  const comp = () => props.component;
  const children = () => props.getChildren(comp().id);

  // Consistent font sizes
  const baseFontSize = 14;
  const secondaryFontSize = 12;

  // Calculate width/height based on sizing mode
  const getWidth = () => {
    const mode = comp().widthMode ?? "fill";
    switch (mode) {
      case "fixed":
        return `${comp().width}px`;
      case "fill":
        return "100%";
      case "hug":
        return "auto";
      default:
        return "100%";
    }
  };

  const getHeight = () => {
    const mode = comp().heightMode ?? "fixed";
    switch (mode) {
      case "fixed":
        return `${comp().height}px`;
      case "fill":
        return "100%";
      case "hug":
        return "auto";
      default:
        return undefined;
    }
  };

  const getFlexGrow = () => {
    const dir = props.parentDirection ?? "vertical";
    if (dir === "vertical" && comp().heightMode === "fill") return 1;
    if (dir === "horizontal" && comp().widthMode === "fill") return 1;
    return 0;
  };

  const getFlexShrink = () => {
    const wMode = comp().widthMode ?? "fill";
    const hMode = comp().heightMode ?? "fixed";
    if (wMode === "fixed" && hMode === "fixed") return 0;
    return 1;
  };

  const renderComponent = () => {
    switch (comp().type) {
      case "label":
        return (
          <div
            class="text-foreground"
            style={{
              "font-size": `${(comp().props?.fontSize as number) ?? baseFontSize}px`,
              "font-weight": comp().props?.bold ? "bold" : "normal",
              "text-align": ((comp().props?.align as string) ?? "left") as "left" | "center" | "right",
              color: comp().props?.color as string | undefined,
            }}
          >
            {comp().label}
          </div>
        );

      case "button":
        return (
          <button
            class="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 active:scale-95 transition-all font-medium text-center"
            style={{
              "font-size": `${baseFontSize}px`,
              width: getWidth(),
              height: comp().heightMode === "fixed" ? `${comp().height}px` : undefined,
              "min-height": "36px",
            }}
            onClick={async () => {
              console.log(`Button clicked: ${comp().label}`);
              // Trigger click event for script execution
              try {
                await invoke("trigger_ui_event", {
                  componentId: comp().id,
                  eventType: "click",
                  value: true,
                });
              } catch (e) {
                console.error("Failed to trigger button event:", e);
              }
            }}
          >
            {comp().label}
          </button>
        );

      case "toggle":
        const isOn = () => (props.getValue(comp().id) as boolean) ?? false;
        return (
          <div class="flex items-center justify-between">
            <span class="text-foreground" style={{ "font-size": `${baseFontSize}px` }}>
              {comp().label}
            </span>
            <button
              class={`w-12 h-6 rounded-full transition-colors relative ${
                isOn() ? "bg-accent" : "bg-background-tertiary"
              }`}
              onClick={() => {
                const newValue = !isOn();
                props.setValue(comp().id, newValue, "change");
              }}
            >
              <div
                class={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isOn() ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        );

      case "slider":
        const sliderValue = () =>
          (props.getValue(comp().id) as number) ?? (comp().props?.min as number) ?? 0;
        const min = () => (comp().props?.min as number) ?? 0;
        const max = () => (comp().props?.max as number) ?? 100;
        return (
          <div class="space-y-1">
            <div class="flex items-center justify-between" style={{ "font-size": `${baseFontSize}px` }}>
              <span class="text-foreground">{comp().label}</span>
              <span class="text-foreground-muted">{sliderValue()}</span>
            </div>
            <input
              type="range"
              class="w-full accent-accent"
              min={min()}
              max={max()}
              step={(comp().props?.step as number) ?? 1}
              value={sliderValue()}
              onInput={(e) => {
                const newValue = Number(e.currentTarget.value);
                props.setValue(comp().id, newValue, "change");
              }}
            />
          </div>
        );

      case "input":
        const inputValue = () => (props.getValue(comp().id) as string) ?? "";
        return (
          <div class="space-y-1">
            <label class="text-foreground" style={{ "font-size": `${baseFontSize}px` }}>
              {comp().label}
            </label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent"
              style={{ "font-size": `${baseFontSize}px` }}
              placeholder={comp().props?.placeholder as string | undefined}
              value={inputValue()}
              onInput={(e) => props.setValue(comp().id, e.currentTarget.value)}
            />
          </div>
        );

      case "dropdown":
        const dropdownValue = () => (props.getValue(comp().id) as string) ?? "";
        const options = () => (comp().props?.options ?? []) as string[];
        return (
          <div class="space-y-1">
            <label class="text-foreground" style={{ "font-size": `${baseFontSize}px` }}>
              {comp().label}
            </label>
            <select
              class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent"
              style={{ "font-size": `${baseFontSize}px` }}
              value={dropdownValue()}
              onChange={(e) => props.setValue(comp().id, e.currentTarget.value)}
            >
              <For each={options()}>
                {(opt) => <option value={opt}>{opt}</option>}
              </For>
            </select>
          </div>
        );

      case "divider":
        return <hr class="border-border my-2" />;

      case "spacer":
        return <div style={{ height: `${comp().props?.height ?? 16}px` }} />;

      case "group":
        const groupGap = () => props.gap;
        return (
          <div
            class="border border-border rounded-lg overflow-hidden flex flex-col"
            style={{
              height: comp().heightMode === "fill" ? "100%" : comp().heightMode === "fixed" ? `${comp().height}px` : "auto",
              "min-height": comp().heightMode === "hug" ? `${comp().height}px` : undefined,
            }}
          >
            <Show when={comp().label}>
              <div class="h-8 px-3 border-b border-border flex items-center bg-surface shrink-0">
                <span class="font-medium text-foreground" style={{ "font-size": `${baseFontSize}px` }}>
                  {comp().label}
                </span>
              </div>
            </Show>
            <div class="flex flex-col flex-1 overflow-auto p-2" style={{ gap: `${groupGap()}px` }}>
              <For each={children()}>
                {(child) => (
                  <RuntimeComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    executeAction={props.executeAction}
                    gap={groupGap()}
                    parentDirection="vertical"
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "stack":
        const direction = () => (comp().props?.direction as string) ?? "vertical";
        const stackGap = () => (comp().props?.gap as number) ?? props.gap;
        const stackPadding = () => (comp().props?.padding as number) ?? 0;
        return (
          <div
            class="flex"
            style={{
              "flex-direction": direction() === "horizontal" ? "row" : "column",
              gap: `${stackGap()}px`,
              "align-items": (comp().props?.align as string) ?? "stretch",
              "justify-content": (comp().props?.justify as string) ?? "start",
              padding: `${stackPadding()}px`,
              height: comp().heightMode === "fill" ? "100%" : comp().heightMode === "fixed" ? `${comp().height}px` : "auto",
              "min-height": comp().heightMode === "hug" ? `${comp().height}px` : undefined,
            }}
          >
            <For each={children()}>
              {(child) => (
                <RuntimeComponent
                  component={child}
                  getChildren={props.getChildren}
                  getValue={props.getValue}
                  setValue={props.setValue}
                  executeAction={props.executeAction}
                  gap={stackGap()}
                  parentDirection={direction() as "horizontal" | "vertical"}
                />
              )}
            </For>
          </div>
        );

      case "page":
        const tabs = () => (comp().props?.tabs as Array<{ id: string; label: string }>) ?? [];
        const activeTabId = () => {
          const savedValue = props.getValue(comp().id) as string | undefined;
          if (savedValue) return savedValue;
          return tabs()[0]?.id ?? "";
        };
        const activeTabIndex = () => tabs().findIndex((t) => t.id === activeTabId());
        const pageChildren = () => {
          const atId = activeTabId();
          const atIdx = activeTabIndex();
          return children().filter((c) => {
            const childTabId = c.props?.tabId as string | undefined;
            if (childTabId === atId) return true;
            if (!childTabId && atIdx === 0) return true;
            return false;
          });
        };
        const pagePadding = () => (comp().props?.padding as number) ?? 8;
        const pageGap = () => (comp().props?.gap as number) ?? props.gap;
        return (
          <div
            class="flex flex-col border border-border rounded-lg overflow-hidden bg-surface"
            style={{ height: comp().heightMode === "fill" ? "100%" : `${comp().height}px` }}
          >
            <div class="flex border-b border-border bg-background-secondary shrink-0">
              <For each={tabs()}>
                {(tab) => (
                  <button
                    class={`px-4 py-2 font-medium transition-colors ${
                      activeTabId() === tab.id
                        ? "text-accent border-b-2 border-accent bg-surface"
                        : "text-foreground-muted hover:text-foreground"
                    }`}
                    style={{ "font-size": `${baseFontSize}px` }}
                    onClick={() => props.setValue(comp().id, tab.id)}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </div>
            <div
              class="flex flex-col flex-1 overflow-auto"
              style={{ gap: `${pageGap()}px`, padding: `${pagePadding()}px` }}
            >
              <Show
                when={pageChildren().length > 0}
                fallback={
                  <div class="flex-1 flex items-center justify-center text-foreground-muted" style={{ "font-size": `${secondaryFontSize}px` }}>
                    No components in this tab
                  </div>
                }
              >
                <For each={pageChildren()}>
                  {(child) => (
                    <RuntimeComponent
                      component={child}
                      getChildren={props.getChildren}
                      getValue={props.getValue}
                      setValue={props.setValue}
                      executeAction={props.executeAction}
                      gap={pageGap()}
                      parentDirection="vertical"
                    />
                  )}
                </For>
              </Show>
            </div>
          </div>
        );

      case "scroll":
        const scrollDir = () => (comp().props?.direction as string) ?? "vertical";
        const scrollGap = () => (comp().props?.gap as number) ?? props.gap;
        const scrollPadding = () => (comp().props?.padding as number) ?? 8;
        return (
          <div
            class="overflow-auto border border-border rounded-lg bg-surface"
            style={{
              height: comp().heightMode === "fill" ? "100%" : `${comp().height}px`,
              "max-height": comp().props?.maxHeight ? `${comp().props.maxHeight}px` : undefined,
            }}
          >
            <div
              class="flex"
              style={{
                "flex-direction": scrollDir() === "horizontal" ? "row" : "column",
                gap: `${scrollGap()}px`,
                padding: `${scrollPadding()}px`,
              }}
            >
              <For each={children()}>
                {(child) => (
                  <RuntimeComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    executeAction={props.executeAction}
                    gap={scrollGap()}
                    parentDirection={scrollDir() as "horizontal" | "vertical"}
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "card":
        const cardPadding = () => (comp().props?.padding as number) ?? 16;
        const cardGap = () => props.gap;
        const cardElevation = () => (comp().props?.elevation as number) ?? 1;
        return (
          <div
            class="rounded-lg border overflow-hidden flex flex-col"
            style={{
              "background-color": (comp().props?.backgroundColor as string) ?? "var(--surface)",
              "border-color": (comp().props?.borderColor as string) ?? "var(--border)",
              height: comp().heightMode === "fill" ? "100%" : comp().heightMode === "fixed" ? `${comp().height}px` : "auto",
              "min-height": comp().heightMode === "hug" ? `${comp().height}px` : undefined,
              "box-shadow": cardElevation() > 0 ? `0 ${cardElevation() * 2}px ${cardElevation() * 8}px rgba(0,0,0,0.15)` : "none",
            }}
          >
            <Show when={comp().props?.showHeader !== false}>
              <div class="px-4 py-2 border-b border-border bg-background/50 shrink-0">
                <span class="font-medium" style={{ "font-size": `${baseFontSize}px` }}>
                  {(comp().props?.title as string) ?? comp().label ?? "Card"}
                </span>
              </div>
            </Show>
            <div class="flex flex-col flex-1 overflow-auto" style={{ padding: `${cardPadding()}px`, gap: `${cardGap()}px` }}>
              <For each={children()}>
                {(child) => (
                  <RuntimeComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    executeAction={props.executeAction}
                    gap={cardGap()}
                    parentDirection="vertical"
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "container":
        const containerGap = () => props.gap;
        return (
          <div
            class="p-3 rounded-md border flex flex-col"
            style={{
              "background-color": (comp().props?.backgroundColor as string) ?? "transparent",
              "border-color": (comp().props?.borderColor as string) ?? "var(--border)",
              height: comp().heightMode === "fill" ? "100%" : comp().heightMode === "fixed" ? `${comp().height}px` : "auto",
              "min-height": comp().heightMode === "hug" ? `${comp().height}px` : undefined,
            }}
          >
            <Show when={comp().label}>
              <div class="text-foreground-muted mb-2 font-medium shrink-0" style={{ "font-size": `${secondaryFontSize}px` }}>
                {comp().label}
              </div>
            </Show>
            <div class="flex flex-col flex-1" style={{ gap: `${containerGap()}px` }}>
              <For each={children()}>
                {(child) => (
                  <RuntimeComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    executeAction={props.executeAction}
                    gap={containerGap()}
                    parentDirection="vertical"
                  />
                )}
              </For>
            </div>
          </div>
        );

      default:
        return (
          <div class="p-2 bg-error/10 text-error text-xs rounded">
            Unknown component: {comp().type}
          </div>
        );
    }
  };

  // For layout containers, wrap with sizing
  const isLayoutContainer = () => ["page", "stack", "scroll", "card", "group", "container"].includes(comp().type);

  if (isLayoutContainer()) {
    return (
      <div
        style={{
          width: getWidth(),
          height: getHeight(),
          "flex-grow": getFlexGrow(),
          "flex-shrink": getFlexShrink(),
          "min-width": comp().widthMode === "hug" ? `${comp().width}px` : undefined,
          "min-height": comp().heightMode === "hug" ? `${comp().height}px` : undefined,
        }}
      >
        {renderComponent()}
      </div>
    );
  }

  return (
    <div
      style={{
        width: getWidth(),
        "flex-grow": getFlexGrow(),
        "flex-shrink": getFlexShrink(),
      }}
    >
      {renderComponent()}
    </div>
  );
};

export default ProjectUI;
