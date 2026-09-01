import type { ComponentType, ComponentState } from "../types";

interface GlyphProps {
  type: ComponentType;
  state: ComponentState;
  width?: number;
  height?: number;
  instances?: number;
  capacity?: number;
  depth?: number;
  replicas?: number;
  armAngle?: number; // -30 to 30 degrees for load balancer
  passCount?: number; // CDN: total inbound passes; each increment replays the ripple once
  processingCount?: number;
  mini?: boolean; // palette rail: silhouette only
}

const INK = "#1a1612";
const INK_FAINT = "#8a7f74";
const INK_HAIRLINE = "#c8bfb0";
const RED = "#c0392b";
const PAPER = "#f5f0e8";

function outlineProps(state: ComponentState) {
  if (state === "selected") return { stroke: INK, strokeWidth: 3.5 };
  if (state === "overloaded") return { stroke: INK, strokeWidth: 3 };
  if (state === "failed") return { stroke: RED, strokeWidth: 2.5, strokeDasharray: "5 3" };
  return { stroke: INK, strokeWidth: 2.25 };
}

function DiagonalHatch({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines = [];
  const step = 6;
  for (let i = -(h); i < w + h; i += step) {
    lines.push(
      <line
        key={i}
        x1={x + i} y1={y}
        x2={x + i + h} y2={y + h}
        stroke={RED} strokeWidth={0.75}
      />
    );
  }
  return <g className="failed-hatch" clipPath={`url(#hatch-clip-${x}-${y})`}>{lines}<defs><clipPath id={`hatch-clip-${x}-${y}`}><rect x={x} y={y} width={w} height={h} /></clipPath></defs></g>;
}

// Registration ticks for selected state
function CornerTicks({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const len = 6;
  const gap = 2;
  return (
    <g stroke={INK} strokeWidth={1}>
      {/* top-left */}
      <line x1={x - gap} y1={y} x2={x - gap - len} y2={y} />
      <line x1={x} y1={y - gap} x2={x} y2={y - gap - len} />
      {/* top-right */}
      <line x1={x + w + gap} y1={y} x2={x + w + gap + len} y2={y} />
      <line x1={x + w} y1={y - gap} x2={x + w} y2={y - gap - len} />
      {/* bottom-left */}
      <line x1={x - gap} y1={y + h} x2={x - gap - len} y2={y + h} />
      <line x1={x} y1={y + h + gap} x2={x} y2={y + h + gap + len} />
      {/* bottom-right */}
      <line x1={x + w + gap} y1={y + h} x2={x + w + gap + len} y2={y + h} />
      <line x1={x + w} y1={y + h + gap} x2={x + w} y2={y + h + gap + len} />
    </g>
  );
}

// SERVER: a rack tower — bays fill while it works, plates stack for instances
function ServerGlyph({ state, w, h, instances = 1, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; instances?: number; processingCount?: number;
}) {
  const op = outlineProps(state);
  const tx = 4 + w * 0.12;
  const tw = w * 0.76;
  const bays = 4;
  const bayH = (h - 8) / bays;
  const filled = Math.min(processingCount, bays);

  return (
    <g>
      {/* stacked instance plates behind */}
      {Array.from({ length: Math.min(instances - 1, 3) }).map((_, i) => (
        <rect key={i}
          x={tx + (i + 1) * 3} y={4 + (i + 1) * 3}
          width={tw} height={h}
          fill={PAPER} stroke={INK} strokeWidth={0.75}
        />
      ))}
      {/* tower */}
      <rect x={tx} y={4} width={tw} height={h} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={tx} y={4} w={tw} h={h} />}
      {/* drive bays with LEDs */}
      {Array.from({ length: bays }).map((_, i) => {
        const on = i < filled;
        const by = 8 + i * bayH;
        return (
          <g key={i}>
            <rect x={tx + 4} y={by} width={tw - 8} height={bayH - 3}
              fill={on ? INK : "none"} stroke={INK} strokeWidth={0.5} />
            <circle cx={tx + tw - 9} cy={by + (bayH - 3) / 2} r={1.5}
              fill={on ? PAPER : INK} />
          </g>
        );
      })}
      {state === "selected" && <CornerTicks x={tx} y={4} w={tw} h={h} />}
    </g>
  );
}

// LOAD BALANCER: wedge with pivoting arm
function LoadBalancerGlyph({ state, w, h, armAngle = 0 }: {
  state: ComponentState; w: number; h: number; armAngle?: number;
}) {
  const op = outlineProps(state);
  const cx = 4 + w * 0.25;
  const cy = 4 + h / 2;
  const fanX = 4 + w;
  const points = `4,${4} 4,${4 + h} ${fanX},${4 + h * 0.75} ${fanX},${4 + h * 0.25}`;
  const armLen = w * 0.55;

  return (
    <g>
      <polygon points={points} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {/* arm swings to the chosen output */}
      <g style={{
        transform: `rotate(${armAngle}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: "transform 0.18s ease-out",
      }}>
        <line x1={cx} y1={cy} x2={cx + armLen} y2={cy} stroke={INK} strokeWidth={2} />
        <circle cx={cx + armLen} cy={cy} r={2.25} fill={INK} />
      </g>
      {/* pivot dot */}
      <circle cx={cx} cy={cy} r={3.25} fill={INK} />
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// CACHE (Redis): full-bleed ice tray — the grid IS the silhouette; hits flicker
function CacheGlyph({ state, w, h, capacity = 16, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; capacity?: number; processingCount?: number;
}) {
  const op = outlineProps(state);
  const cols = Math.ceil(Math.sqrt(capacity));
  const rows = Math.ceil(capacity / cols);
  const cw = w / cols;
  const ch = h / rows;
  const filled = Math.min(processingCount, capacity);

  return (
    <g>
      <rect x={4} y={4} width={w} height={h} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {/* grid runs edge to edge */}
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <line key={`v${i}`} x1={4 + (i + 1) * cw} y1={4} x2={4 + (i + 1) * cw} y2={4 + h} stroke={INK} strokeWidth={0.5} />
      ))}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <line key={`h${i}`} x1={4} y1={4 + (i + 1) * ch} x2={4 + w} y2={4 + (i + 1) * ch} stroke={INK} strokeWidth={0.5} />
      ))}
      {/* addressed cells flicker — near-zero dwell, the fastest transaction */}
      {Array.from({ length: filled }).map((_, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        return (
          <rect key={idx}
            x={4 + c * cw + 1.5} y={4 + r * ch + 1.5}
            width={cw - 3} height={ch - 3}
            fill={INK} className="cell-flicker"
          />
        );
      })}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// SQL DB: four stacked disks — bands light up as cylinder segments, top to bottom
function SqlDbGlyph({ state, w, h, replicas = 0, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; replicas?: number; processingCount?: number;
}) {
  const op = outlineProps(state);
  const rx = w / 2;
  const ry = 7;
  const bodyH = h - ry * 2;
  const cx = 4 + w / 2;
  const bands = 4;
  const bandH = bodyH / bands;
  const lit = Math.min(processingCount, bands);

  const topY = 4 + ry;
  const bottomY = 4 + ry + bodyH;
  // front rim bowing downward, like the edge of a stacked disk
  const rimArc = (y: number) => `M 4 ${y} A ${rx} ${ry} 0 0 0 ${4 + w} ${y}`;
  // body silhouette: straight sides, closed at the bottom by the front rim only —
  // no back half of the bottom ellipse, so the cylinder reads as solid
  const bodyPath = `M 4 ${topY} L 4 ${bottomY} A ${rx} ${ry} 0 0 0 ${4 + w} ${bottomY} L ${4 + w} ${topY} Z`;
  // a lit segment: straight top, straight sides, curved front rim at the bottom
  const bandPath = (y0: number, y1: number) =>
    `M 5.5 ${y0} L ${4 + w - 1.5} ${y0} L ${4 + w - 1.5} ${y1} A ${rx - 1.5} ${ry} 0 0 1 5.5 ${y1} Z`;

  return (
    <g>
      {/* ghost replicas */}
      {Array.from({ length: Math.min(replicas, 2) }).map((_, i) => (
        <g key={i} opacity={0.35} transform={`translate(${(i + 1) * 8}, 0)`}>
          <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={PAPER} stroke={INK} strokeWidth={0.75} />
          <path d={bodyPath} fill={PAPER} stroke={INK} strokeWidth={0.75} />
        </g>
      ))}
      {/* body */}
      <path d={bodyPath} fill={PAPER} stroke={op.stroke} strokeWidth={op.strokeWidth} />
      {/* lit bands, shaped as cylinder segments */}
      {Array.from({ length: bands }).map((_, i) =>
        i < lit ? (
          <path key={i} d={bandPath(topY + i * bandH, topY + (i + 1) * bandH)} fill={INK} />
        ) : null
      )}
      {/* top disk face — the only full ellipse */}
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={topY} w={w} h={bodyH} />}
      {/* rim separators — paper where the band above is lit */}
      {Array.from({ length: bands - 1 }).map((_, i) => (
        <path key={i} d={rimArc(topY + (i + 1) * bandH)} fill="none"
          stroke={i < lit ? PAPER : INK} strokeWidth={i < lit ? 1 : 0.75} />
      ))}
      {/* bottom rim, heavier */}
      <path d={rimArc(bottomY)} fill="none" stroke={op.stroke} strokeWidth={op.strokeWidth * 1.25} />
    </g>
  );
}

// NOSQL DB: squat ringed cylinder with a ridged collar (DynamoDB mark) —
// same database family as SQL but a different species: short, ringed top, geared band
function NosqlDbGlyph({ state, w, h, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; processingCount?: number;
}) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const rx = w * 0.42;
  const ry = 8;
  const topCy = 4 + h * 0.22;
  const collarTop = topCy + ry;
  const collarH = Math.max(10, h * 0.16);
  const bottomY = 4 + h * 0.8;
  const ridges = 9;
  const lit = Math.min(processingCount, ridges);

  // solid body: straight sides, front rim only at the bottom (same trick as SQL)
  const bodyPath = `M ${cx - rx} ${topCy} L ${cx - rx} ${bottomY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomY} L ${cx + rx} ${topCy} Z`;
  const rimArc = (y: number) => `M ${cx - rx} ${y} A ${rx} ${ry} 0 0 0 ${cx + rx} ${y}`;

  return (
    <g>
      {/* body */}
      <path d={bodyPath} fill={PAPER} stroke={op.stroke} strokeWidth={op.strokeWidth} />
      {/* top face with concentric ring */}
      <ellipse cx={cx} cy={topCy} rx={rx} ry={ry} fill={PAPER} {...op} />
      <ellipse cx={cx} cy={topCy} rx={rx * 0.55} ry={ry * 0.55} fill="none" stroke={INK} strokeWidth={0.75} />
      {state === "failed" && <DiagonalHatch x={cx - rx} y={topCy} w={rx * 2} h={bottomY - topCy} />}
      {/* ridged collar — ridges ink in left to right while it works */}
      {Array.from({ length: ridges }).map((_, i) => {
        const x = cx - rx + 4 + (i * (rx * 2 - 8)) / (ridges - 1);
        const on = i < lit;
        return (
          <line key={i}
            x1={x} y1={collarTop + 1.5} x2={x} y2={collarTop + collarH - 1.5}
            stroke={on ? INK : INK_HAIRLINE} strokeWidth={on ? 1.75 : 0.5}
          />
        );
      })}
      {/* collar rim + heavier bottom rim */}
      <path d={rimArc(collarTop + collarH)} fill="none" stroke={INK} strokeWidth={0.75} />
      <path d={rimArc(bottomY)} fill="none" stroke={op.stroke} strokeWidth={op.strokeWidth * 1.25} />
      {state === "selected" && <CornerTicks x={cx - rx} y={topCy - ry} w={rx * 2} h={bottomY - topCy + ry * 2} />}
    </g>
  );
}

// QUEUE: horizontal channel with slots
function QueueGlyph({ state, w, h, depth = 8, queueDepth = 0 }: {
  state: ComponentState; w: number; h: number; depth?: number; queueDepth?: number;
}) {
  const op = outlineProps(state);
  const slotW = (w - 16) / depth;
  const slotH = h - 16;
  const filled = Math.min(queueDepth, depth);

  return (
    <g>
      <rect x={4} y={4} width={w} height={h} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {/* channel outline */}
      <rect x={8} y={8} width={w - 16} height={h - 16} fill="none" stroke={INK_HAIRLINE} strokeWidth={0.5} />
      {/* slots */}
      {Array.from({ length: depth }).map((_, i) => (
        <rect key={i}
          x={8 + i * slotW + 1} y={9}
          width={slotW - 2} height={slotH - 2}
          fill={i < filled ? INK : "none"}
          stroke={INK_HAIRLINE} strokeWidth={0.4}
        />
      ))}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// PUB/SUB: circular hub with radiating ports; the ring flashes on broadcast
function PubSubGlyph({ state, w, h, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; processingCount?: number;
}) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const cy = 4 + h / 2;
  const r = Math.min(w, h) / 2 - 4;
  const innerR = r * 0.5;
  const flashing = processingCount > 0;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      <circle cx={cx} cy={cy} r={innerR} fill="none"
        stroke={INK} strokeWidth={flashing ? 2.5 : 0.75}
        className={flashing ? "pubsub-flash" : undefined}
      />
      {/* radiating lines */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI * 2) / 6;
        return (
          <line key={i}
            x1={cx + Math.cos(angle) * innerR} y1={cy + Math.sin(angle) * innerR}
            x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r}
            stroke={INK} strokeWidth={0.5}
          />
        );
      })}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// CDN: an edge network — four fully-connected nodes in a diamond; the pulse
// ripples through once per inbound packet (keyed on passCount, so responses
// passing back through never retrigger it)
function CdnGlyph({ state, w, h, passCount = 0 }: {
  state: ComponentState; w: number; h: number; passCount?: number;
}) {
  const op = outlineProps(state);
  const nodes: [number, number][] = [
    [0.12, 0.5], [0.5, 0.18], [0.5, 0.82], [0.88, 0.5],
  ];
  const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]];
  const delays = [0, 0.08, 0.08, 0.16];
  const pts = nodes.map(([fx, fy]) => ({ x: 4 + fx * w, y: 4 + fy * h }));
  const r = Math.min(w, h) * 0.13;

  return (
    <g>
      {/* mesh links */}
      {links.map(([a, b], i) => (
        <line key={i} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y}
          stroke={op.stroke} strokeWidth={1} />
      ))}
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {/* edge nodes — remounted on each pass so the ripple plays exactly once */}
      <g key={passCount}>
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={r}
            fill={PAPER} stroke={op.stroke} strokeWidth={op.strokeWidth * 0.8}
            className={passCount > 0 ? "node-pass" : undefined}
            style={{ animationDelay: `${delays[i]}s` }}
          />
        ))}
      </g>
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// OBJECT STORAGE: a bucket — rim, tapered pail, arched handle; writes rest at the bottom
function ObjectStorageGlyph({ state, w, h, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; processingCount?: number;
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
  const items = Math.min(processingCount, 3);

  const body = `M ${topL} ${rimY + rimH} L ${topR} ${rimY + rimH} L ${botR} ${botY} L ${botL} ${botY} Z`;
  // handle at rest, draped across the front of the pail
  const handle = `M ${topL} ${rimY + rimH} A ${w * 0.42} ${w * 0.42} 0 0 0 ${topR} ${rimY + rimH}`;

  return (
    <g>
      {/* pail body, tapering toward the base */}
      <path d={body} fill={PAPER} {...op} />
      {/* handle resting against the body */}
      <path d={handle} fill="none" stroke={op.stroke} strokeWidth={1.5} />
      {/* rim band */}
      <rect x={rimX} y={rimY} width={rimW} height={rimH} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={topL} y={rimY + rimH} w={topR - topL} h={botY - rimY - rimH} />}
      {/* resting writes stack at the bottom */}
      {Array.from({ length: items }).map((_, i) => (
        <line key={i}
          x1={botL + 4 + i * 2} y1={botY - 5 - i * 6}
          x2={botR - 4 - i * 2} y2={botY - 5 - i * 6}
          stroke={INK} strokeWidth={1.5}
        />
      ))}
      {state === "selected" && <CornerTicks x={rimX} y={4} w={rimW} h={h} />}
    </g>
  );
}

// API GATEWAY: AWS mark, horizontal — two tall skinny trapezoids facing each other, dotted rows bridging the gap
function ApiGatewayGlyph({ state, w, h, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; processingCount?: number;
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
  const dotCols = [0.2, 0.5, 0.8].map(f => x1 + 4 + (x2 - x1 - 8) * f);
  const active = Math.min(processingCount, dotRows.length);

  return (
    <g>
      <polygon points={leftTrap} fill={PAPER} {...op} />
      <polygon points={rightTrap} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={left} y={cy - wide} w={w} h={wide * 2} />}
      {/* dotted bridges — rows fill top to bottom as packets pass through */}
      {dotRows.map((dy, ri) =>
        dotCols.map((dx, ci) => {
          const on = ri < active;
          return (
            <rect key={`${ri}-${ci}`}
              x={dx - 1.75} y={dy - 1.75} width={3.5} height={3.5}
              fill={on ? INK : "none"}
              stroke={on ? INK : INK_HAIRLINE} strokeWidth={0.5}
            />
          );
        })
      )}
      {state === "selected" && <CornerTicks x={left} y={cy - wide} w={w} h={wide * 2} />}
    </g>
  );
}

// DNS: open ledger — peaked spine, two splayed pages
function DnsGlyph({ state, w, h, processingCount = 0 }: {
  state: ComponentState; w: number; h: number; processingCount?: number;
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
      <polygon points={points} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={topOuterY} w={w} h={botOuterY - topOuterY} />}
      {/* spine */}
      <line x1={cx} y1={peakY} x2={cx} y2={botSpineY} stroke={INK} strokeWidth={1} />
      {/* rows follow the page slant; the answered row darkens */}
      {Array.from({ length: rows }).map((_, i) => {
        const f = 0.35 + i * 0.2;
        const active = i < processingCount;
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
        const stroke = active ? INK : INK_HAIRLINE;
        const rowW = active ? 1.25 : 0.5;
        return (
          <g key={i}>
            <line x1={lx0} y1={ly(lx0)} x2={lx1} y2={ly(lx1)} stroke={stroke} strokeWidth={rowW} />
            <line x1={rx0} y1={ry(rx0)} x2={rx1} y2={ry(rx1)} stroke={stroke} strokeWidth={rowW} />
          </g>
        );
      })}
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

// USER: plain labeled disc
function UserGlyph({ state, w, h }: { state: ComponentState; w: number; h: number }) {
  const op = outlineProps(state);
  const cx = 4 + w / 2;
  const cy = 4 + h / 2;
  const r = Math.min(w, h) / 2 - 2;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={PAPER} {...op} />
      {state === "failed" && <DiagonalHatch x={4} y={4} w={w} h={h} />}
      {/* inner dot */}
      <circle cx={cx} cy={cy} r={4} fill={INK} />
      {state === "selected" && <CornerTicks x={4} y={4} w={w} h={h} />}
    </g>
  );
}

export default function ComponentGlyph(props: GlyphProps) {
  const {
    type, state, width = 64, height = 64,
    instances = 1, capacity = 16, depth = 8, replicas = 0,
    armAngle = 0, passCount = 0, processingCount = 0,
  } = props;

  const w = width - 8;
  const h = height - 8;

  return (
    <svg
      width={width} height={height}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
    >
      {type === "server" && <ServerGlyph state={state} w={w} h={h} instances={instances} processingCount={processingCount} />}
      {type === "load_balancer" && <LoadBalancerGlyph state={state} w={w} h={h} armAngle={armAngle} />}
      {type === "cache" && <CacheGlyph state={state} w={w} h={h} capacity={capacity} processingCount={processingCount} />}
      {type === "sql_db" && <SqlDbGlyph state={state} w={w} h={h} replicas={replicas} processingCount={processingCount} />}
      {type === "nosql_db" && <NosqlDbGlyph state={state} w={w} h={h} processingCount={processingCount} />}
      {type === "queue" && <QueueGlyph state={state} w={w} h={h} depth={depth} queueDepth={processingCount} />}
      {type === "pubsub" && <PubSubGlyph state={state} w={w} h={h} processingCount={processingCount} />}
      {type === "cdn" && <CdnGlyph state={state} w={w} h={h} passCount={passCount} />}
      {type === "object_storage" && <ObjectStorageGlyph state={state} w={w} h={h} processingCount={processingCount} />}
      {type === "api_gateway" && <ApiGatewayGlyph state={state} w={w} h={h} processingCount={processingCount} />}
      {type === "dns" && <DnsGlyph state={state} w={w} h={h} processingCount={processingCount} />}
      {type === "user" && <UserGlyph state={state} w={w} h={h} />}
    </svg>
  );
}
