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
  const [componentValues, setComponentValues] = createSignal<
    Map<string, unknown>
  >(new Map());

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
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
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
        case "page":
          // Initialize page with first tab as active
          const pageTabs = (comp.props?.tabs ?? []) as Array<{
            id: string;
            label: string;
          }>;
          if (pageTabs.length > 0) {
            values.set(comp.id, pageTabs[0].id);
          }
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
          style={
            !isFullscreen() ? { width: `${canvasWidth() + 48}px` } : undefined
          }
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
                        parentDirection="vertical"
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
  parentDirection?: "horizontal" | "vertical";
}

const PreviewComponent: Component<PreviewComponentProps> = (props) => {
  const comp = () => props.component;
  const children = () => props.getChildren(comp().id);

  // Calculate width/height based on sizing mode
  const getWidth = () => {
    const mode = comp().widthMode ?? "fill"; // default fill for stack layout
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

  // Get flex grow based on sizing mode and parent direction
  const getFlexGrow = () => {
    const dir = props.parentDirection ?? "vertical";
    if (dir === "vertical" && comp().heightMode === "fill") return 1;
    if (dir === "horizontal" && comp().widthMode === "fill") return 1;
    return 0;
  };

  const getFlexShrink = () => {
    const wMode = comp().widthMode ?? "fill";
    const hMode = comp().heightMode ?? "fixed";
    // Don't shrink fixed size elements
    if (wMode === "fixed" && hMode === "fixed") return 0;
    return 1;
  };

  // Consistent font size: 14px base, 12px for secondary text
  const baseFontSize = 14;
  const secondaryFontSize = 12;

  const renderComponent = () => {
    switch (comp().type) {
      case "label":
        return (
          <div
            class="text-foreground"
            style={{
              "font-size": `${(comp().props?.fontSize as number) ?? baseFontSize}px`,
              "font-weight": comp().props?.bold ? "bold" : "normal",
              "text-align": ((comp().props?.align as string) ?? "left") as
                | "left"
                | "center"
                | "right",
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
              height:
                comp().heightMode === "fixed"
                  ? `${comp().height}px`
                  : undefined,
              "min-height": "36px",
            }}
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
            <span
              class="text-foreground"
              style={{ "font-size": `${baseFontSize}px` }}
            >
              {comp().label}
            </span>
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
          (props.getValue(comp().id) as number) ??
          (comp().props?.min as number) ??
          0;
        const min = () => (comp().props?.min as number) ?? 0;
        const max = () => (comp().props?.max as number) ?? 100;
        return (
          <div class="space-y-1">
            <div
              class="flex items-center justify-between"
              style={{ "font-size": `${baseFontSize}px` }}
            >
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
            <label
              class="text-foreground"
              style={{ "font-size": `${baseFontSize}px` }}
            >
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
            <label
              class="text-foreground"
              style={{ "font-size": `${baseFontSize}px` }}
            >
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

      case "container":
        const containerGap = () => props.gap;
        return (
          <div
            class="p-3 rounded-md border flex flex-col"
            style={{
              "background-color":
                (comp().props?.backgroundColor as string) ?? "transparent",
              "border-color":
                (comp().props?.borderColor as string) ?? "var(--border)",
              height:
                comp().heightMode === "fill"
                  ? "100%"
                  : comp().heightMode === "fixed"
                    ? `${comp().height}px`
                    : "auto",
              "min-height":
                comp().heightMode === "hug" ? `${comp().height}px` : undefined,
            }}
          >
            <Show when={comp().label}>
              <div
                class="text-foreground-muted mb-2 font-medium shrink-0"
                style={{ "font-size": `${secondaryFontSize}px` }}
              >
                {comp().label}
              </div>
            </Show>
            <div
              class="flex flex-col flex-1"
              style={{ gap: `${containerGap()}px` }}
            >
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={containerGap()}
                    parentDirection="vertical"
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "group":
        const groupGap = () => props.gap;
        return (
          <div
            class="border border-border rounded-lg overflow-hidden flex flex-col"
            style={{
              height:
                comp().heightMode === "fill"
                  ? "100%"
                  : comp().heightMode === "fixed"
                    ? `${comp().height}px`
                    : "auto",
              "min-height":
                comp().heightMode === "hug" ? `${comp().height}px` : undefined,
            }}
          >
            <Show when={comp().label}>
              <div class="h-8 px-3 border-b border-border flex items-center bg-surface shrink-0">
                <span
                  class="font-medium text-foreground"
                  style={{ "font-size": `${baseFontSize}px` }}
                >
                  {comp().label}
                </span>
              </div>
            </Show>
            <div
              class="flex flex-col flex-1 overflow-auto p-2"
              style={{ gap: `${groupGap()}px` }}
            >
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={groupGap()}
                    parentDirection="vertical"
                  />
                )}
              </For>
            </div>
          </div>
        );

      case "stack":
        const direction = () =>
          (comp().props?.direction as string) ?? "vertical";
        const stackGap = () => (comp().props?.gap as number) ?? props.gap;
        const stackPadding = () => (comp().props?.padding as number) ?? 0;
        return (
          <div
            class="flex border-2 border-dashed border-accent/20 rounded-lg"
            style={{
              "flex-direction": direction() === "horizontal" ? "row" : "column",
              gap: `${stackGap()}px`,
              "align-items": (comp().props?.align as string) ?? "stretch",
              "justify-content": (comp().props?.justify as string) ?? "start",
              padding: `${stackPadding()}px`,
              height:
                comp().heightMode === "fill"
                  ? "100%"
                  : comp().heightMode === "fixed"
                    ? `${comp().height}px`
                    : "auto",
              "min-height":
                comp().heightMode === "hug" ? `${comp().height}px` : undefined,
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
                  parentDirection={direction() as "horizontal" | "vertical"}
                />
              )}
            </For>
          </div>
        );

      case "page":
        const tabs = () =>
          (comp().props?.tabs as Array<{ id: string; label: string }>) ?? [];
        const activeTabId = () => {
          const savedValue = props.getValue(comp().id) as string | undefined;
          if (savedValue) return savedValue;
          return tabs()[0]?.id ?? "";
        };
        const activeTabIndex = () =>
          tabs().findIndex((t) => t.id === activeTabId());
        const pageChildren = () => {
          const atId = activeTabId();
          const atIdx = activeTabIndex();
          return children().filter((c) => {
            const childTabId = c.props?.tabId as string | undefined;
            // Show children:
            // 1. If child has matching tabId
            // 2. If child has no tabId and we're on first tab (default behavior)
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
            style={{
              height:
                comp().heightMode === "fill" ? "100%" : `${comp().height}px`,
            }}
          >
            {/* Tab bar */}
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
            {/* Tab content */}
            <div
              class="flex flex-col flex-1 overflow-auto"
              style={{
                gap: `${pageGap()}px`,
                padding: `${pagePadding()}px`,
              }}
            >
              <Show
                when={pageChildren().length > 0}
                fallback={
                  <div
                    class="flex-1 flex items-center justify-center text-foreground-muted"
                    style={{ "font-size": `${secondaryFontSize}px` }}
                  >
                    No components in this tab
                  </div>
                }
              >
                <For each={pageChildren()}>
                  {(child) => (
                    <PreviewComponent
                      component={child}
                      getChildren={props.getChildren}
                      getValue={props.getValue}
                      setValue={props.setValue}
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
        const scrollDir = () =>
          (comp().props?.direction as string) ?? "vertical";
        const scrollGap = () => (comp().props?.gap as number) ?? props.gap;
        const scrollPadding = () => (comp().props?.padding as number) ?? 8;
        return (
          <div
            class="overflow-auto border border-border rounded-lg bg-surface"
            style={{
              height:
                comp().heightMode === "fill" ? "100%" : `${comp().height}px`,
              "max-height": comp().props?.maxHeight
                ? `${comp().props.maxHeight}px`
                : undefined,
            }}
          >
            <div
              class="flex"
              style={{
                "flex-direction":
                  scrollDir() === "horizontal" ? "row" : "column",
                gap: `${scrollGap()}px`,
                padding: `${scrollPadding()}px`,
              }}
            >
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
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
              "background-color":
                (comp().props?.backgroundColor as string) ?? "var(--surface)",
              "border-color":
                (comp().props?.borderColor as string) ?? "var(--border)",
              height:
                comp().heightMode === "fill"
                  ? "100%"
                  : comp().heightMode === "fixed"
                    ? `${comp().height}px`
                    : "auto",
              "min-height":
                comp().heightMode === "hug" ? `${comp().height}px` : undefined,
              "box-shadow":
                cardElevation() > 0
                  ? `0 ${cardElevation() * 2}px ${cardElevation() * 8}px rgba(0,0,0,0.15)`
                  : "none",
            }}
          >
            <Show when={comp().props?.showHeader !== false}>
              <div class="px-4 py-2 border-b border-border bg-background/50 shrink-0">
                <span
                  class="font-medium"
                  style={{ "font-size": `${baseFontSize}px` }}
                >
                  {(comp().props?.title as string) ?? comp().label ?? "Card"}
                </span>
              </div>
            </Show>
            <div
              class="flex flex-col flex-1 overflow-auto"
              style={{
                padding: `${cardPadding()}px`,
                gap: `${cardGap()}px`,
              }}
            >
              <For each={children()}>
                {(child) => (
                  <PreviewComponent
                    component={child}
                    getChildren={props.getChildren}
                    getValue={props.getValue}
                    setValue={props.setValue}
                    gap={cardGap()}
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

  // For most components, we let them handle their own sizing
  // For container types that manage their own layout, we return directly
  const isLayoutContainer = () =>
    ["page", "stack", "scroll", "card", "group", "container"].includes(
      comp().type,
    );

  if (isLayoutContainer()) {
    return (
      <div
        style={{
          width: getWidth(),
          height: getHeight(),
          "flex-grow": getFlexGrow(),
          "flex-shrink": getFlexShrink(),
          "min-width":
            comp().widthMode === "hug" ? `${comp().width}px` : undefined,
          "min-height":
            comp().heightMode === "hug" ? `${comp().height}px` : undefined,
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

export default UIPreview;
