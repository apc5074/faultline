import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import { GLYPH_SIZES } from "./glyph-sizes.ts";
import { glyphFamilyRegistry, hasGlyphFamily } from "./glyph-registry.ts";
import type { CatalogGlyphProps, GlyphMachineSize, GlyphRenderType, GlyphType } from "./glyph-types.ts";

/** Chassis scale from catalog size/tier. Kept subtle so layout stays stable. */
const MACHINE_SIZE_SCALE: Readonly<Record<GlyphMachineSize, number>> = {
  small: 0.88,
  medium: 1,
  large: 1.14,
};

/** Compatibility view generated from catalog descriptors; it is not the source of glyph identity. */
export const CATALOG_GLYPH_MAP: Readonly<Record<string, GlyphType>> = Object.freeze(
  Object.fromEntries(
    componentRegistry.list().flatMap((definition) =>
      hasGlyphFamily(definition.presentation.glyph) ? [[definition.type, definition.presentation.glyph]] : [],
    ),
  ),
);

export function catalogTypeToGlyphType(catalogType: string): GlyphRenderType {
  const definition = componentRegistry.has(catalogType) ? componentRegistry.get(catalogType) : undefined;
  const glyph = definition?.presentation.glyph;
  return glyph && hasGlyphFamily(glyph) ? glyph : "fallback";
}

/** Pure catalog descriptor → static glyph props. No simulator calls or live metrics. */
export function glyphPropsFromComponent(
  component: ComponentInstance,
  definition: ComponentDefinition,
): CatalogGlyphProps {
  const glyph = definition.presentation.glyph;
  const adapter = glyphFamilyRegistry[glyph as GlyphType];
  return adapter ? adapter(component, definition) : { type: "fallback", fallbackLabel: definition.label };
}

export function glyphDimensionsForProps(props: CatalogGlyphProps): { width: number; height: number } {
  if (props.type === "fallback") return { width: 64, height: 56 };
  const base = GLYPH_SIZES[props.type];
  if (!base) return { width: 64, height: 56 };
  // Server and Postgres tiers change internal density, not their row baseline.
  // CDN coverage scales its visual footprint.
  const scale =
    props.type === "cdn"
      ? MACHINE_SIZE_SCALE[props.machineSize ?? "medium"]
      : 1;
  return {
    width: Math.round(base.w * scale),
    height: Math.round(base.h * scale),
  };
}

/** Level 1 catalog types that must each resolve to a distinct mini silhouette. */
export const LEVEL1_CATALOG_TYPES = [
  "traffic-source",
  "service",
  "load-balancer",
  "redis",
  "postgres",
  "cdn",
  "global-router",
] as const;
