"use client";

import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentInstance } from "@faultline/core";

import {
  ComponentGlyph,
  glyphPropsFromComponent,
  MINI_GLYPH_SIZE,
  type GlyphState,
} from "@/features/playground-glyphs";

export function WorldMapDeploymentGlyph({
  component,
  selected,
  unavailable = false,
}: {
  component: ComponentInstance;
  selected: boolean;
  /** Simulator-emitted experiment evidence; never changes deployment identity. */
  unavailable?: boolean;
}) {
  const definition = componentRegistry.get(component.type);
  const glyphProps = glyphPropsFromComponent(component, definition);
  const state: GlyphState = selected ? "selected" : unavailable ? "failed" : "idle";

  return (
    <ComponentGlyph
      {...glyphProps}
      state={state}
      width={MINI_GLYPH_SIZE}
      height={MINI_GLYPH_SIZE}
      mini
    />
  );
}
