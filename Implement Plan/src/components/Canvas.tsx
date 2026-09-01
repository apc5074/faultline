import { useRef, useState, useCallback, useEffect } from "react";
import type { DesignComponent, Connection, Packet, ComponentType } from "../types";
import ComponentGlyph from "./ComponentGlyph";
import { COMPONENT_SIZES, COMPONENT_LABELS } from "../constants";

interface CanvasProps {
  components: DesignComponent[];
  connections: Connection[];
  packets: Packet[];
  selectedId: string | null;
  running: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (fromId: string, fromPortId: string, toId: string, toPortId: string) => void;
  onDelete: (id: string) => void;
  onDrop: (type: ComponentType, x: number, y: number) => void;
}

const INK = "#1a1612" as const;
const INK_HAIRLINE = "#c8bfb0" as const;
const INK_FAINT = "#8a7f74" as const;
const PAPER = "#f5f0e8" as const;
const GRID = 20;

function snapToGrid(v: number) {
  return Math.round(v / GRID) * GRID;
}

// Compute port world position
function portPos(comp: DesignComponent, portId: string) {
  const size = COMPONENT_SIZES[comp.type];
  const allPorts = [...comp.inputPorts, ...comp.outputPorts];
  const port = allPorts.find(p => p.id === portId);
  if (!port) return { x: comp.x, y: comp.y };

  const ports = port.side === "left" ? comp.inputPorts : comp.outputPorts;
  const count = ports.length;
  const idx = ports.findIndex(p => p.id === portId);
  const portX = port.side === "left" ? comp.x : comp.x + size.w;
  const portY = comp.y + (size.h / (count + 1)) * (idx + 1);
  return { x: portX, y: portY };
}

// Route edge orthogonally (simple L-route via midpoint)
function routeEdge(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
}

// Compute packet position along a path
function packetPosOnPath(conn: Connection, progress: number, components: DesignComponent[]) {
  const from = components.find(c => c.id === conn.fromComponentId);
  const to = components.find(c => c.id === conn.toComponentId);
  if (!from || !to) return { x: 0, y: 0 };
  const p1 = portPos(from, conn.fromPortId);
  const p2 = portPos(to, conn.toPortId);
  const mx = (p1.x + p2.x) / 2;
  // Follow the orthogonal path
  // Segment 1: p1 -> (mx, p1.y), Segment 2: (mx, p1.y) -> (mx, p2.y), Segment 3: (mx, p2.y) -> p2
  const s1 = Math.abs(mx - p1.x);
  const s2 = Math.abs(p2.y - p1.y);
  const s3 = Math.abs(p2.x - mx);
  const total = s1 + s2 + s3;
  if (total === 0) return p1;

  const dist = progress * total;
  if (dist <= s1) {
    const t = dist / s1;
    return { x: p1.x + (mx - p1.x) * t, y: p1.y };
  } else if (dist <= s1 + s2) {
    const t = (dist - s1) / s2;
    return { x: mx, y: p1.y + (p2.y - p1.y) * t };
  } else {
    const t = (dist - s1 - s2) / s3;
    return { x: mx + (p2.x - mx) * t, y: p2.y };
  }
}

function PacketShape({ shape, x, y }: { shape: Packet["shape"]; x: number; y: number }) {
  const s = 5;
  if (shape === "request") return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill="none" stroke={INK} strokeWidth={1.5} />;
  if (shape === "response") return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={INK} stroke={INK} strokeWidth={1} />;
  if (shape === "write") return (
    <g>
      <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill="none" stroke={INK} strokeWidth={1.5} />
      <line x1={x - s + 3} y1={y} x2={x + s - 3} y2={y} stroke={INK} strokeWidth={1.5} />
    </g>
  );
  if (shape === "event") return <polygon points={`${x},${y - s} ${x + s},${y + s} ${x - s},${y + s}`} fill={INK} stroke={INK} strokeWidth={1} />;
  if (shape === "rejected") return (
    <g stroke="#c0392b" strokeWidth={1.5}>
      <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} />
      <line x1={x + s} y1={y - s} x2={x - s} y2={y + s} />
    </g>
  );
  return null;
}

