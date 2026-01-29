import { Component, For, Show, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import {
  scriptStore,
  type ScriptNode,
  type ScriptNodeType,
  type Port,
} from "@/stores/script";
import { TrashIcon } from "@/components/common/Icons";

// Node colors by category
const nodeColors: Record<string, { bg: string; border: string; header: string }> = {
  Flow: { bg: "bg-blue-900/30", border: "border-blue-500/50", header: "bg-blue-500/20" },
  Memory: { bg: "bg-purple-900/30", border: "border-purple-500/50", header: "bg-purple-500/20" },
  Module: { bg: "bg-green-900/30", border: "border-green-500/50", header: "bg-green-500/20" },
  Variable: { bg: "bg-yellow-900/30", border: "border-yellow-500/50", header: "bg-yellow-500/20" },
  Math: { bg: "bg-orange-900/30", border: "border-orange-500/50", header: "bg-orange-500/20" },
  Native: { bg: "bg-red-900/30", border: "border-red-500/50", header: "bg-red-500/20" },
  Hook: { bg: "bg-pink-900/30", border: "border-pink-500/50", header: "bg-pink-500/20" },
  Output: { bg: "bg-cyan-900/30", border: "border-cyan-500/50", header: "bg-cyan-500/20" },
};

// Get category for node type
function getNodeCategory(type: ScriptNodeType): string {
  const template = scriptStore.nodeTemplates.find((t) => t.type === type);
  return template?.category ?? "Flow";
}

export const NodeCanvas: Component = () => {
  let canvasRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [scale, setScale] = createSignal(1);
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });

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

  const currentScript = createMemo(() => scriptStore.getCurrentScript());

  // Handle mouse wheel for zooming
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale() * delta, 0.25), 2);
    setScale(newScale);
  };

  // Handle canvas panning
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+Left click to pan
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset().x, y: e.clientY - offset().y });
    } else if (e.button === 0 && e.target === canvasRef) {
      // Left click on empty canvas to deselect
      scriptStore.setSelectedNodeId(null);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning()) {
      setOffset({
        x: e.clientX - panStart().x,
        y: e.clientY - panStart().y,
      });
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

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingConnection(null);
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
    portY: number
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
      // Create connection
      scriptStore.addConnection(dc.fromNodeId, dc.fromPortId, nodeId, port.id);
    }
    setDraggingConnection(null);
  };

  onMount(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  });

  // Get port position for a node
  const getPortPosition = (node: ScriptNode, port: Port, isInput: boolean) => {
    const nodeWidth = 200;
    const headerHeight = 28;
    const portHeight = 24;

    const ports = isInput ? node.inputs : node.outputs;
    const index = ports.findIndex((p) => p.id === port.id);

    const x = isInput ? node.x : node.x + nodeWidth;
    const y = node.y + headerHeight + index * portHeight + portHeight / 2;

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
          cursor: isPanning() ? "grabbing" : "default",
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
            class="absolute inset-0 pointer-events-none"
            style={{ width: "10000px", height: "10000px", overflow: "visible" }}
          >
            {/* Render connections */}
            <For each={currentScript()?.connections ?? []}>
              {(conn) => {
                const fromNode = currentScript()?.nodes.find(
                  (n) => n.id === conn.fromNodeId
                );
                const toNode = currentScript()?.nodes.find(
                  (n) => n.id === conn.toNodeId
                );
                if (!fromNode || !toNode) return null;

                const fromPort = fromNode.outputs.find(
                  (p) => p.id === conn.fromPortId
                );
                const toPort = toNode.inputs.find((p) => p.id === conn.toPortId);
                if (!fromPort || !toPort) return null;

                const start = getPortPosition(fromNode, fromPort, false);
                const end = getPortPosition(toNode, toPort, true);

                const isFlow = fromPort.type === "flow";
                const strokeColor = isFlow ? "#3b82f6" : "#a855f7";

                return (
                  <ConnectionLine
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    color={strokeColor}
                    isSelected={scriptStore.selectedConnectionId() === conn.id}
                    onClick={() => scriptStore.setSelectedConnectionId(conn.id)}
                  />
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
                  color={dc().fromPort.type === "flow" ? "#3b82f6" : "#a855f7"}
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
                isSelected={scriptStore.selectedNodeId() === node.id}
                onSelect={() => scriptStore.setSelectedNodeId(node.id)}
                onPortMouseDown={handlePortMouseDown}
                onPortMouseUp={handlePortMouseUp}
                getPortPosition={getPortPosition}
              />
            )}
          </For>
        </div>

        {/* Empty state */}
        <Show when={(currentScript()?.nodes.length ?? 0) === 0}>
          <div class="absolute inset-0 flex items-center justify-center text-foreground-muted pointer-events-none">
            <div class="text-center">
              <p>Drag nodes from the palette</p>
              <p class="text-xs mt-1">to build your script flow</p>
            </div>
          </div>
        </Show>
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
    </g>
  );
};

// Node component
interface NodeComponentProps {
  node: ScriptNode;
  isSelected: boolean;
  onSelect: () => void;
  onPortMouseDown: (
    e: MouseEvent,
    nodeId: string,
    port: Port,
    portX: number,
    portY: number
  ) => void;
  onPortMouseUp: (e: MouseEvent, nodeId: string, port: Port) => void;
  getPortPosition: (
    node: ScriptNode,
    port: Port,
    isInput: boolean
  ) => { x: number; y: number };
}

const NodeComponent: Component<NodeComponentProps> = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);

  const category = () => getNodeCategory(props.node.type);
  const colors = () => nodeColors[category()] ?? nodeColors.Flow;

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    props.onSelect();

    setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeX = props.node.x;
    const startNodeY = props.node.y;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      scriptStore.updateNode(props.node.id, {
        x: startNodeX + dx,
        y: startNodeY + dy,
      });
    };

    const handleUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    scriptStore.deleteNode(props.node.id);
  };

  return (
    <div
      class={`absolute rounded-lg border shadow-lg ${colors().bg} ${colors().border} ${
        props.isSelected ? "ring-2 ring-accent" : ""
      }`}
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
          {(port) => (
            <div class="flex items-center h-6 px-2">
              <div
                class={`w-3 h-3 rounded-full border-2 -ml-4 cursor-pointer ${
                  port.type === "flow"
                    ? "border-blue-400 bg-blue-900"
                    : "border-purple-400 bg-purple-900"
                }`}
                onMouseUp={(e) => props.onPortMouseUp(e, props.node.id, port)}
              />
              <span class="text-[10px] text-foreground-muted ml-2">{port.name}</span>
            </div>
          )}
        </For>

        {/* Output ports */}
        <For each={props.node.outputs}>
          {(port) => {
            const pos = () => props.getPortPosition(props.node, port, false);
            return (
              <div class="flex items-center justify-end h-6 px-2">
                <span class="text-[10px] text-foreground-muted mr-2">{port.name}</span>
                <div
                  class={`w-3 h-3 rounded-full border-2 -mr-4 cursor-pointer ${
                    port.type === "flow"
                      ? "border-blue-400 bg-blue-900"
                      : "border-purple-400 bg-purple-900"
                  }`}
                  onMouseDown={(e) => {
                    props.onPortMouseDown(e, props.node.id, port, pos().x, pos().y);
                  }}
                />
              </div>
            );
          }}
        </For>

        <Show when={props.node.inputs.length === 0 && props.node.outputs.length === 0}>
          <div class="h-6" />
        </Show>
      </div>
    </div>
  );
};

export default NodeCanvas;
