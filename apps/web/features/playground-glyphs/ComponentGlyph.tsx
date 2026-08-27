import { GLYPH_INK, outlineProps } from "./glyph-outline";
import type { ComponentGlyphProps, GlyphMachineSize, GlyphState } from "./glyph-types";

function DiagonalHatch({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines = [];
  const step = 6;
  for (let i = -h; i < w + h; i += step) {
    lines.push(
      <line
        key={i}
        x1={x + i}
        y1={y}
        x2={x + i + h}
        y2={y + h}
        stroke={GLYPH_INK.signalRed}
        strokeWidth={0.75}
      />,
    );
  }
  const clipId = `hatch-clip-${x}-${y}`;
  return (
    <g className="failed-hatch" clipPath={`url(#${clipId})`}>
      {lines}
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
    </g>
  );
}

function CornerTicks({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const len = 6;
  const gap = 2;
  return (
    <g stroke={GLYPH_INK.ink} strokeWidth={1}>
      <line x1={x - gap} y1={y} x2={x - gap - len} y2={y} />
      <line x1={x} y1={y - gap} x2={x} y2={y - gap - len} />
      <line x1={x + w + gap} y1={y} x2={x + w + gap + len} y2={y} />
      <line x1={x + w} y1={y - gap} x2={x + w} y2={y - gap - len} />
      <line x1={x - gap} y1={y + h} x2={x - gap - len} y2={y + h} />
      <line x1={x} y1={y + h + gap} x2={x} y2={y + h + gap + len} />
      <line x1={x + w + gap} y1={y + h} x2={x + w + gap + len} y2={y + h} />
      <line x1={x + w} y1={y + h + gap} x2={x + w} y2={y + h + gap + len} />
    </g>
  );
}

function ServerGlyph({
  state,
  w,
  h,
  instances = 1,
  processingCount = 0,
  machineSize = "medium",
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  instances?: number;
  processingCount?: number;
  machineSize?: GlyphMachineSize;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const tx = 4 + w * 0.12;
  const tw = w * 0.76;
  // Size dial = how many identical rack units are filled. Bay height is locked to
  // the large (5-unit) density so small/medium look like fewer of the same server.
  const maxBays = 5;
  const bays = machineSize === "small" ? 1 : machineSize === "medium" ? 3 : 5;
  const bayH = (h - 8) / maxBays;
  const filled = Math.min(processingCount, bays);
  // Instances = ghost plates behind, same idea as Postgres replicas — main tower stays put.
  const stack = mini ? 0 : Math.min(Math.max(instances, 1) - 1, 3);

  return (
    <g>
      {!mini &&
        Array.from({ length: stack }).map((_, i) => (
          <g key={i} opacity={0.35} transform={`translate(${(i + 1) * 3}, ${(i + 1) * 3})`}>
            <rect
              x={tx}
              y={4}
              width={tw}
              height={h}
              fill={GLYPH_INK.paper}
              stroke={GLYPH_INK.ink}
              strokeWidth={0.75}
            />
          </g>
        ))}
      <rect x={tx} y={4} width={tw} height={h} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={tx} y={4} w={tw} h={h} />}
      {!mini &&
        Array.from({ length: bays }).map((_, i) => {
          const on = i < filled;
          const by = 8 + i * bayH;
          return (
            <g key={i}>
              <rect
                x={tx + 4}
                y={by}
                width={tw - 8}
                height={bayH - 3}
                fill={on ? GLYPH_INK.ink : "none"}
                stroke={GLYPH_INK.ink}
                strokeWidth={0.5}
              />
              <circle
                cx={tx + tw - 9}
                cy={by + (bayH - 3) / 2}
                r={1.5}
                fill={on ? GLYPH_INK.paper : GLYPH_INK.ink}
              />
            </g>
          );
        })}
      {state === "selected" && <CornerTicks x={tx} y={4} w={tw} h={h} />}
    </g>
  );
}

function LoadBalancerGlyph({
  state,
  w,
  h,
  armAngle = 0,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  armAngle?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cx = 4 + w * 0.25;
  const cy = 4 + h / 2;
  const fanX = 4 + w;
  const points = `4,${4} 4,${4 + h} ${fanX},${4 + h * 0.75} ${fanX},${4 + h * 0.25}`;
  const armLen = w * 0.55;

  return (
    <g>
      <polygon points={points} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && (
        <g
          style={{
            transform: `rotate(${armAngle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 0.18s ease-out",
          }}
        >
          <line x1={cx} y1={cy} x2={cx + armLen} y2={cy} stroke={GLYPH_INK.ink} strokeWidth={2} />
          <circle cx={cx + armLen} cy={cy} r={2.25} fill={GLYPH_INK.ink} />
        </g>
      )}
      {!mini && <circle cx={cx} cy={cy} r={3.25} fill={GLYPH_INK.ink} />}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function CacheGlyph({
  state,
  w,
  h,
  capacity = 16,
  processingCount = 0,
  processingSlotIndices,
  cacheHitFlash = false,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  capacity?: number;
  processingCount?: number;
  processingSlotIndices?: readonly number[];
  cacheHitFlash?: boolean;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cols = Math.ceil(Math.sqrt(capacity));
  const rows = Math.ceil(capacity / cols);
  const cw = w / cols;
  const ch = h / rows;
  const filled = Math.min(processingCount, capacity);
  const slotOrder =
    processingSlotIndices && processingSlotIndices.length > 0
      ? processingSlotIndices
      : Array.from({ length: filled }, (_, index) => index);

  return (
    <g>
      <rect x={4} y={4} width={w} height={h} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && (
        <>
          {Array.from({ length: cols - 1 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={4 + (i + 1) * cw}
              y1={4}
              x2={4 + (i + 1) * cw}
              y2={4 + h}
              stroke={GLYPH_INK.ink}
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: rows - 1 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={4}
              y1={4 + (i + 1) * ch}
              x2={4 + w}
              y2={4 + (i + 1) * ch}
              stroke={GLYPH_INK.ink}
              strokeWidth={0.5}
            />
          ))}
          {cacheHitFlash ? (
            <rect x={4 + 1.5} y={4 + 1.5} width={cw - 3} height={ch - 3} fill={GLYPH_INK.ink} />
          ) : null}
          {slotOrder.slice(0, filled).map((idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            return (
              <rect
                key={idx}
                x={4 + c * cw + 1.5}
                y={4 + r * ch + 1.5}
                width={cw - 3}
                height={ch - 3}
                fill={GLYPH_INK.ink}
                className="cell-flicker"
              />
            );
          })}
        </>
      )}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function SqlDbGlyph({
  state,
  w,
  h,
  replicas = 0,
  processingCount = 0,
  machineSize = "medium",
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  replicas?: number;
  processingCount?: number;
  machineSize?: GlyphMachineSize;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const rx = w / 2;
  const ry = machineSize === "small" ? 5.5 : machineSize === "large" ? 8.5 : 7;
  const bodyH = h - ry * 2;
  const cx = 4 + w / 2;
  const bands = machineSize === "small" ? 3 : machineSize === "large" ? 5 : 4;
  const bandH = bodyH / bands;
  const lit = Math.min(processingCount, bands);
  const topY = 4 + ry;
  const bottomY = 4 + ry + bodyH;
  const rimArc = (y: number) => `M 4 ${y} A ${rx} ${ry} 0 0 0 ${4 + w} ${y}`;
  const bodyPath = `M 4 ${topY} L 4 ${bottomY} A ${rx} ${ry} 0 0 0 ${4 + w} ${bottomY} L ${4 + w} ${topY} Z`;
  const bandPath = (y0: number, y1: number) =>
    `M 5.5 ${y0} L ${4 + w - 1.5} ${y0} L ${4 + w - 1.5} ${y1} A ${rx - 1.5} ${ry} 0 0 1 5.5 ${y1} Z`;

  return (
    <g>
      {!mini &&
        Array.from({ length: Math.min(replicas, 2) }).map((_, i) => (
          <g key={i} opacity={0.35} transform={`translate(${(i + 1) * 8}, 0)`}>
            <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={GLYPH_INK.paper} stroke={GLYPH_INK.ink} strokeWidth={0.75} />
            <path d={bodyPath} fill={GLYPH_INK.paper} stroke={GLYPH_INK.ink} strokeWidth={0.75} />
          </g>
        ))}
      <path d={bodyPath} fill={GLYPH_INK.paper} stroke={op.stroke} strokeWidth={op.strokeWidth} />
      {!mini &&
        Array.from({ length: bands }).map((_, i) => {
          if (i >= lit) return null;
          return (
            <path
              key={i}
              d={bandPath(topY + i * bandH, topY + (i + 1) * bandH)}
              fill={GLYPH_INK.ink}
            />
          );
        })}
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={topY} w={w} h={bodyH} />}
      {!mini &&
        Array.from({ length: bands - 1 }).map((_, i) => (
          <path
            key={i}
            d={rimArc(topY + (i + 1) * bandH)}
            fill="none"
            stroke={i < lit ? GLYPH_INK.paper : GLYPH_INK.ink}
            strokeWidth={i < lit ? 1 : 0.75}
          />
        ))}
      <path d={rimArc(bottomY)} fill="none" stroke={op.stroke} strokeWidth={op.strokeWidth * 1.25} />
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={bodyH + ry * 2} />}
    </g>
  );
}

function NosqlDbGlyph({
  state,
  w,
  h,
  processingCount = 0,
  documentSlots = 9,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  processingCount?: number;
  documentSlots?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const rx = w * 0.42;
  const ry = 8;
  const topCy = 4 + h * 0.22;
  const collarTop = topCy + ry;
  const collarH = Math.max(10, h * 0.16);
  const bottomY = 4 + h * 0.8;
  const ridges = Math.max(1, Math.min(16, Math.floor(documentSlots)));
  const lit = Math.min(processingCount, ridges);
  const bodyPath = `M ${cx - rx} ${topCy} L ${cx - rx} ${bottomY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomY} L ${cx + rx} ${topCy} Z`;
  const rimArc = (y: number) => `M ${cx - rx} ${y} A ${rx} ${ry} 0 0 0 ${cx + rx} ${y}`;

  return (
    <g>
      <path d={bodyPath} fill={GLYPH_INK.paper} stroke={op.stroke} strokeWidth={op.strokeWidth} />
      <ellipse cx={cx} cy={topCy} rx={rx} ry={ry} fill={GLYPH_INK.paper} {...op} />
      {!mini && <ellipse cx={cx} cy={topCy} rx={rx * 0.55} ry={ry * 0.55} fill="none" stroke={GLYPH_INK.ink} strokeWidth={0.75} />}
      {state === "failed" && <DiagonalHatch x={cx - rx} y={topCy} w={rx * 2} h={bottomY - topCy} />}
      {!mini &&
        Array.from({ length: ridges }).map((_, i) => {
          const x = cx - rx + 4 + (i * (rx * 2 - 8)) / (ridges - 1);
          const on = i < lit;
          return (
            <line
              key={i}
              x1={x}
              y1={collarTop + 1.5}
              x2={x}
              y2={collarTop + collarH - 1.5}
              stroke={on ? GLYPH_INK.ink : GLYPH_INK.inkHairline}
              strokeWidth={on ? 1.75 : 0.5}
            />
          );
        })}
      {!mini && (
        <>
          <path d={rimArc(collarTop + collarH)} fill="none" stroke={GLYPH_INK.ink} strokeWidth={0.75} />
        </>
      )}
      <path d={rimArc(bottomY)} fill="none" stroke={op.stroke} strokeWidth={op.strokeWidth * 1.25} />
      {state === "selected" && <CornerTicks x={cx - rx} y={topCy - ry} w={rx * 2} h={bottomY - topCy + ry * 2} />}
    </g>
  );
}

function QueueGlyph({
  state,
  w,
  h,
  depth = 8,
  slotCount,
  queueDepth = 0,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  depth?: number;
  slotCount?: number;
  queueDepth?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const slots = Math.max(1, Math.min(24, Math.floor(slotCount ?? depth)));
  const slotW = (w - 16) / slots;
  const slotH = h - 16;
  const filled = Math.min(queueDepth, slots);

  return (
    <g>
      <rect x={4} y={4} width={w} height={h} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && (
        <>
          <rect x={8} y={8} width={w - 16} height={h - 16} fill="none" stroke={GLYPH_INK.inkHairline} strokeWidth={0.5} />
          {Array.from({ length: slots }).map((_, i) => (
            <rect
              key={i}
              x={8 + i * slotW + 1}
              y={9}
              width={slotW - 2}
              height={slotH - 2}
              fill={i < filled ? GLYPH_INK.ink : "none"}
              stroke={GLYPH_INK.inkHairline}
              strokeWidth={0.4}
            />
          ))}
        </>
      )}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function PubSubGlyph({
  state,
  w,
  h,
  processingCount = 0,
  fanOutCount = 6,
  deliveryCount,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  processingCount?: number;
  fanOutCount?: number;
  deliveryCount?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const cy = 4 + h / 2;
  const r = Math.min(w, h) / 2 - 4;
  const innerR = r * 0.5;
  const flashing = (deliveryCount ?? processingCount) > 0;
  const spokes = Math.max(1, Math.min(12, Math.floor(fanOutCount)));

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke={GLYPH_INK.ink}
            strokeWidth={flashing ? 2.5 : 0.75}
            className={flashing ? "pubsub-flash" : undefined}
          />
          {Array.from({ length: spokes }).map((_, i) => {
            const angle = (i * Math.PI * 2) / spokes;
            return (
              <line
                key={i}
                x1={cx + Math.cos(angle) * innerR}
                y1={cy + Math.sin(angle) * innerR}
                x2={cx + Math.cos(angle) * r}
                y2={cy + Math.sin(angle) * r}
                stroke={GLYPH_INK.ink}
                strokeWidth={0.5}
              />
            );
          })}
        </>
      )}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function CdnGlyph({
  state,
  w,
  h,
  passCount = 0,
  machineSize = "medium",
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  passCount?: number;
  machineSize?: GlyphMachineSize;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const nodes: [number, number][] =
    machineSize === "large"
      ? [
          [0.12, 0.5],
          [0.38, 0.18],
          [0.38, 0.82],
          [0.7, 0.28],
          [0.7, 0.72],
          [0.92, 0.5],
        ]
      : machineSize === "small"
        ? [
            [0.18, 0.5],
            [0.55, 0.22],
            [0.55, 0.78],
            [0.88, 0.5],
          ]
        : [
            [0.12, 0.5],
            [0.5, 0.18],
            [0.5, 0.82],
            [0.88, 0.5],
          ];
  const links: [number, number][] =
    machineSize === "large"
      ? [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 4],
          [3, 5],
          [4, 5],
          [1, 2],
          [3, 4],
        ]
      : [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
          [1, 2],
        ];
  const delays = [0, 0.08, 0.08, 0.12, 0.12, 0.16];
  const pts = nodes.map(([fx, fy]) => ({ x: 4 + fx * w, y: 4 + fy * h }));
  const r =
    Math.min(w, h) *
    (machineSize === "small" ? 0.11 : machineSize === "large" ? 0.145 : 0.13);
  const linkWidth = machineSize === "large" ? 1.35 : machineSize === "small" ? 0.75 : 1;

  return (
    <g>
      {!mini &&
        links.map(([a, b], i) => (
          <line
            key={i}
            x1={pts[a].x}
            y1={pts[a].y}
            x2={pts[b].x}
            y2={pts[b].y}
            stroke={op.stroke}
            strokeWidth={linkWidth}
          />
        ))}
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      <g key={passCount}>
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={GLYPH_INK.paper}
            stroke={op.stroke}
            strokeWidth={op.strokeWidth * 0.8}
            className={!mini && passCount > 0 ? "node-pass" : undefined}
            style={{ animationDelay: `${delays[i] ?? 0}s` }}
          />
        ))}
      </g>
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function ObjectStorageGlyph({
  state,
  w,
  h,
  processingCount = 0,
  objectMarks,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  processingCount?: number;
  objectMarks?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const rimX = 4 + w * 0.1;
  const rimW = w * 0.8;
  const rimY = 4 + h * 0.2;
  const rimH = Math.max(5, h * 0.1);
  const topL = 4 + w * 0.14;
  const topR = 4 + w * 0.86;
  const botL = 4 + w * 0.22;
  const botR = 4 + w * 0.78;
  const botY = 4 + h * 0.94;
  const items = Math.min(objectMarks ?? processingCount, 3);
  const body = `M ${topL} ${rimY + rimH} L ${topR} ${rimY + rimH} L ${botR} ${botY} L ${botL} ${botY} Z`;
  const handle = `M ${topL} ${rimY + rimH} A ${w * 0.42} ${w * 0.42} 0 0 0 ${topR} ${rimY + rimH}`;

  return (
    <g>
      <path d={body} fill={GLYPH_INK.paper} {...op} />
      {!mini && <path d={handle} fill="none" stroke={op.stroke} strokeWidth={1.5} />}
      <rect x={rimX} y={rimY} width={rimW} height={rimH} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={topL} y={rimY + rimH} w={topR - topL} h={botY - rimY - rimH} />}
      {!mini &&
        Array.from({ length: items }).map((_, i) => (
          <line
            key={i}
            x1={botL + 4 + i * 2}
            y1={botY - 5 - i * 6}
            x2={botR - 4 - i * 2}
            y2={botY - 5 - i * 6}
            stroke={GLYPH_INK.ink}
            strokeWidth={1.5}
          />
        ))}
      {state === "selected" && <CornerTicks x={rimX} y={4} w={rimW} h={h} />}
    </g>
  );
}

function ApiGatewayGlyph({
  state,
  w,
  h,
  processingCount = 0,
  rejectedCount = 0,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  processingCount?: number;
  rejectedCount?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cy = 4 + h / 2;
  const left = 4;
  const right = 4 + w;
  const x1 = left + w * 0.28;
  const x2 = right - w * 0.28;
  const narrow = h * 0.34;
  const wide = h * 0.44;
  const leftTrap = `${left},${cy - narrow} ${x1},${cy - wide} ${x1},${cy + wide} ${left},${cy + narrow}`;
  const rightTrap = `${right},${cy - narrow} ${x2},${cy - wide} ${x2},${cy + wide} ${right},${cy + narrow}`;
  const dotRows = [cy - h * 0.18, cy, cy + h * 0.18];
  const dotCols = [0.2, 0.5, 0.8].map((f) => x1 + 4 + (x2 - x1 - 8) * f);
  const active = Math.min(processingCount, dotRows.length);
  const rejected = Math.min(rejectedCount, dotRows.length);

  return (
    <g>
      <polygon points={leftTrap} fill={GLYPH_INK.paper} {...op} />
      <polygon points={rightTrap} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={left} y={cy - wide} w={w} h={wide * 2} />}
      {!mini &&
        dotRows.map((dy, ri) =>
          dotCols.map((dx, ci) => {
            const on = ri < active || ri < rejected;
            return (
              <rect
                key={`${ri}-${ci}`}
                x={dx - 1.75}
                y={dy - 1.75}
                width={3.5}
                height={3.5}
                fill={ri < rejected ? GLYPH_INK.signalRed : on ? GLYPH_INK.ink : "none"}
                stroke={ri < rejected ? GLYPH_INK.signalRed : on ? GLYPH_INK.ink : GLYPH_INK.inkHairline}
                strokeWidth={0.5}
              />
            );
          }),
        )}
      {state === "selected" && <CornerTicks x={left} y={cy - wide} w={w} h={wide * 2} />}
    </g>
  );
}

function DnsGlyph({
  state,
  w,
  h,
  processingCount = 0,
  answerCount,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  processingCount?: number;
  answerCount?: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const peakY = 4 + h * 0.08;
  const topOuterY = 4 + h * 0.2;
  const botOuterY = 4 + h * 0.88;
  const botSpineY = 4 + h * 0.76;
  const points = `4,${topOuterY} ${cx},${peakY} ${4 + w},${topOuterY} ${4 + w},${botOuterY} ${cx},${botSpineY} 4,${botOuterY}`;
  const rows = 3;

  return (
    <g>
      <polygon points={points} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={topOuterY} w={w} h={botOuterY - topOuterY} />}
      {!mini && (
        <>
          <line x1={cx} y1={peakY} x2={cx} y2={botSpineY} stroke={GLYPH_INK.ink} strokeWidth={1} />
          {Array.from({ length: rows }).map((_, i) => {
            const f = 0.35 + i * 0.2;
            const active = i < (answerCount ?? processingCount);
            const lx0 = 4 + w * 0.08;
            const lx1 = cx - w * 0.08;
            const ly = (x: number) => {
              const t = (x - 4) / (w / 2);
              const topY = topOuterY + t * (peakY - topOuterY);
              const botY = botOuterY + t * (botSpineY - botOuterY);
              return topY + f * (botY - topY);
            };
            const rx0 = cx + w * 0.08;
            const rx1 = 4 + w - w * 0.08;
            const ry = (x: number) => {
              const t = (x - cx) / (w / 2);
              const topY = peakY + t * (topOuterY - peakY);
              const botY = botSpineY + t * (botOuterY - botSpineY);
              return topY + f * (botY - topY);
            };
            const stroke = active ? GLYPH_INK.ink : GLYPH_INK.inkHairline;
            const rowW = active ? 1.25 : 0.5;
            return (
              <g key={i}>
                <line x1={lx0} y1={ly(lx0)} x2={lx1} y2={ly(lx1)} stroke={stroke} strokeWidth={rowW} />
                <line x1={rx0} y1={ry(rx0)} x2={rx1} y2={ry(rx1)} stroke={stroke} strokeWidth={rowW} />
              </g>
            );
          })}
        </>
      )}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function abbreviateFallbackLabel(label: string, maxLength = 10): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed.toUpperCase();
  }
  return `${trimmed.slice(0, maxLength - 1).toUpperCase()}…`;
}

function GlobalRouterGlyph({
  state,
  w,
  h,
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  mini?: boolean;
}) {
  const op = outlineProps(state);
  const gateW = Math.max(w * 0.3, 10);
  const gateX = 4 + (w - gateW) / 2;
  const cx = 4 + w / 2;
  const cy = 4 + h / 2;
  const compassR = Math.min(w, h) * 0.16;

  return (
    <g>
      <rect x={gateX} y={4} width={gateW} height={h} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={gateX} y={4} w={gateW} h={h} />}
      {!mini && (
        <>
          <circle cx={cx} cy={cy} r={compassR} fill="none" stroke={GLYPH_INK.inkHairline} strokeWidth={0.75} />
          <line
            x1={cx}
            y1={cy - compassR}
            x2={cx}
            y2={cy + compassR}
            stroke={GLYPH_INK.inkHairline}
            strokeWidth={0.5}
          />
          <line
            x1={cx - compassR}
            y1={cy}
            x2={cx + compassR}
            y2={cy}
            stroke={GLYPH_INK.inkHairline}
            strokeWidth={0.5}
          />
          <line
            x1={cx}
            y1={cy}
            x2={cx + compassR * 0.82}
            y2={cy - compassR * 0.55}
            stroke={GLYPH_INK.ink}
            strokeWidth={1.75}
          />
          <polygon
            points={`${cx + compassR * 0.82},${cy - compassR * 0.55} ${cx + compassR * 0.62},${cy - compassR * 0.45} ${cx + compassR * 0.72},${cy - compassR * 0.68}`}
            fill={GLYPH_INK.ink}
          />
        </>
      )}
      {state === "selected" && <CornerTicks x={gateX} y={4} w={gateW} h={h} />}
    </g>
  );
}

function FallbackGlyph({
  state,
  w,
  h,
  label = "Component",
  mini = false,
}: {
  state: GlyphState;
  w: number;
  h: number;
  label?: string;
  mini?: boolean;
}) {
  const op = outlineProps(state);

  return (
    <g>
      <rect x={4} y={4} width={w} height={h} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && (
        <text
          x={4 + w / 2}
          y={4 + h / 2}
          fill={GLYPH_INK.inkFaint}
          fontFamily="var(--font-mono), 'Space Mono', monospace"
          fontSize={Math.max(6, Math.min(w, h) * 0.18)}
          fontWeight={700}
          letterSpacing="0.06em"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {abbreviateFallbackLabel(label)}
        </text>
      )}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

function UserGlyph({ state, w, h, mini = false }: { state: GlyphState; w: number; h: number; mini?: boolean }) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const cy = 4 + h / 2;
  const r = Math.min(w, h) / 2 - 2;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GLYPH_INK.paper} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {!mini && <circle cx={cx} cy={cy} r={4} fill={GLYPH_INK.ink} />}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

export function ComponentGlyph(props: ComponentGlyphProps) {
  const {
    type,
    state,
    width = 64,
    height = 64,
    mini = false,
    fallbackLabel,
    instances = 1,
    capacity = 16,
    depth = 8,
    replicas = 0,
    armAngle = 0,
    passCount = 0,
    processingCount = 0,
    cacheHitFlash = false,
    processingSlotIndices,
    machineSize = "medium",
    slotCount,
    queueDepth,
    fanOutCount,
    deliveryCount,
    documentSlots,
    objectMarks,
    rejectedCount,
    answerCount,
  } = props;

  const w = width - 8;
  const h = height - 8;
  const shared = { state, w, h, mini };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible" aria-hidden="true">
      {type === "fallback" && <FallbackGlyph {...shared} label={fallbackLabel} />}
      {type === "server" && (
        <ServerGlyph
          {...shared}
          instances={instances}
          processingCount={processingCount}
          machineSize={machineSize}
        />
      )}
      {type === "load_balancer" && <LoadBalancerGlyph {...shared} armAngle={armAngle} />}
      {type === "cache" && (
        <CacheGlyph
          {...shared}
          capacity={capacity}
          processingCount={processingCount}
          processingSlotIndices={processingSlotIndices}
          cacheHitFlash={cacheHitFlash}
        />
      )}
      {type === "sql_db" && (
        <SqlDbGlyph
          {...shared}
          replicas={replicas}
          processingCount={processingCount}
          machineSize={machineSize}
        />
      )}
      {type === "nosql_db" && (
        <NosqlDbGlyph {...shared} processingCount={processingCount} documentSlots={documentSlots} />
      )}
      {type === "queue" && (
        <QueueGlyph {...shared} depth={depth} slotCount={slotCount} queueDepth={queueDepth ?? processingCount} />
      )}
      {type === "pubsub" && (
        <PubSubGlyph
          {...shared}
          processingCount={processingCount}
          fanOutCount={fanOutCount}
          deliveryCount={deliveryCount}
        />
      )}
      {type === "cdn" && <CdnGlyph {...shared} passCount={passCount} machineSize={machineSize} />}
      {type === "object_storage" && (
        <ObjectStorageGlyph {...shared} processingCount={processingCount} objectMarks={objectMarks} />
      )}
      {type === "api_gateway" && (
        <ApiGatewayGlyph {...shared} processingCount={processingCount} rejectedCount={rejectedCount} />
      )}
      {type === "dns" && <DnsGlyph {...shared} processingCount={processingCount} answerCount={answerCount} />}
      {type === "global_router" && <GlobalRouterGlyph {...shared} />}
      {type === "user" && <UserGlyph {...shared} />}
    </svg>
  );
}
