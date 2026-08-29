import { isFailingGlyphState, isStrainingGlyphState, type GlyphState } from "./glyph-types.ts";

export const GLYPH_INK = {
  paper: "var(--color-paper)",
  ink: "var(--color-ink)",
  inkFaint: "var(--color-ink-faint)",
  inkHairline: "var(--color-ink-hairline)",
  signalRed: "var(--color-signal-red)",
} as const;

export type GlyphOutlineProps = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
};

export function outlineProps(state: GlyphState): GlyphOutlineProps {
  if (state === "selected") {
    return { stroke: GLYPH_INK.ink, strokeWidth: 3.5 };
  }
  if (isFailingGlyphState(state)) {
    return {
      stroke: GLYPH_INK.signalRed,
      strokeWidth: 2.5,
      ...(state === "failed" ? { strokeDasharray: "5 3" } : {}),
    };
  }
  if (isStrainingGlyphState(state)) {
    return { stroke: GLYPH_INK.ink, strokeWidth: 2.5 };
  }
  if (state === "stale") {
    return { stroke: GLYPH_INK.inkFaint, strokeWidth: 1.5, strokeDasharray: "2 3" };
  }
  return { stroke: GLYPH_INK.ink, strokeWidth: 2.25 };
}
