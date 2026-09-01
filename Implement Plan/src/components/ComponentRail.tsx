import type { ComponentType } from "../types";
import ComponentGlyph from "./ComponentGlyph";
import { COMPONENT_CATEGORIES, COMPONENT_LABELS, COMPONENT_SIZES } from "../constants";

const INK = "#1a1612";
const INK_FAINT = "#8a7f74";
const INK_HAIRLINE = "#c8bfb0";

export default function ComponentRail() {
  const handleDragStart = (e: React.DragEvent, type: ComponentType) => {
    e.dataTransfer.setData("component-type", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="flex flex-col gap-0 overflow-y-auto"
      style={{
        width: 72,
        background: "#ede7d9",
        borderRight: `1px solid ${INK_HAIRLINE}`,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      {COMPONENT_CATEGORIES.map((cat, ci) => (
        <div key={cat.label}>
          {ci > 0 && (
            <div style={{
              height: 1,
              background: INK_HAIRLINE,
              margin: "4px 8px",
            }} />
          )}
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 7,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: INK_FAINT,
            paddingLeft: 8,
            paddingBottom: 2,
            paddingTop: 4,
          }}>
            {cat.label}
          </div>
          {cat.items.map(type => {
            const size = COMPONENT_SIZES[type];
            const scale = Math.min(48 / size.w, 40 / size.h);
            const sw = size.w * scale;
            const sh = size.h * scale;

            return (
              <div
                key={type}
                draggable
                onDragStart={e => handleDragStart(e, type)}
                className="flex flex-col items-center gap-1"
                style={{
                  padding: "4px 4px",
                  cursor: "grab",
                  userSelect: "none",
                }}
                title={COMPONENT_LABELS[type]}
              >
                <div style={{ width: sw, height: sh }}>
                  <ComponentGlyph
                    type={type}
                    state="idle"
                    width={sw}
                    height={sh}
                    mini
                  />
                </div>
                <span style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 6.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: INK_FAINT,
                  textAlign: "center",
                  lineHeight: 1.2,
                  maxWidth: 60,
                  display: "block",
                }}>
                  {COMPONENT_LABELS[type]}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
