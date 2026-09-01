import type { DesignComponent } from "../types";
import { COMPONENT_LABELS, COMPONENT_SIZES } from "../constants";
import ComponentGlyph from "./ComponentGlyph";

interface InspectorProps {
  component: DesignComponent | null;
  running: boolean;
  onUpdate: (id: string, patch: Partial<DesignComponent>) => void;
  onDelete: (id: string) => void;
  onToggleFail: (id: string) => void;
}

const INK = "#1a1612";
const INK_FAINT = "#8a7f74";
const INK_HAIRLINE = "#c8bfb0";

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-baseline" style={{ gap: 8 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_FAINT, fontFamily: "'Space Mono', monospace" }}>
        {label}
      </span>
      <span className="tabular" style={{ fontSize: 11, color: INK, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex justify-between items-center" style={{ gap: 8 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_FAINT, fontFamily: "'Space Mono', monospace", flex: 1 }}>
        {label}
      </span>
      <div className="flex items-center" style={{ gap: 0 }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{
            width: 20, height: 20,
            border: `1px solid ${INK_HAIRLINE}`,
            background: "none",
            cursor: "pointer",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: INK,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >−</button>
        <span className="tabular" style={{
          width: 28, textAlign: "center",
          fontFamily: "'Space Mono', monospace", fontSize: 11,
          border: `1px solid ${INK_HAIRLINE}`,
          borderLeft: "none", borderRight: "none",
          height: 20, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{
            width: 20, height: 20,
            border: `1px solid ${INK_HAIRLINE}`,
            background: "none",
            cursor: "pointer",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: INK,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >+</button>
      </div>
    </div>
  );
}

function SegControl({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_FAINT, fontFamily: "'Space Mono', monospace" }}>
        {label}
      </span>
      <div className="flex">
        {options.map(opt => (
          <button key={opt}
            onClick={() => onChange(opt)}
            style={{
              flex: 1,
              height: 22,
              border: `1px solid ${INK_HAIRLINE}`,
              borderLeft: opt === options[0] ? `1px solid ${INK_HAIRLINE}` : "none",
              background: value === opt ? INK : "none",
              color: value === opt ? "#f5f0e8" : INK_FAINT,
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Inspector({ component, running, onUpdate, onDelete, onToggleFail }: InspectorProps) {
  if (!component) {
    return (
      <div style={{
        width: 200,
        borderLeft: `1px solid ${INK_HAIRLINE}`,
        background: "#ede7d9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <p style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: INK_FAINT,
          textAlign: "center",
          padding: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          select a component to inspect
        </p>
      </div>
    );
  }

  const size = COMPONENT_SIZES[component.type];
  const label = COMPONENT_LABELS[component.type];

  return (
    <div style={{
      width: 200,
      borderLeft: `1px solid ${INK_HAIRLINE}`,
      background: "#ede7d9",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header — data plate */}
      <div style={{
        padding: "12px 12px 8px",
        borderBottom: `1px solid ${INK_HAIRLINE}`,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}>
        <ComponentGlyph type={component.type} state={component.state} width={40} height={40} />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <input
            value={component.name}
            onChange={e => onUpdate(component.id, { name: e.target.value })}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              background: "none",
              border: "none",
              borderBottom: `1px solid ${INK_HAIRLINE}`,
              outline: "none",
              color: INK,
              letterSpacing: "0.04em",
              width: "100%",
              padding: "0 0 1px",
            }}
          />
          <span style={{ fontSize: 8, color: INK_FAINT, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>
            {label}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-col gap-0 flex-1 overflow-y-auto">

        {/* Machine section */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${INK_HAIRLINE}` }}>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_FAINT, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
            Machine
          </div>
          <div className="flex flex-col gap-2">
            {component.type === "server" && (
              <Stepper label="Instances" value={component.instances ?? 1} min={1} max={6}
                onChange={v => onUpdate(component.id, { instances: v })} />
            )}
            {component.type === "cache" && (
              <Stepper label="Cells" value={component.capacity ?? 16} min={4} max={64}
                onChange={v => onUpdate(component.id, { capacity: v })} />
            )}
            {component.type === "queue" && (
              <Stepper label="Slots" value={component.depth ?? 8} min={4} max={24}
                onChange={v => onUpdate(component.id, { depth: v })} />
            )}
            {(component.type === "sql_db") && (
              <Stepper label="Replicas" value={component.replicas ?? 0} min={0} max={3}
                onChange={v => onUpdate(component.id, { replicas: v })} />
            )}
          </div>
        </div>

        {/* Behavior section */}
        {component.type === "load_balancer" && (
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${INK_HAIRLINE}` }}>
            <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_FAINT, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
              Behavior
            </div>
            <SegControl
              label="Algorithm"
              value={component.algorithm ?? "round-robin"}
              options={["round-robin", "least-conn"]}
              onChange={v => onUpdate(component.id, { algorithm: v as "round-robin" | "least-connections" })}
            />
          </div>
        )}

        {/* Live metrics */}
        {running && (
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${INK_HAIRLINE}` }}>
            <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_FAINT, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
              Live
            </div>
            <div className="flex flex-col gap-1.5">
              <DataRow label="req/s" value={component.stats.rps} />
              <DataRow label="latency" value={`${component.stats.latency}ms`} />
              {component.stats.hitRate !== undefined && (
                <DataRow label="hit rate" value={`${Math.round(component.stats.hitRate * 100)}%`} />
              )}
              {component.stats.queueDepth !== undefined && (
                <DataRow label="depth" value={component.stats.queueDepth} />
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: "10px 12px" }}>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onToggleFail(component.id)}
              style={{
                height: 24,
                border: `1px solid ${component.state === "failed" ? "#c0392b" : INK_HAIRLINE}`,
                background: "none",
                color: component.state === "failed" ? "#c0392b" : INK_FAINT,
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {component.state === "failed" ? "restore" : "fail component"}
            </button>
            <button
              onClick={() => onDelete(component.id)}
              style={{
                height: 24,
                border: `1px solid ${INK_HAIRLINE}`,
                background: "none",
                color: INK_FAINT,
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
