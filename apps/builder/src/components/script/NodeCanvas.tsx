import {
  Component,
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js";
import {
  scriptStore,
  type ScriptNode,
  type ScriptNodeType,
  type Port,
  getNodeContext,
  getPortTypeSchema,
  formatTypeSchema,
} from "@/stores/script";
import { TrashIcon, IconZap, MemoryIcon } from "@/components/common/Icons";
import { QuickNodeMenu } from "./QuickNodeMenu";
import { CanvasMinimap } from "./CanvasMinimap";

// Port type colors for visual distinction
const portTypeColors: Record<string, { border: string; bg: string }> = {
  flow: { border: "border-blue-400", bg: "bg-blue-900" },
  boolean: { border: "border-yellow-400", bg: "bg-yellow-900" },
  string: { border: "border-green-400", bg: "bg-green-900" },
  pointer: { border: "border-red-400", bg: "bg-red-900" },
  int8: { border: "border-orange-400", bg: "bg-orange-900" },
  uint8: { border: "border-orange-400", bg: "bg-orange-900" },
  int16: { border: "border-orange-400", bg: "bg-orange-900" },
  uint16: { border: "border-orange-400", bg: "bg-orange-900" },
  int32: { border: "border-orange-400", bg: "bg-orange-900" },
  uint32: { border: "border-orange-400", bg: "bg-orange-900" },
  int64: { border: "border-orange-400", bg: "bg-orange-900" },
  uint64: { border: "border-orange-400", bg: "bg-orange-900" },
  float: { border: "border-cyan-400", bg: "bg-cyan-900" },
  double: { border: "border-cyan-400", bg: "bg-cyan-900" },
  array: { border: "border-violet-400", bg: "bg-violet-900" },
  object: { border: "border-amber-400", bg: "bg-amber-900" },
  any: { border: "border-purple-400", bg: "bg-purple-900" },
};

// Get color for a port based on its type
function getPortColor(port: Port): { border: string; bg: string } {
  if (port.type === "flow") {
    return portTypeColors.flow;
  }
  return portTypeColors[port.valueType || "any"] || portTypeColors.any;
}

// Get stroke color for connection line based on port types
function getConnectionColor(fromPort: Port | undefined): string {
  if (!fromPort) return "#a855f7";
  if (fromPort.type === "flow") return "#3b82f6";

  const colorMap: Record<string, string> = {
    boolean: "#facc15",
    string: "#22c55e",
    pointer: "#ef4444",
    int8: "#f97316",
    uint8: "#f97316",
    int16: "#f97316",
    uint16: "#f97316",
    int32: "#f97316",
    uint32: "#f97316",
    int64: "#f97316",
    uint64: "#f97316",
    float: "#06b6d4",
    double: "#06b6d4",
    array: "#8b5cf6",
    object: "#f59e0b",
    any: "#a855f7",
  };
  return colorMap[fromPort.valueType || "any"] || "#a855f7";
}

// Comment colors
const commentColors: Record<string, { bg: string; border: string }> = {
  gray: { bg: "bg-gray-800/50", border: "border-gray-600/50" },
  yellow: { bg: "bg-yellow-900/40", border: "border-yellow-600/50" },
  green: { bg: "bg-green-900/40", border: "border-green-600/50" },
  blue: { bg: "bg-blue-900/40", border: "border-blue-600/50" },
  red: { bg: "bg-red-900/40", border: "border-red-600/50" },
  purple: { bg: "bg-purple-900/40", border: "border-purple-600/50" },
};

// Node colors by category - Host nodes have subtle styling, Target nodes are more prominent
const nodeColors: Record<
  string,
  { bg: string; border: string; header: string; isTarget?: boolean }
> = {
  // Host categories (blue-tinted, subtle)
  Constants: {
    bg: "bg-pink-900/20",
    border: "border-pink-500/40",
    header: "bg-pink-500/15",
  },
  Events: {
    bg: "bg-emerald-900/20",
    border: "border-emerald-500/40",
    header: "bg-emerald-500/15",
  },
  Flow: {
    bg: "bg-blue-900/20",
    border: "border-blue-500/40",
    header: "bg-blue-500/15",
  },
  Variable: {
    bg: "bg-yellow-900/20",
    border: "border-yellow-500/40",
    header: "bg-yellow-500/15",
  },
  Array: {
    bg: "bg-indigo-900/20",
    border: "border-indigo-500/40",
    header: "bg-indigo-500/15",
  },
  Object: {
    bg: "bg-sky-900/20",
    border: "border-sky-500/40",
    header: "bg-sky-500/15",
  },
  Math: {
    bg: "bg-orange-900/20",
    border: "border-orange-500/40",
    header: "bg-orange-500/15",
  },
  String: {
    bg: "bg-teal-900/20",
    border: "border-teal-500/40",
    header: "bg-teal-500/15",
  },
  Conversion: {
    bg: "bg-lime-900/20",
    border: "border-lime-500/40",
    header: "bg-lime-500/15",
  },
  Output: {
    bg: "bg-cyan-900/20",
    border: "border-cyan-500/40",
    header: "bg-cyan-500/15",
  },
  Device: {
    bg: "bg-slate-900/20",
    border: "border-slate-500/40",
    header: "bg-slate-500/15",
  },
  Process: {
    bg: "bg-gray-900/20",
    border: "border-gray-500/40",
    header: "bg-gray-500/15",
  },
  Function: {
    bg: "bg-amber-900/20",
    border: "border-amber-500/40",
    header: "bg-amber-500/15",
  },
  UI: {
    bg: "bg-indigo-900/20",
    border: "border-indigo-500/40",
    header: "bg-indigo-500/15",
  },
  // Target categories (red-tinted, more prominent with dashed border indicator)
  Memory: {
    bg: "bg-gradient-to-br from-purple-900/30 to-red-900/20",
    border: "border-purple-500/50 border-dashed",
    header: "bg-purple-500/25",
    isTarget: true,
  },
  Pointer: {
    bg: "bg-gradient-to-br from-violet-900/30 to-red-900/20",
    border: "border-violet-500/50 border-dashed",
    header: "bg-violet-500/25",
    isTarget: true,
  },
  Module: {
    bg: "bg-gradient-to-br from-green-900/30 to-red-900/20",
    border: "border-green-500/50 border-dashed",
    header: "bg-green-500/25",
    isTarget: true,
  },
  Native: {
    bg: "bg-gradient-to-br from-red-900/30 to-red-950/30",
    border: "border-red-500/50 border-dashed",
    header: "bg-red-500/25",
    isTarget: true,
  },
  Interceptor: {
    bg: "bg-gradient-to-br from-rose-900/30 to-red-900/20",
    border: "border-rose-500/50 border-dashed",
    header: "bg-rose-500/25",
    isTarget: true,
  },
};

// Get node styling including target indicator
function getNodeStyle(type: ScriptNodeType): {
  bg: string;
  border: string;
  header: string;
  isTarget: boolean;
} {
  const category = getNodeCategory(type);
  const colors = nodeColors[category] ?? nodeColors.Flow;
  const isTarget = getNodeContext(type) === "target";
  return {
    ...colors,
    isTarget,
  };
}

// Get category for node type
function getNodeCategory(type: ScriptNodeType): string {
  const template = scriptStore.nodeTemplates.find((t) => t.type === type);
  return template?.category ?? "Flow";
}

// Selection box interface
interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// Check if Mac for keyboard shortcuts
const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;

export const NodeCanvas: Component = () => {
  let canvasRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [scale, setScale] = createSignal(1);

  // Selection box state (for drag selection)
  const [selectionBox, setSelectionBox] = createSignal<SelectionBox | null>(
    null,
  );
  const [isSelecting, setIsSelecting] = createSignal(false);

  // Connection dragging state
  const [draggingConnection, setDraggingConnection] = createSignal<{
    fromNodeId: string;
    fromPortId: string;
    fromPort: Port;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    connectionId: string;
  } | null>(null);

  // Quick node menu state (opened with Space key)
  const [quickMenu, setQuickMenu] = createSignal<{
    screenX: number;
    screenY: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // Canvas dimensions for minimap
  const [canvasDimensions, setCanvasDimensions] = createSignal({ width: 800, height: 600 });
  const [showMinimap, setShowMinimap] = createSignal(true);

  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  // Handle wheel for pan (normal scroll) and zoom (Ctrl/Cmd + scroll)
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl/Cmd + scroll - smoother zoom
      const delta = e.deltaY > 0 ? 0.97 : 1.03;
      const newScale = Math.min(Math.max(scale() * delta, 0.25), 3);

      // Zoom towards mouse position
      if (canvasRef) {
        const rect = canvasRef.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const oldScale = scale();
        const scaleRatio = newScale / oldScale;

        // Adjust offset to zoom towards mouse position
        setOffset((prev) => ({
          x: mouseX - (mouseX - prev.x) * scaleRatio,
          y: mouseY - (mouseY - prev.y) * scaleRatio,
        }));
      }

      setScale(newScale);
    } else {
      // Pan with normal scroll
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Handle canvas mouse down for selection box
  const handleMouseDown = (e: MouseEvent) => {
    // Close context menu
    setContextMenu(null);

    // Check if clicking on empty canvas (not on nodes)
    const target = e.target as HTMLElement;
    const isOnNode = target.closest("[data-node-id]");
    const isOnConnection = target.closest("[data-connection]");

    if (!isOnNode && !isOnConnection && e.button === 0 && canvasRef) {
      // Start selection box
      const rect = canvasRef.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset().x) / scale();
      const y = (e.clientY - rect.top - offset().y) / scale();

      setIsSelecting(true);
      setSelectionBox({
        startX: x,
        startY: y,
        endX: x,
        endY: y,
      });

      // If not holding Shift, clear selection (Adobe style)
      const addToSelection = e.shiftKey;
      if (!addToSelection) {
        scriptStore.selectNode(null);
        scriptStore.setSelectedConnectionId(null);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    // Update selection box
    if (isSelecting() && canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset().x) / scale();
      const y = (e.clientY - rect.top - offset().y) / scale();

      setSelectionBox((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
    }

    // Update connection drag position
    const dc = draggingConnection();
    if (dc && canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      setDraggingConnection({
        ...dc,
        currentX: (e.clientX - rect.left - offset().x) / scale(),
        currentY: (e.clientY - rect.top - offset().y) / scale(),
      });
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    // Handle selection box completion
    if (isSelecting() && selectionBox()) {
      const box = selectionBox()!;
      const script = currentScript();
      if (script) {
        // Calculate actual box bounds
        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);

        // Only consider it a drag selection if box is bigger than a few pixels
        if (maxX - minX > 5 || maxY - minY > 5) {
          // Find all nodes that intersect with selection box
          const nodeWidth = 200; // Node width constant
          const selectedIds = script.nodes
            .filter((node) => {
              const nodeRight = node.x + nodeWidth;
              const nodeBottom =
                node.y +
                60 +
                node.inputs.length * 24 +
                node.outputs.length * 24;
              return (
                node.x < maxX &&
                nodeRight > minX &&
                node.y < maxY &&
                nodeBottom > minY
              );
            })
            .map((n) => n.id);

          const addToSelection = e.shiftKey;
          scriptStore.selectMultipleNodes(selectedIds, addToSelection);
        }
      }
    }

    setIsSelecting(false);
    setSelectionBox(null);

    // Clear dragging connection if not dropped on a valid port
    setDraggingConnection(null);
  };

  // Handle right-click on connection to show context menu
  const handleConnectionRightClick = (e: MouseEvent, connectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      connectionId,
    });
    scriptStore.setSelectedConnectionId(connectionId);
  };

  // Delete selected connection from context menu
  const handleDeleteConnection = () => {
    const menu = contextMenu();
    if (menu) {
      scriptStore.deleteConnection(menu.connectionId);
      setContextMenu(null);
    }
  };

  // Keyboard shortcuts are now handled centrally by hotkeys store in App.tsx
  // This ensures consistent behavior across tabs and proper macOS Backspace/Delete handling

  // Handle keyboard shortcuts for canvas
  const handleKeyDown = (e: KeyboardEvent) => {
    // Space key to open quick node menu
    if (e.code === "Space" && !e.repeat && canvasRef) {
      // Don't open if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      e.preventDefault();

      // Get mouse position or center of canvas
      const rect = canvasRef.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Convert to canvas coordinates
      const canvasX = (centerX - rect.left - offset().x) / scale();
      const canvasY = (centerY - rect.top - offset().y) / scale();

      setQuickMenu({
        screenX: centerX - 140, // Half of menu width
        screenY: centerY - 100,
        canvasX,
        canvasY,
      });
    }
  };

  // Handle quick node selection
  const handleQuickNodeSelect = (type: ScriptNodeType, x: number, y: number) => {
    scriptStore.addNode(type, x, y);
  };

  // Handle drop from palette
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData("nodeType") as ScriptNodeType;
    if (!type || !canvasRef) return;

    const rect = canvasRef.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset().x) / scale();
    const y = (e.clientY - rect.top - offset().y) / scale();

    scriptStore.addNode(type, x, y);
  };

  // Handle connection start
  const handlePortMouseDown = (
    e: MouseEvent,
    nodeId: string,
    port: Port,
    portX: number,
    portY: number,
  ) => {
    e.stopPropagation();
    if (port.direction === "output") {
      setDraggingConnection({
        fromNodeId: nodeId,
        fromPortId: port.id,
        fromPort: port,
        startX: portX,
        startY: portY,
        currentX: portX,
        currentY: portY,
      });
    }
  };

  // Handle connection end
  const handlePortMouseUp = (e: MouseEvent, nodeId: string, port: Port) => {
    e.stopPropagation();
    const dc = draggingConnection();
    if (dc && port.direction === "input") {
      // Create connection (validation happens inside addConnection)
      const result = scriptStore.addConnection(
        dc.fromNodeId,
        dc.fromPortId,
        nodeId,
        port.id,
      );
      if (!result) {
        // Connection failed - show brief visual feedback
        // The validation error is already logged to console
      }
    }
    setDraggingConnection(null);
  };

  // Check if a port is compatible with the currently dragging connection
  const isPortCompatible = (nodeId: string, port: Port): boolean => {
    const dc = draggingConnection();
    if (!dc) return false;
    if (port.direction !== "input") return false;
    if (dc.fromNodeId === nodeId) return false; // Can't connect to self

    // Type compatibility check
    if (dc.fromPort.type !== port.type) return false;
    if (dc.fromPort.type === "value") {
      const fromType = dc.fromPort.valueType;
      const toType = port.valueType;
      // "any" is compatible with everything
      if (fromType === "any" || toType === "any") return true;
      if (fromType === toType) return true;
      // Numeric types are compatible with each other
      const numericTypes = [
        "int8",
        "uint8",
        "int16",
        "uint16",
        "int32",
        "uint32",
        "int64",
        "uint64",
        "float",
        "double",
      ];
      if (
        numericTypes.includes(fromType || "") &&
        numericTypes.includes(toType || "")
      )
        return true;
      // Pointer can convert to/from numeric
      if (
        (fromType === "pointer" && numericTypes.includes(toType || "")) ||
        (toType === "pointer" && numericTypes.includes(fromType || ""))
      )
        return true;
      return false;
    }
    return true;
  };

  onMount(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    // Track canvas dimensions
    if (canvasRef) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setCanvasDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      resizeObserver.observe(canvasRef);
      onCleanup(() => resizeObserver.disconnect());
    }
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("keydown", handleKeyDown);
  });

  // Get port position for a node
  // Port layout: header (28px) + py-1 (4px) + inputs (24px each) + outputs (24px each)
  const getPortPosition = (node: ScriptNode, port: Port, isInput: boolean) => {
    const nodeWidth = 200;
    const headerHeight = 28;
    const paddingTop = 4; // py-1
    const portHeight = 24; // h-6

    const ports = isInput ? node.inputs : node.outputs;
    const index = ports.findIndex((p) => p.id === port.id);

    const x = isInput ? node.x : node.x + nodeWidth;

    // Output ports come after input ports in the layout
    const inputPortsHeight = node.inputs.length * portHeight;
    const baseY = node.y + headerHeight + paddingTop;

    const y = isInput
      ? baseY + index * portHeight + portHeight / 2
      : baseY + inputPortsHeight + index * portHeight + portHeight / 2;

    return { x, y };
  };

  return (
    <div class="flex-1 flex flex-col">
      {/* Toolbar */}
      <div class="h-10 border-b border-border flex items-center justify-between px-4 bg-surface">
        <div class="flex items-center gap-4">
          <Show when={currentScript()}>
            <input
              type="text"
              class="text-sm font-medium bg-transparent border-none focus:outline-none"
              value={currentScript()!.name}
              onInput={(e) =>
                scriptStore.updateScript(currentScript()!.id, {
                  name: e.currentTarget.value,
                })
              }
            />
          </Show>
          <Show when={scriptStore.selectedNodeIds().size > 1}>
            <span class="text-xs text-accent">
              {scriptStore.selectedNodeIds().size} nodes selected
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2 text-xs text-foreground-muted">
          <span>Zoom: {Math.round(scale() * 100)}%</span>
          <button
            class="px-2 py-1 hover:bg-surface-hover rounded"
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        class="flex-1 relative overflow-hidden bg-background select-none"
        style={{
          "background-image":
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          "background-size": `${20 * scale()}px ${20 * scale()}px`,
          "background-position": `${offset().x}px ${offset().y}px`,
          cursor: isSelecting() ? "crosshair" : "default",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Transform container */}
        <div
          style={{
            transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()})`,
            "transform-origin": "0 0",
          }}
        >
          {/* SVG for connections */}
          <svg
            ref={svgRef}
            class="absolute inset-0"
            style={{
              width: "10000px",
              height: "10000px",
              overflow: "visible",
              "pointer-events": "none",
            }}
          >
            {/* Render connections */}
            <For each={currentScript()?.connections ?? []}>
              {(conn) => {
                // Use getter functions to ensure reactivity when nodes move
                const fromNode = () =>
                  currentScript()?.nodes.find((n) => n.id === conn.fromNodeId);
                const toNode = () =>
                  currentScript()?.nodes.find((n) => n.id === conn.toNodeId);

                const fromPort = () =>
                  fromNode()?.outputs.find((p) => p.id === conn.fromPortId);
                const toPort = () =>
                  toNode()?.inputs.find((p) => p.id === conn.toPortId);

                const start = () => {
                  const node = fromNode();
                  const port = fromPort();
                  if (!node || !port) return { x: 0, y: 0 };
                  return getPortPosition(node, port, false);
                };
                const end = () => {
                  const node = toNode();
                  const port = toPort();
                  if (!node || !port) return { x: 0, y: 0 };
                  return getPortPosition(node, port, true);
                };

                const strokeColor = () => getConnectionColor(fromPort());

                // Get type info for connection tooltip
                const typeInfo = () => {
                  const node = fromNode();
                  const port = fromPort();
                  if (!node || !port || port.type === "flow") return undefined;

                  // Try to get schema-based type info
                  const schema = getPortTypeSchema(node.type, port.name, true);
                  if (schema) {
                    return formatTypeSchema(schema);
                  }

                  // Fall back to simple type
                  return port.valueType || "any";
                };

                return (
                  <Show when={fromNode() && toNode() && fromPort() && toPort()}>
                    <ConnectionLine
                      x1={start().x}
                      y1={start().y}
                      x2={end().x}
                      y2={end().y}
                      color={strokeColor()}
                      isSelected={
                        scriptStore.selectedConnectionId() === conn.id
                      }
                      typeInfo={typeInfo()}
                      onClick={(e) => {
                        if (e.altKey) {
                          scriptStore.deleteConnection(conn.id);
                        } else {
                          scriptStore.setSelectedConnectionId(conn.id);
                        }
                      }}
                      onContextMenu={(e) =>
                        handleConnectionRightClick(e, conn.id)
                      }
                    />
                  </Show>
                );
              }}
            </For>

            {/* Dragging connection preview */}
            <Show when={draggingConnection()}>
              {(dc) => (
                <ConnectionLine
                  x1={dc().startX}
                  y1={dc().startY}
                  x2={dc().currentX}
                  y2={dc().currentY}
                  color={getConnectionColor(dc().fromPort)}
                  isDashed
                />
              )}
            </Show>
          </svg>

          {/* Render nodes */}
          <For each={currentScript()?.nodes ?? []}>
            {(node) => (
              <NodeComponent
                node={node}
                isSelected={scriptStore.isNodeSelected(node.id)}
                isPrimarySelected={scriptStore.selectedNodeId() === node.id}
                onSelect={(addToSelection) =>
                  scriptStore.selectNode(node.id, addToSelection)
                }
                onPortMouseDown={handlePortMouseDown}
                onPortMouseUp={handlePortMouseUp}
                getPortPosition={getPortPosition}
                scale={scale()}
                isDraggingConnection={!!draggingConnection()}
                isPortCompatible={(port) => isPortCompatible(node.id, port)}
              />
            )}
          </For>
        </div>

        {/* Selection box overlay */}
        <Show when={isSelecting() && selectionBox()}>
          {(box) => {
            const minX = () => Math.min(box().startX, box().endX);
            const minY = () => Math.min(box().startY, box().endY);
            const width = () => Math.abs(box().endX - box().startX);
            const height = () => Math.abs(box().endY - box().startY);
            return (
              <div
                class="absolute pointer-events-none border-2 border-accent bg-accent/10"
                style={{
                  left: `${minX() * scale() + offset().x}px`,
                  top: `${minY() * scale() + offset().y}px`,
                  width: `${width() * scale()}px`,
                  height: `${height() * scale()}px`,
                }}
              />
            );
          }}
        </Show>

        {/* Empty state */}
        <Show when={(currentScript()?.nodes.length ?? 0) === 0}>
          <div class="absolute inset-0 flex items-center justify-center text-foreground-muted pointer-events-none">
            <div class="text-center">
              <p>Drag nodes from the palette</p>
              <p class="text-xs mt-1">to build your script flow</p>
            </div>
          </div>
        </Show>

        {/* Context menu for connections */}
        <Show when={contextMenu()}>
          {(menu) => (
            <div
              class="fixed z-50 min-w-32 py-1 bg-surface border border-border rounded-lg shadow-lg"
              style={{
                left: `${menu().x}px`,
                top: `${menu().y}px`,
              }}
            >
              <button
                class="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-hover flex items-center gap-2 text-error"
                onClick={handleDeleteConnection}
              >
                <TrashIcon class="w-3 h-3" />
                Delete Connection
              </button>
              <div class="px-3 py-1 text-[10px] text-foreground-muted border-t border-border mt-1 pt-1">
                Tip: Select and press Delete key
              </div>
            </div>
          )}
        </Show>

        {/* Help text */}
        <div class="absolute bottom-2 left-2 text-[10px] text-foreground-muted/50 pointer-events-none">
          <span>
            Scroll: Pan | {isMac ? "⌘" : "Ctrl"}+Scroll: Zoom | Space: Quick add
            | Shift+Click: Multi-select
          </span>
        </div>

        {/* Quick node menu */}
        <Show when={quickMenu()}>
          {(menu) => (
            <QuickNodeMenu
              x={menu().screenX}
              y={menu().screenY}
              canvasX={menu().canvasX}
              canvasY={menu().canvasY}
              onSelect={handleQuickNodeSelect}
              onClose={() => setQuickMenu(null)}
            />
          )}
        </Show>

        {/* Minimap */}
        <Show when={showMinimap() && (currentScript()?.nodes.length ?? 0) > 0}>
          <CanvasMinimap
            offset={offset()}
            scale={scale()}
            canvasWidth={canvasDimensions().width}
            canvasHeight={canvasDimensions().height}
            onViewportChange={setOffset}
          />
        </Show>

        {/* Minimap toggle */}
        <button
          class="absolute bottom-2 right-3 px-2 py-1 text-[10px] bg-surface/80 hover:bg-surface border border-border rounded transition-colors"
          onClick={() => setShowMinimap(!showMinimap())}
        >
          {showMinimap() ? "Hide Map" : "Show Map"}
        </button>
      </div>
    </div>
  );
};

// Connection line component
interface ConnectionLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  isSelected?: boolean;
  isDashed?: boolean;
  typeInfo?: string; // Type information to show on hover
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
}

const ConnectionLine: Component<ConnectionLineProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  // Create bezier curve path
  const path = () => {
    const dx = Math.abs(props.x2 - props.x1);
    const controlOffset = Math.max(50, dx * 0.5);

    return `M ${props.x1} ${props.y1}
            C ${props.x1 + controlOffset} ${props.y1},
              ${props.x2 - controlOffset} ${props.y2},
              ${props.x2} ${props.y2}`;
  };

  // Midpoint for type label
  const midpoint = () => {
    const t = 0.5;
    const x1 = props.x1;
    const y1 = props.y1;
    const x2 = props.x2;
    const y2 = props.y2;
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.max(50, dx * 0.5);

    // Bezier curve midpoint calculation
    const cx1 = x1 + controlOffset;
    const cy1 = y1;
    const cx2 = x2 - controlOffset;
    const cy2 = y2;

    const mt = 1 - t;
    const x = mt * mt * mt * x1 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x2;
    const y = mt * mt * mt * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y2;

    return { x, y };
  };

  return (
    <g class="pointer-events-auto">
      {/* Wider invisible path for easier clicking */}
      <path
        d={path()}
        fill="none"
        stroke="transparent"
        stroke-width="12"
        style={{ cursor: "pointer" }}
        onClick={props.onClick}
        onContextMenu={props.onContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      {/* Visible path */}
      <path
        d={path()}
        fill="none"
        stroke={props.color}
        stroke-width={props.isSelected ? 3 : isHovered() ? 2.5 : 2}
        stroke-dasharray={props.isDashed ? "5,5" : undefined}
        style={{ "pointer-events": "none" }}
      />
      {/* Selection indicator */}
      <Show when={props.isSelected}>
        <path
          d={path()}
          fill="none"
          stroke="white"
          stroke-width={5}
          stroke-opacity={0.3}
          style={{ "pointer-events": "none" }}
        />
      </Show>
      {/* Type info label on hover */}
      <Show when={isHovered() && props.typeInfo}>
        <g>
          <rect
            x={midpoint().x - 40}
            y={midpoint().y - 12}
            width="80"
            height="18"
            rx="4"
            fill="rgba(0, 0, 0, 0.85)"
            stroke={props.color}
            stroke-width="1"
          />
          <text
            x={midpoint().x}
            y={midpoint().y + 3}
            text-anchor="middle"
            fill="white"
            font-size="9"
            font-family="monospace"
            style={{ "pointer-events": "none" }}
          >
            {props.typeInfo}
          </text>
        </g>
      </Show>
    </g>
  );
};

// Node component
interface NodeComponentProps {
  node: ScriptNode;
  isSelected: boolean;
  isPrimarySelected: boolean;
  onSelect: (addToSelection: boolean) => void;
  onPortMouseDown: (
    e: MouseEvent,
    nodeId: string,
    port: Port,
    portX: number,
    portY: number,
  ) => void;
  onPortMouseUp: (e: MouseEvent, nodeId: string, port: Port) => void;
  getPortPosition: (
    node: ScriptNode,
    port: Port,
    isInput: boolean,
  ) => { x: number; y: number };
  scale: number;
  isDraggingConnection: boolean;
  isPortCompatible: (port: Port) => boolean;
}

const NodeComponent: Component<NodeComponentProps> = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);

  const style = () => getNodeStyle(props.node.type);
  const isTarget = () => getNodeContext(props.node.type) === "target";
  const isEventNode = () => props.node.type.startsWith("event_");

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // Prevent text selection and default drag behavior
    e.stopPropagation();

    // Handle Shift+click for multi-select (Adobe style)
    const addToSelection = e.shiftKey;

    // If not already selected, select this node
    if (!props.isSelected) {
      props.onSelect(addToSelection);
    } else if (addToSelection) {
      // Toggle off if Shift+clicking already selected node
      props.onSelect(true);
      return;
    }

    setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const currentScale = props.scale;

    // Store initial positions for all selected nodes
    const selectedNodes = scriptStore.getSelectedNodes();
    const initialPositions = new Map(
      selectedNodes.map((n) => [n.id, { x: n.x, y: n.y }]),
    );

    const handleMove = (e: MouseEvent) => {
      e.preventDefault();
      // Apply scale factor to movement delta
      const dx = (e.clientX - startX) / currentScale;
      const dy = (e.clientY - startY) / currentScale;

      // Move all selected nodes
      const nodes = scriptStore.getSelectedNodes();
      for (const node of nodes) {
        const initial = initialPositions.get(node.id);
        if (initial) {
          scriptStore.updateNode(node.id, {
            x: Math.round(initial.x + dx),
            y: Math.round(initial.y + dy),
          });
        }
      }
    };

    const handleUp = (e: MouseEvent) => {
      e.preventDefault();
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMove, true);
      window.removeEventListener("mouseup", handleUp, true);
    };

    // Use capture phase to ensure we get events before anything else
    window.addEventListener("mousemove", handleMove, true);
    window.addEventListener("mouseup", handleUp, true);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    // Delete all selected nodes if multiple selected, otherwise just this one
    if (scriptStore.selectedNodeIds().size > 1) {
      scriptStore.deleteSelectedNodes();
    } else {
      scriptStore.deleteNode(props.node.id);
    }
  };

  // Ring style based on primary/secondary selection
  const ringClass = () => {
    if (props.isPrimarySelected) return "ring-2 ring-accent";
    if (props.isSelected) return "ring-2 ring-accent/60";
    return "";
  };

  // Check if this is a comment node
  const isComment = () => props.node.type === "comment";
  const commentColor = () => commentColors[props.node.config?.color as string] ?? commentColors.gray;

  // Render comment node differently
  if (isComment()) {
    const width = () => props.node.config?.width as number ?? 200;
    const height = () => props.node.config?.height as number ?? 80;

    return (
      <div
        data-node-id={props.node.id}
        class={`absolute rounded-lg border-2 border-dashed ${commentColor().bg} ${commentColor().border} ${ringClass()}`}
        style={{
          left: `${props.node.x}px`,
          top: `${props.node.y}px`,
          width: `${width()}px`,
          height: `${height()}px`,
          cursor: isDragging() ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Comment content */}
        <div class="p-2 h-full flex flex-col">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] text-foreground-muted uppercase tracking-wider font-medium">
              💬 Comment
            </span>
            <Show when={props.isSelected}>
              <button
                class="p-0.5 hover:bg-error/30 rounded transition-colors"
                onClick={handleDelete}
              >
                <TrashIcon class="w-3 h-3 text-error" />
              </button>
            </Show>
          </div>
          <p class="text-xs text-foreground flex-1 overflow-hidden whitespace-pre-wrap">
            {props.node.config?.text as string ?? ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-node-id={props.node.id}
      class={`absolute rounded-lg border shadow-lg ${style().bg} ${style().border} ${ringClass()}`}
      style={{
        left: `${props.node.x}px`,
        top: `${props.node.y}px`,
        width: "200px",
        cursor: isDragging() ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Target node indicator strip */}
      <Show when={isTarget()}>
        <div class="absolute -top-0.5 left-2 right-2 h-1 bg-gradient-to-r from-red-500 to-rose-500 rounded-t-full opacity-80" />
      </Show>

      {/* Header */}
      <div
        class={`px-3 py-1.5 rounded-t-lg border-b ${style().header} ${style().border} flex items-center gap-2`}
      >
        {/* Context indicator icon */}
        <Show
          when={isTarget()}
          fallback={
            <Show when={isEventNode()}>
              <IconZap class="w-3 h-3 text-emerald-400 flex-shrink-0" />
            </Show>
          }
        >
          <MemoryIcon class="w-3 h-3 text-red-400 flex-shrink-0" />
        </Show>

        <span class="text-xs font-medium truncate flex-1">{props.node.label}</span>

        {/* Target badge */}
        <Show when={isTarget()}>
          <span class="text-[7px] px-1 py-0.5 rounded bg-red-500/30 text-red-300 font-medium flex-shrink-0">
            TARGET
          </span>
        </Show>

        <Show when={props.isSelected && !isEventNode()}>
          <button
            class="p-0.5 hover:bg-error/30 rounded transition-colors flex-shrink-0"
            onClick={handleDelete}
          >
            <TrashIcon class="w-3 h-3 text-error" />
          </button>
        </Show>
      </div>

      {/* Ports */}
      <div class="relative py-1">
        {/* Input ports */}
        <For each={props.node.inputs}>
          {(port) => {
            const portColor = getPortColor(port);
            const isCompatible = () =>
              props.isDraggingConnection && props.isPortCompatible(port);
            const isIncompatible = () =>
              props.isDraggingConnection && !props.isPortCompatible(port);

            // Generate tooltip with type conversion hint
            const portTooltip = () => {
              const baseTooltip = port.valueType
                ? `${port.name} (${port.valueType})`
                : port.name;

              if (isCompatible()) {
                return `${baseTooltip} - Drop to connect`;
              }
              return baseTooltip;
            };

            return (
              <div class="flex items-center h-6 px-2 group relative">
                <div
                  class={`w-3 h-3 rounded-full border-2 -ml-4 cursor-pointer transition-all ${portColor.border} ${portColor.bg} ${
                    isCompatible()
                      ? "scale-150 ring-2 ring-green-400 ring-offset-1 ring-offset-transparent animate-pulse"
                      : isIncompatible()
                        ? "opacity-30 scale-75"
                        : "hover:scale-125"
                  }`}
                  onMouseUp={(e) => props.onPortMouseUp(e, props.node.id, port)}
                  title={portTooltip()}
                />
                {/* Compatible port indicator */}
                <Show when={isCompatible()}>
                  <span class="absolute -left-2 text-[8px] text-green-400 font-bold animate-pulse">
                    +
                  </span>
                </Show>
                <span
                  class={`text-[10px] ml-2 transition-opacity ${
                    isIncompatible() ? "opacity-30" : isCompatible() ? "text-green-400" : "text-foreground-muted"
                  }`}
                >
                  {port.name}
                  {port.valueType && port.valueType !== "any" && (
                    <span class="text-[8px] opacity-60 ml-1">
                      ({port.valueType})
                    </span>
                  )}
                </span>
              </div>
            );
          }}
        </For>

        {/* Output ports */}
        <For each={props.node.outputs}>
          {(port) => {
            const pos = () => props.getPortPosition(props.node, port, false);
            const portColor = getPortColor(port);
            return (
              <div class="flex items-center justify-end h-6 px-2 group">
                <span class="text-[10px] text-foreground-muted mr-2">
                  {port.valueType && port.valueType !== "any" && (
                    <span class="text-[8px] opacity-60 mr-1">
                      ({port.valueType})
                    </span>
                  )}
                  {port.name}
                </span>
                <div
                  class={`w-3 h-3 rounded-full border-2 -mr-4 cursor-pointer transition-transform hover:scale-125 ${portColor.border} ${portColor.bg}`}
                  onMouseDown={(e) => {
                    props.onPortMouseDown(
                      e,
                      props.node.id,
                      port,
                      pos().x,
                      pos().y,
                    );
                  }}
                  title={
                    port.valueType
                      ? `${port.name} (${port.valueType})`
                      : port.name
                  }
                />
              </div>
            );
          }}
        </For>

        <Show
          when={
            props.node.inputs.length === 0 && props.node.outputs.length === 0
          }
        >
          <div class="h-6" />
        </Show>
      </div>
    </div>
  );
};

export default NodeCanvas;
