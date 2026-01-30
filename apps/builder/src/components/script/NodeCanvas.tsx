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
  type ValueType,
} from "@/stores/script";
import { TrashIcon } from "@/components/common/Icons";

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
    any: "#a855f7",
  };
  return colorMap[fromPort.valueType || "any"] || "#a855f7";
}

// Node colors by category
const nodeColors: Record<
  string,
  { bg: string; border: string; header: string }
> = {
  Flow: {
    bg: "bg-blue-900/30",
    border: "border-blue-500/50",
    header: "bg-blue-500/20",
  },
  Memory: {
    bg: "bg-purple-900/30",
    border: "border-purple-500/50",
    header: "bg-purple-500/20",
  },
  Pointer: {
    bg: "bg-violet-900/30",
    border: "border-violet-500/50",
    header: "bg-violet-500/20",
  },
  Module: {
    bg: "bg-green-900/30",
    border: "border-green-500/50",
    header: "bg-green-500/20",
  },
  Variable: {
    bg: "bg-yellow-900/30",
    border: "border-yellow-500/50",
    header: "bg-yellow-500/20",
  },
  Math: {
    bg: "bg-orange-900/30",
    border: "border-orange-500/50",
    header: "bg-orange-500/20",
  },
  String: {
    bg: "bg-teal-900/30",
    border: "border-teal-500/50",
    header: "bg-teal-500/20",
  },
  Native: {
    bg: "bg-red-900/30",
    border: "border-red-500/50",
    header: "bg-red-500/20",
  },
  Interceptor: {
    bg: "bg-rose-900/30",
    border: "border-rose-500/50",
    header: "bg-rose-500/20",
  },
  Hook: {
    bg: "bg-pink-900/30",
    border: "border-pink-500/50",
    header: "bg-pink-500/20",
  },
  Output: {
    bg: "bg-cyan-900/30",
    border: "border-cyan-500/50",
    header: "bg-cyan-500/20",
  },
  UI: {
    bg: "bg-indigo-900/30",
    border: "border-indigo-500/50",
    header: "bg-indigo-500/20",
  },
  Function: {
    bg: "bg-amber-900/30",
    border: "border-amber-500/50",
    header: "bg-amber-500/20",
  },
};

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
const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

export const NodeCanvas: Component = () => {
  let canvasRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [scale, setScale] = createSignal(1);

  // Selection box state (for drag selection)
  const [selectionBox, setSelectionBox] = createSignal<SelectionBox | null>(null);
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

      // If not holding Ctrl/Cmd, clear selection
      const addToSelection = e.ctrlKey || e.metaKey;
      if (!addToSelection) {
        scriptStore.selectNode(null);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    // Update selection box
    if (isSelecting() && canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset().x) / scale();
      const y = (e.clientY - rect.top - offset().y) / scale();

      setSelectionBox((prev) =>
        prev ? { ...prev, endX: x, endY: y } : null,
      );
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
              const nodeBottom = node.y + 60 + node.inputs.length * 24 + node.outputs.length * 24;
              return (
                node.x < maxX &&
                nodeRight > minX &&
                node.y < maxY &&
                nodeBottom > minY
              );
            })
            .map((n) => n.id);

          const addToSelection = e.ctrlKey || e.metaKey;
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

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't intercept if user is typing in an input
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    // Delete selected connection with Delete or Backspace
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      scriptStore.selectedConnectionId()
    ) {
      e.preventDefault();
      scriptStore.deleteConnection(scriptStore.selectedConnectionId()!);
    }

    // Delete selected nodes with Delete or Backspace
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      scriptStore.selectedNodeIds().size > 0
    ) {
      e.preventDefault();
      // Don't delete event nodes (entry points)
      const selectedNodes = scriptStore.getSelectedNodes();
      const canDelete = selectedNodes.every(
        (n) => !n.type.startsWith("event_") || selectedNodes.length > 1,
      );
      if (canDelete) {
        scriptStore.deleteSelectedNodes();
      }
    }

    // Select all with Ctrl/Cmd+A
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      const script = currentScript();
      if (script) {
        const allIds = script.nodes.map((n) => n.id);
        scriptStore.selectMultipleNodes(allIds);
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    // Nothing special needed now
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
    window.addEventListener("keyup", handleKeyUp);
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
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
            <span class="text-xs text-accent">{scriptStore.selectedNodeIds().size} nodes selected</span>
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
                      onClick={() =>
                        scriptStore.setSelectedConnectionId(conn.id)
                      }
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
                onSelect={(addToSelection) => scriptStore.selectNode(node.id, addToSelection)}
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
          <span>Scroll: Pan | {isMac ? "⌘" : "Ctrl"}+Scroll: Zoom | Click+Drag: Select | {isMac ? "⌘" : "Ctrl"}+Click: Add to selection</span>
        </div>
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
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}

const ConnectionLine: Component<ConnectionLineProps> = (props) => {
  // Create bezier curve path
  const path = () => {
    const dx = Math.abs(props.x2 - props.x1);
    const controlOffset = Math.max(50, dx * 0.5);

    return `M ${props.x1} ${props.y1}
            C ${props.x1 + controlOffset} ${props.y1},
              ${props.x2 - controlOffset} ${props.y2},
              ${props.x2} ${props.y2}`;
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
      />
      {/* Visible path */}
      <path
        d={path()}
        fill="none"
        stroke={props.color}
        stroke-width={props.isSelected ? 3 : 2}
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

  const category = () => getNodeCategory(props.node.type);
  const colors = () => nodeColors[category()] ?? nodeColors.Flow;

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // Prevent text selection and default drag behavior
    e.stopPropagation();

    // Handle Ctrl/Cmd click for multi-select
    const addToSelection = e.ctrlKey || e.metaKey;

    // If not already selected, select this node
    if (!props.isSelected) {
      props.onSelect(addToSelection);
    } else if (addToSelection) {
      // Toggle off if Ctrl/Cmd clicking already selected node
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

  return (
    <div
      data-node-id={props.node.id}
      class={`absolute rounded-lg border shadow-lg ${colors().bg} ${colors().border} ${ringClass()}`}
      style={{
        left: `${props.node.x}px`,
        top: `${props.node.y}px`,
        width: "200px",
        cursor: isDragging() ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div
        class={`px-3 py-1.5 rounded-t-lg border-b ${colors().header} ${colors().border} flex items-center justify-between`}
      >
        <span class="text-xs font-medium truncate">{props.node.label}</span>
        <Show when={props.isSelected && props.node.type !== "start"}>
          <button
            class="p-0.5 hover:bg-error/30 rounded transition-colors"
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
            return (
              <div class="flex items-center h-6 px-2 group">
                <div
                  class={`w-3 h-3 rounded-full border-2 -ml-4 cursor-pointer transition-all ${portColor.border} ${portColor.bg} ${
                    isCompatible()
                      ? "scale-150 ring-2 ring-green-400 ring-offset-1 ring-offset-transparent"
                      : isIncompatible()
                        ? "opacity-30"
                        : "hover:scale-125"
                  }`}
                  onMouseUp={(e) => props.onPortMouseUp(e, props.node.id, port)}
                  title={
                    port.valueType
                      ? `${port.name} (${port.valueType})`
                      : port.name
                  }
                />
                <span
                  class={`text-[10px] ml-2 ${isIncompatible() ? "opacity-30" : "text-foreground-muted"}`}
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
