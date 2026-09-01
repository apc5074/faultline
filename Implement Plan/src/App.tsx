import { useState, useCallback, useEffect, useRef } from "react";
import type { DesignComponent, Connection, Packet, ComponentType } from "./types";
import Canvas from "./components/Canvas";
import ComponentRail from "./components/ComponentRail";
import Inspector from "./components/Inspector";
import SimBar from "./components/SimBar";
import { COMPONENT_SIZES, COMPONENT_LABELS } from "./constants";
import { tickSimulation } from "./simulation";
import { buildHeroScene } from "./heroScene";

let idCounter = 0;
const newId = () => `comp-${++idCounter}`;
const newConnId = () => `conn-${++idCounter}`;

function makeDefaultComponent(type: ComponentType, x: number, y: number): DesignComponent {
  return {
    id: newId(),
    type,
    x, y,
    name: COMPONENT_LABELS[type],
    state: "idle",
    instances: 1,
    capacity: 16,
    depth: 8,
    replicas: 0,
    algorithm: "round-robin",
    inputPorts: type === "user" ? [] : [{ id: `${newId()}-in0`, side: "left", index: 0, connected: false }],
    outputPorts: [{ id: `${newId()}-out0`, side: "right", index: 0, connected: false }],
    stats: { rps: 0, latency: 0 },
    processingPackets: [],
  };
}

const INK = "#1a1612";
const INK_HAIRLINE = "#c8bfb0";
const INK_FAINT = "#8a7f74";
const PAPER = "#f5f0e8";

export default function App() {
  const hero = buildHeroScene();
  const [components, setComponents] = useState<DesignComponent[]>(hero.components);
  const [connections, setConnections] = useState<Connection[]>(hero.connections);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number>(0);
  const tickRef = useRef(0);
  const stateRef = useRef({ components, connections, packets, speed });

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = { components, connections, packets, speed };
  }, [components, connections, packets, speed]);

  // Simulation loop
  useEffect(() => {
    if (!running || paused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let last = performance.now();
    const loop = (now: number) => {
      const elapsed = now - last;
      if (elapsed > 14) { // ~60fps
        last = now;
        tickRef.current += 1;
        const { components: c, connections: conn, packets: p, speed: s } = stateRef.current;
        const result = tickSimulation(c, conn, p, s, tickRef.current);
        setComponents(result.components);
        setConnections(result.connections);
        setPackets(result.packets);
        setTick(tickRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, paused]);

  const handleRun = useCallback(() => {
    setRunning(true);
    setPaused(false);
  }, []);

  const handlePause = useCallback(() => {
    setPaused(p => !p);
  }, []);

  const handleStep = useCallback(() => {
    if (!running) setRunning(true);
    setPaused(true);
    tickRef.current += 1;
    const { components: c, connections: conn, packets: p, speed: s } = stateRef.current;
    const result = tickSimulation(c, conn, p, s, tickRef.current);
    setComponents(result.components);
    setConnections(result.connections);
    setPackets(result.packets);
  }, [running]);

  const handleReset = useCallback(() => {
    setRunning(false);
    setPaused(false);
    setPackets([]);
    tickRef.current = 0;
    setComponents(cs => cs.map(c => ({ ...c, state: "idle" as const, processingPackets: [], stats: { rps: 0, latency: 0 } })));
    setConnections(cs => cs.map(c => ({ ...c, load: 0 })));
  }, []);

  const handleMove = useCallback((id: string, x: number, y: number) => {
    setComponents(cs => cs.map(c => c.id === id ? { ...c, x, y } : c));
  }, []);

  const handleConnect = useCallback((fromId: string, fromPortId: string, toId: string, toPortId: string) => {
    // Prevent duplicate connections
    const exists = connections.some(c =>
      c.fromComponentId === fromId && c.fromPortId === fromPortId &&
      c.toComponentId === toId && c.toPortId === toPortId
    );
    if (exists || fromId === toId) return;

    const newConn: Connection = {
      id: newConnId(),
      fromComponentId: fromId,
      fromPortId,
      toComponentId: toId,
      toPortId,
      load: 0,
    };
    setConnections(cs => [...cs, newConn]);
    // Mark ports connected
    setComponents(cs => cs.map(c => {
      if (c.id === fromId) {
        return { ...c, outputPorts: c.outputPorts.map(p => p.id === fromPortId ? { ...p, connected: true } : p) };
      }
      if (c.id === toId) {
        return { ...c, inputPorts: c.inputPorts.map(p => p.id === toPortId ? { ...p, connected: true } : p) };
      }
      return c;
    }));
  }, [connections]);

  const handleDelete = useCallback((id: string) => {
    setComponents(cs => cs.filter(c => c.id !== id));
    setConnections(cs => cs.filter(c => c.fromComponentId !== id && c.toComponentId !== id));
    setPackets(ps => ps.filter(p => {
      const conn = connections.find(c => c.id === p.connectionId);
      return conn && conn.fromComponentId !== id && conn.toComponentId !== id;
    }));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, connections]);

  const handleDrop = useCallback((type: ComponentType, x: number, y: number) => {
    const comp = makeDefaultComponent(type, x, y);
    setComponents(cs => [...cs, comp]);
    setSelectedId(comp.id);
  }, []);

  const handleUpdate = useCallback((id: string, patch: Partial<DesignComponent>) => {
    setComponents(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  }, []);

  const handleToggleFail = useCallback((id: string) => {
    setComponents(cs => cs.map(c => {
      if (c.id !== id) return c;
      const newState = c.state === "failed" ? "idle" : "failed";
      return { ...c, state: newState };
    }));
  }, []);

  const selectedComp = components.find(c => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col" style={{ width: "100%", height: "100%", background: PAPER }}>
      {/* Top bar */}
      <div style={{
        height: 36,
        borderBottom: `1px solid ${INK_HAIRLINE}`,
        background: "#ede7d9",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: INK,
        }}>
          System Design Playground
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {running && !paused && (
            <span style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: INK_FAINT,
            }}>
              ● running
            </span>
          )}
          {paused && (
            <span style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: INK_FAINT,
            }}>
              ⏸ paused
            </span>
          )}
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: INK_FAINT,
          }}>
            delete key removes selected
          </span>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Component rail */}
        <ComponentRail />

        {/* Canvas */}
        <Canvas
          components={components}
          connections={connections}
          packets={packets}
          selectedId={selectedId}
          running={running && !paused}
          onSelect={setSelectedId}
          onMove={handleMove}
          onConnect={handleConnect}
          onDelete={handleDelete}
          onDrop={handleDrop}
        />

        {/* Inspector */}
        <Inspector
          component={selectedComp}
          running={running}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onToggleFail={handleToggleFail}
        />
      </div>

      {/* Sim bar */}
      <SimBar
        running={running}
        paused={paused}
        speed={speed}
        onRun={handleRun}
        onPause={handlePause}
        onStep={handleStep}
        onReset={handleReset}
        onSpeedChange={setSpeed}
      />
    </div>
  );
}