export default function Canvas({
  components, connections, packets, selectedId,
  running, onSelect, onMove, onConnect, onDelete, onDrop
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [pendingConn, setPendingConn] = useState<{ fromId: string; fromPortId: string; mx: number; my: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewOffset.x) / zoom,
      y: (clientY - rect.top - viewOffset.y) / zoom,
    };
  }, [viewOffset, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent, compId: string) => {
    e.stopPropagation();
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    const pt = svgPoint(e.clientX, e.clientY);
    setDragging({ id: compId, offsetX: pt.x - comp.x, offsetY: pt.y - comp.y });
    onSelect(compId);
  }, [components, svgPoint, onSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const pt = svgPoint(e.clientX, e.clientY);
      const nx = snapToGrid(pt.x - dragging.offsetX);
      const ny = snapToGrid(pt.y - dragging.offsetY);
      onMove(dragging.id, nx, ny);
    }
    if (panning) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      setViewOffset({ x: panning.ox + dx, y: panning.oy + dy });
    }
    if (pendingConn) {
      const pt = svgPoint(e.clientX, e.clientY);
      setPendingConn(prev => prev ? { ...prev, mx: pt.x, my: pt.y } : null);
    }
  }, [dragging, panning, pendingConn, svgPoint, onMove]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(null);
    setPendingConn(null);
  }, []);

  const handlePortMouseDown = useCallback((e: React.MouseEvent, compId: string, portId: string) => {
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    setPendingConn({ fromId: compId, fromPortId: portId, mx: pt.x, my: pt.y });
  }, [svgPoint]);

  const handlePortMouseUp = useCallback((e: React.MouseEvent, compId: string, portId: string) => {
    e.stopPropagation();
    if (pendingConn && pendingConn.fromId !== compId) {
      onConnect(pendingConn.fromId, pendingConn.fromPortId, compId, portId);
    }
    setPendingConn(null);
  }, [pendingConn, onConnect]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setPanning({ startX: e.clientX, startY: e.clientY, ox: viewOffset.x, oy: viewOffset.y });
    } else {
      onSelect(null);
    }
  }, [viewOffset, onSelect]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom(z => Math.max(0.3, Math.min(2, z + delta)));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const type = e.dataTransfer.getData("component-type") as ComponentType;
    if (!type) return;
    const pt = svgPoint(e.clientX, e.clientY);
    onDrop(type, snapToGrid(pt.x), snapToGrid(pt.y));
  }, [svgPoint, onDrop]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      onDelete(selectedId);
    }
  }, [selectedId, onDelete]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const miniMode = zoom < 0.6;

  return (
    <div
      className="relative flex-1 overflow-hidden"
      style={{ background: "#f5f0e8", cursor: panning ? "grabbing" : dragging ? "grabbing" : "default" }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={() => setDragOver(false)}
    >
      {dragOver && (
        <div className="absolute inset-0 pointer-events-none" style={{
          outline: `2px dashed ${INK}`, outlineOffset: "-4px"
        }} />
      )}
      <svg
        ref={svgRef}
        className="w-full h-full dot-grid"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        style={{ touchAction: "none" }}
      >
        <g transform={`translate(${viewOffset.x},${viewOffset.y}) scale(${zoom})`}>
          {/* Connections */}
          {connections.map(conn => {
            const from = components.find(c => c.id === conn.fromComponentId);
            const to = components.find(c => c.id === conn.toComponentId);
            if (!from || !to) return null;
            const p1 = portPos(from, conn.fromPortId);
            const p2 = portPos(to, conn.toPortId);
            const path = routeEdge(p1.x, p1.y, p2.x, p2.y);
            const lw = running ? 0.5 + conn.load * 2.5 : 0.75;
            return (
              <path key={conn.id}
                d={path}
                fill="none"
                stroke={INK}
                strokeWidth={lw}
                strokeLinecap="round"
              />
            );
          })}

          {/* Pending connection line */}
          {pendingConn && (() => {
            const comp = components.find(c => c.id === pendingConn.fromId);
            if (!comp) return null;
            const p1 = portPos(comp, pendingConn.fromPortId);
            const path = routeEdge(p1.x, p1.y, pendingConn.mx, pendingConn.my);
            return (
              <path d={path} fill="none" stroke={INK} strokeWidth={0.75} strokeDasharray="4 3" />
            );
          })()}

          {/* Components */}
          {components.map(comp => {
            const size = COMPONENT_SIZES[comp.type];
            const label = COMPONENT_LABELS[comp.type];
            const isSelected = comp.id === selectedId;
            const processingCount = comp.processingPackets.length;

            return (
              <g key={comp.id}
                transform={`translate(${comp.x},${comp.y})`}
                onMouseDown={e => handleMouseDown(e, comp.id)}
                style={{ cursor: "grab" }}
              >
                {/* Component glyph */}
                <ComponentGlyph
                  type={comp.type}
                  state={isSelected ? "selected" : comp.state}
                  width={size.w}
                  height={size.h}
                  instances={comp.instances}
                  capacity={comp.capacity}
                  depth={comp.depth}
                  replicas={comp.replicas}
                  armAngle={comp.armAngle ?? 0}
                  passCount={comp.passCount ?? 0}
                  processingCount={processingCount}
                />

                {/* Label below */}
                {!miniMode && (
                  <text
                    x={size.w / 2}
                    y={size.h + 14}
                    textAnchor="middle"
                    fontSize={9}
                    letterSpacing={1}
                    fontFamily="'Space Mono', monospace"
                    fill={INK_FAINT}
                    style={{ textTransform: "uppercase", userSelect: "none" }}
                  >
                    {comp.name || label}
                  </text>
                )}

                {/* Input ports */}
                {comp.inputPorts.map((port, idx) => {
                  const count = comp.inputPorts.length;
                  const py = (size.h / (count + 1)) * (idx + 1);
                  const connected = connections.some(c => c.toComponentId === comp.id && c.toPortId === port.id);
                  return (
                    <g key={port.id}
                      onMouseDown={e => handlePortMouseDown(e, comp.id, port.id)}
                      onMouseUp={e => handlePortMouseUp(e, comp.id, port.id)}
                      style={{ cursor: "crosshair" }}
                    >
                      <circle cx={0} cy={py} r={5} fill={connected ? INK : PAPER}
                        stroke={port.failed ? "#c0392b" : INK} strokeWidth={1.5} />
                      {port.failed && (
                        <g stroke="#c0392b" strokeWidth={1}>
                          <line x1={-3} y1={py - 3} x2={3} y2={py + 3} />
                          <line x1={3} y1={py - 3} x2={-3} y2={py + 3} />
                        </g>
                      )}
                      {/* Hover target */}
                      <circle cx={0} cy={py} r={8} fill="transparent" />
                    </g>
                  );
                })}

                {/* Output ports */}
                {comp.outputPorts.map((port, idx) => {
                  const count = comp.outputPorts.length;
                  const py = (size.h / (count + 1)) * (idx + 1);
                  const connected = connections.some(c => c.fromComponentId === comp.id && c.fromPortId === port.id);
                  return (
                    <g key={port.id}
                      onMouseDown={e => handlePortMouseDown(e, comp.id, port.id)}
                      onMouseUp={e => handlePortMouseUp(e, comp.id, port.id)}
                      style={{ cursor: "crosshair" }}
                    >
                      <circle cx={size.w} cy={py} r={5} fill={connected ? INK : PAPER}
                        stroke={port.failed ? "#c0392b" : INK} strokeWidth={1.5} />
                      {port.failed && (
                        <g stroke="#c0392b" strokeWidth={1}>
                          <line x1={size.w - 3} y1={py - 3} x2={size.w + 3} y2={py + 3} />
                          <line x1={size.w + 3} y1={py - 3} x2={size.w - 3} y2={py + 3} />
                        </g>
                      )}
                      <circle cx={size.w} cy={py} r={8} fill="transparent" />
                      {/* compatible port indicator when connecting */}
                      {pendingConn && !connected && (
                        <circle cx={size.w} cy={py} r={7} fill="none" stroke={INK} strokeWidth={0.75} />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Packets */}
          {packets.map(packet => {
            const conn = connections.find(c => c.id === packet.connectionId);
            if (!conn) return null;
            const pos = packetPosOnPath(conn, packet.reverse ? 1 - packet.progress : packet.progress, components);
            return <PacketShape key={packet.id} shape={packet.shape} x={pos.x} y={pos.y} />;
          })}
        </g>
      </svg>

      {/* Empty state */}
      {components.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: INK_FAINT,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            drag components from the rail to begin
          </p>
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3" style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 9,
        color: INK_FAINT,
        letterSpacing: "0.08em",
      }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
