import { Component, For, Show, createSignal, createMemo } from "solid-js";
import { designerStore, type UIComponent } from "@/stores/designer";
import { projectStore } from "@/stores/project";
import { IconX, IconMaximize, IconMinimize } from "@/components/common/Icons";

interface UIPreviewProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UIPreview: Component<UIPreviewProps> = (props) => {
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [componentValues, setComponentValues] = createSignal<Map<string, unknown>>(new Map());

  const components = () => designerStore.components();
  const project = () => projectStore.currentProject();

  const canvasWidth = createMemo(() => project()?.ui?.width || 400);
  const canvasHeight = createMemo(() => project()?.ui?.height || 500);
  const canvasPadding = createMemo(() => project()?.ui?.padding ?? 12);
  const canvasGap = createMemo(() => project()?.ui?.gap ?? 8);

  // Get root components (no parent)
  const rootComponents = createMemo(() =>
    components()
      .filter((c) => !c.parentId)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  );

  // Get children of a component
  const getChildren = (parentId: string) =>
    components()
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Get/Set component value
  const getValue = (id: string) => componentValues().get(id);
  const setValue = (id: string, value: unknown) => {
    setComponentValues((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  };

  // Initialize default values
  const initializeValues = () => {
    const values = new Map<string, unknown>();
    for (const comp of components()) {
      switch (comp.type) {
        case "toggle":
          values.set(comp.id, comp.props?.defaultValue ?? false);
          break;
        case "slider":
          values.set(comp.id, comp.props?.defaultValue ?? comp.props?.min ?? 0);
          break;
        case "input":
          values.set(comp.id, comp.props?.defaultValue ?? "");
          break;
        case "dropdown":
          const dropdownOpts = (comp.props?.options ?? []) as string[];
          values.set(comp.id, dropdownOpts[0] ?? "");
          break;
      }
    }
    setComponentValues(values);
  };

  // Reset values when modal opens
  const handleOpen = () => {
    initializeValues();
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
        onAnimationStart={handleOpen}
      >
        <div
          class={`bg-background-secondary rounded-lg shadow-2xl flex flex-col overflow-hidden ${
            isFullscreen() ? "w-full h-full m-4" : "max-w-[90vw] max-h-[90vh]"
          }`}
          style={!isFullscreen() ? { width: `${canvasWidth() + 48}px` } : undefined}
        >
          {/* Header */}
          <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
            <div class="flex items-center gap-3">
              <h3 class="text-sm font-medium">App Preview</h3>
              <span class="text-xs text-foreground-muted">
                {project()?.name ?? "Untitled"}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="p-1.5 rounded hover:bg-surface-hover transition-colors"
                onClick={() => setIsFullscreen(!isFullscreen())}
                title={isFullscreen() ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen() ? (
                  <IconMinimize class="w-4 h-4" />
                ) : (
                  <IconMaximize class="w-4 h-4" />
                )}
              </button>
              <button
                class="p-1.5 rounded hover:bg-surface-hover transition-colors"
                onClick={props.onClose}
                title="Close"
              >
                <IconX class="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview Content */}
          <div class="flex-1 overflow-auto p-6 flex items-center justify-center bg-background">
            {/* App Frame */}
            <div
              class="bg-surface rounded-lg shadow-lg border border-border overflow-hidden flex flex-col"
              style={{
                width: `${canvasWidth()}px`,
                height: `${canvasHeight()}px`,
              }}
            >
              {/* App Title Bar (simulated) */}
              <div class="h-8 bg-background-secondary border-b border-border flex items-center px-3 gap-2 shrink-0">
                <div class="flex gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-error/60" />
                  <div class="w-3 h-3 rounded-full bg-warning/60" />
                  <div class="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <span class="text-xs text-foreground-muted ml-2">
                  {project()?.name ?? "App Preview"}
                </span>
              </div>

              {/* App Content */}
              <div
                class="flex-1 overflow-auto"
                style={{
                  padding: `${canvasPadding()}px`,
                }}
              >
                <div
                  class="flex flex-col h-full"
                  style={{ gap: `${canvasGap()}px` }}
                >
                  <For each={rootComponents()}>
                    {(comp) => (
                      <PreviewComponent
                        component={comp}
                        getChildren={getChildren}
                        getValue={getValue}
                        setValue={setValue}
                        gap={canvasGap()}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div class="px-4 py-2 border-t border-border bg-surface text-xs text-foreground-muted flex items-center justify-between">
            <span>Interactive preview - click buttons, toggle switches</span>
            <button
              class="px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
              onClick={initializeValues}
            >
              Reset Values
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

// ============================================
// Preview Component Renderer
// ============================================

interface PreviewComponentProps {
  component: UIComponent;
  getChildren: (parentId: string) => UIComponent[];
  getValue: (id: string) => unknown;
  setValue: (id: string, value: unknown) => void;
  gap: number;
}

const PreviewComponent: Component<PreviewComponentProps> = (props) => {
  const comp = () => props.component;
  const children = () => props.getChildren(comp().id);

  const renderComponent = () => {
    switch (comp().type) {
      case "label":
        return (
          <div
            class="text-foreground"
            style={{
              "font-size": `${comp().props?.fontSize ?? 14}px`,
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
            class="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 active:scale-95 transition-all font-medium"
            onClick={() => {
              console.log(`[Preview] Button clicked: ${comp().label}`);
            }}
          >
            {comp().label}
          </button>
        );

      case "toggle":
        const isOn = () => (props.getValue(comp().id) as boolean) ?? false;
        return (
          <div class="flex items-center justify-between">
            <span class="text-sm text-foreground">{comp().label}</span>
            <button
              class={`w-12 h-6 rounded-full transition-colors relative ${
                isOn() ? "bg-accent" : "bg-background-tertiary"
              }`}
              onClick={() => props.setValue(comp().id, !isOn())}
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
            <div class="flex items-center justify-between text-sm">
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
              onInput={(e) =>
                props.setValue(comp().id, Number(e.currentTarget.value))
              }
            />
          </div>
        );

      case "input":
        const inputValue = () => (props.getValue(comp().id) as string) ?? "";
        return (
          <div class="space-y-1">
            <label class="text-sm text-foreground">{comp().label}</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent text-sm"
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
            <label class="text-sm text-foreground">{comp().label}</label>
            <select
              class="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-accent text-sm"
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

      case "container":
        return (
          <div
            class="p-3 rounded-md border"
            style={{
              "background-color": (comp().props?.backgroundColor as string) ?? "transparent",
              "border-color": (comp().props?.borderColor as string) ?? "var(--border)",
            }}
          >
            <Show when={comp().label}>
              <div class="text-xs text-foreground-muted mb-2 font-medium">
                {comp().label}
              </div>
            </Show>
            <div class="flex flex-col" style={{ gap: `${props.gap}px` }}>
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={props.gap}
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "group":
        return (
          <div class="space-y-1">
            <Show when={comp().label}>
              <div class="text-sm font-medium text-foreground mb-1">
                {comp().label}
              </div>
            </Show>
            <div class="flex flex-col" style={{ gap: `${props.gap}px` }}>
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={props.gap}
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "stack":
        const direction = () => (comp().props?.direction as string) ?? "vertical";
        const stackGap = () => (comp().props?.gap as number) ?? props.gap;
        return (
          <div
            class="flex"
            style={{
              "flex-direction": direction() === "horizontal" ? "row" : "column",
              gap: `${stackGap()}px`,
              "align-items": (comp().props?.align as string) ?? "stretch",
              padding: comp().props?.padding ? `${comp().props.padding}px` : undefined,
            }}
          >
            <For each={children()}>
              {(child) => (
                <PreviewComponent
                  component={child}
                  getChildren={props.getChildren}
                  getValue={props.getValue}
                  setValue={props.setValue}
                  gap={stackGap()}
                />
              )}
            </For>
          </div>
        );

      case "page":
        const tabs = () => (comp().props?.tabs as Array<{id: string; label: string}>) ?? [];
        const activeTab = () => (props.getValue(comp().id) as string) ?? tabs()[0]?.id;
        const pageChildren = () => children().filter(c => c.props?.tabId === activeTab());
        return (
          <div class="flex flex-col">
            {/* Tab bar */}
            <div class="flex border-b border-border">
              <For each={tabs()}>
                {(tab) => (
                  <button
                    class={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab() === tab.id
                        ? "text-accent border-b-2 border-accent"
                        : "text-foreground-muted hover:text-foreground"
                    }`}
                    onClick={() => props.setValue(comp().id, tab.id)}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </div>
            {/* Tab content */}
            <div class="flex flex-col" style={{ gap: `${props.gap}px`, padding: `${props.gap}px 0` }}>
              <For each={pageChildren()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={props.gap}
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "scroll":
        return (
          <div
            class="overflow-auto"
            style={{
              "max-height": comp().props?.maxHeight ? `${comp().props.maxHeight}px` : "300px",
            }}
          >
            <div class="flex flex-col" style={{ gap: `${props.gap}px` }}>
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={props.gap}
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "card":
        return (
          <div
            class="rounded-lg border overflow-hidden"
            style={{
              "background-color": (comp().props?.backgroundColor as string) ?? "var(--surface)",
              "border-color": (comp().props?.borderColor as string) ?? "var(--border)",
            }}
          >
            <Show when={comp().label || comp().props?.showHeader}>
              <div class="px-4 py-2 border-b border-border bg-background/50">
                <span class="text-sm font-medium">{comp().label || "Card"}</span>
              </div>
            </Show>
            <div
              class="flex flex-col"
              style={{
                padding: `${comp().props?.padding ?? 12}px`,
                gap: `${props.gap}px`,
              }}
            >
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={props.gap}
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

  return <div class="w-full">{renderComponent()}</div>;
};

export default UIPreview;
