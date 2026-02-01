import { Component, For, createMemo } from "solid-js";
import { scriptStore, getNodeContext } from "@/stores/script";

interface CanvasMinimapProps {
  offset: { x: number; y: number };
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  onViewportChange: (offset: { x: number; y: number }) => void;
}

const MINIMAP_WIDTH = 160;
const MINIMAP_HEIGHT = 100;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 60; // Approximate

export const CanvasMinimap: Component<CanvasMinimapProps> = (props) => {
  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  // Calculate bounds of all nodes
  const nodeBounds = createMemo(() => {
    const nodes = currentScript()?.nodes ?? [];
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_WIDTH);
      maxY = Math.max(maxY, node.y + NODE_HEIGHT);
    }

    // Add padding
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  });

  // Calculate minimap scale
  const minimapScale = createMemo(() => {
    const bounds = nodeBounds();
    const scaleX = MINIMAP_WIDTH / bounds.width;
    const scaleY = MINIMAP_HEIGHT / bounds.height;
    return Math.min(scaleX, scaleY, 1);
  });

  // Convert canvas coordinates to minimap coordinates
  const toMinimap = (x: number, y: number) => {
    const bounds = nodeBounds();
    const scale = minimapScale();
    return {
      x: (x - bounds.minX) * scale,
      y: (y - bounds.minY) * scale,
    };
  };

  // Current viewport rectangle
  const viewportRect = createMemo(() => {
    const mmScale = minimapScale();

    // Viewport in canvas coordinates
    const vpX = -props.offset.x / props.scale;
    const vpY = -props.offset.y / props.scale;
    const vpWidth = props.canvasWidth / props.scale;
    const vpHeight = props.canvasHeight / props.scale;

    // Convert to minimap coordinates
    const pos = toMinimap(vpX, vpY);
    return {
      x: pos.x,
      y: pos.y,
      width: vpWidth * mmScale,
      height: vpHeight * mmScale,
    };
  });

  // Handle click to navigate
  const handleClick = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scale = minimapScale();
    const bounds = nodeBounds();

    // Convert minimap click to canvas coordinates
    const canvasX = clickX / scale + bounds.minX;
    const canvasY = clickY / scale + bounds.minY;

    // Center viewport on clicked position
    const newOffsetX = -(canvasX * props.scale) + props.canvasWidth / 2;
    const newOffsetY = -(canvasY * props.scale) + props.canvasHeight / 2;

    props.onViewportChange({ x: newOffsetX, y: newOffsetY });
  };

  return (
    <div
      class="absolute bottom-12 right-3 rounded-lg border border-border bg-surface/90 backdrop-blur-sm overflow-hidden cursor-pointer shadow-lg"
      style={{
        width: `${MINIMAP_WIDTH}px`,
        height: `${MINIMAP_HEIGHT}px`,
      }}
      onClick={handleClick}
    >
      {/* Nodes */}
      <For each={currentScript()?.nodes ?? []}>
        {(node) => {
          const pos = () => toMinimap(node.x, node.y);
          const scale = minimapScale();
          const isTarget = () => getNodeContext(node.type) === "target";
          const isEvent = () => node.type.startsWith("event_");
          const isSelected = () => scriptStore.isNodeSelected(node.id);

          return (
            <div
              class={`absolute rounded-sm ${
                isSelected()
                  ? "ring-1 ring-accent"
                  : ""
              } ${
                isEvent()
                  ? "bg-emerald-500"
                  : isTarget()
                    ? "bg-red-500"
                    : "bg-blue-500"
              }`}
              style={{
                left: `${pos().x}px`,
                top: `${pos().y}px`,
                width: `${Math.max(NODE_WIDTH * scale, 3)}px`,
                height: `${Math.max(4, 4)}px`,
                opacity: isSelected() ? 1 : 0.7,
              }}
            />
          );
        }}
      </For>

      {/* Viewport rectangle */}
      <div
        class="absolute border-2 border-accent/70 bg-accent/10 rounded pointer-events-none"
        style={{
          left: `${Math.max(0, viewportRect().x)}px`,
          top: `${Math.max(0, viewportRect().y)}px`,
          width: `${viewportRect().width}px`,
          height: `${viewportRect().height}px`,
        }}
      />

      {/* Legend */}
      <div class="absolute bottom-1 right-1 flex items-center gap-1 text-[7px] text-foreground-muted">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
      </div>
    </div>
  );
};

export default CanvasMinimap;
