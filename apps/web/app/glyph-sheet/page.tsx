import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentDefinition, ComponentInstance, JsonObject } from "@faultline/core";

import {
  ComponentGlyph,
  GLYPH_LABELS,
  GLYPH_SIZES,
  GLYPH_TYPES,
  LEVEL1_CATALOG_TYPES,
  MINI_GLYPH_SIZE,
  glyphPropsFromComponent,
  type GlyphState,
} from "@/features/playground-glyphs";

const SAMPLE_CONFIGS: Partial<Record<string, JsonObject>> = {
  service: { size: "medium", instances: 3 },
  postgres: { tier: "medium", readReplicaCount: 2 },
  redis: { mode: "replicated", tier: "large", ttlBand: "medium" },
  "load-balancer": { policy: "capacity_weighted" },
  cdn: { coverage: 0.85, ttlBand: "long", tier: "medium" },
};

function sampleComponent(definition: ComponentDefinition): ComponentInstance {
  return {
    id: `sample-${definition.type}`,
    type: definition.type,
    config: SAMPLE_CONFIGS[definition.type] ?? definition.defaultConfig,
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

const GLYPH_STATES: readonly GlyphState[] = ["idle", "selected", "processing", "warning", "saturated", "failed"];

export default function GlyphSheetPage() {
  return (
    <main className="glyph-sheet">
      <header className="glyph-sheet__header">
        <p className="playground-topbar__wordmark">Faultline</p>
        <h1 className="glyph-sheet__title">Component glyph sheet</h1>
        <p className="glyph-sheet__intro">All twelve prototype silhouettes at rest and in each visual state.</p>
      </header>

      <section className="glyph-sheet__section" aria-label="Glyphs at idle">
        <h2 className="glyph-sheet__section-title">At rest</h2>
        <div className="glyph-sheet__grid">
          {GLYPH_TYPES.map((type) => {
            const size = GLYPH_SIZES[type];
            return (
              <figure key={type} className="glyph-sheet__cell">
                <ComponentGlyph type={type} state="idle" width={size.w} height={size.h} />
                <figcaption>{GLYPH_LABELS[type]}</figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      <section className="glyph-sheet__section" aria-label="Mini silhouettes">
        <h2 className="glyph-sheet__section-title">Mini ({MINI_GLYPH_SIZE}px rail)</h2>
        <div className="glyph-sheet__grid glyph-sheet__grid--mini">
          {GLYPH_TYPES.map((type) => (
            <figure key={type} className="glyph-sheet__cell">
              <ComponentGlyph type={type} state="idle" width={MINI_GLYPH_SIZE} height={MINI_GLYPH_SIZE} mini />
              <figcaption>{GLYPH_LABELS[type]}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="glyph-sheet__section" aria-label="State matrix">
        <h2 className="glyph-sheet__section-title">States (server)</h2>
        <div className="glyph-sheet__grid">
          {GLYPH_STATES.map((state) => (
            <figure key={state} className="glyph-sheet__cell">
              <ComponentGlyph
                type="server"
                state={state}
                width={GLYPH_SIZES.server.w}
                height={GLYPH_SIZES.server.h}
                instances={3}
                processingCount={state === "processing" ? 2 : 0}
              />
              <figcaption>{state}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="glyph-sheet__section" aria-label="Level 1 catalog mapping">
        <h2 className="glyph-sheet__section-title">Level 1 catalog → glyph (mini)</h2>
        <div className="glyph-sheet__grid glyph-sheet__grid--mini">
          {LEVEL1_CATALOG_TYPES.map((catalogType) => {
            const definition = componentRegistry.get(catalogType);
            const component = sampleComponent(definition);
            const glyphProps = glyphPropsFromComponent(component, definition);
            return (
              <figure key={catalogType} className="glyph-sheet__cell">
                <ComponentGlyph
                  {...glyphProps}
                  state="idle"
                  width={MINI_GLYPH_SIZE}
                  height={MINI_GLYPH_SIZE}
                  mini
                />
                <figcaption>{definition.label}</figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      <section className="glyph-sheet__section" aria-label="Unmapped fallback">
        <h2 className="glyph-sheet__section-title">Fallback silhouette</h2>
        <div className="glyph-sheet__grid glyph-sheet__grid--mini">
          <figure className="glyph-sheet__cell">
            <ComponentGlyph
              type="fallback"
              fallbackLabel="Future Worker"
              state="idle"
              width={MINI_GLYPH_SIZE}
              height={MINI_GLYPH_SIZE}
              mini
            />
            <figcaption>mini</figcaption>
          </figure>
          <figure className="glyph-sheet__cell">
            <ComponentGlyph
              type="fallback"
              fallbackLabel="Future Worker"
              state="idle"
              width={64}
              height={48}
            />
            <figcaption>labeled</figcaption>
          </figure>
        </div>
      </section>

      <section className="glyph-sheet__section" aria-label="Mechanism motion samples">
        <h2 className="glyph-sheet__section-title">Mechanism samples</h2>
        <div className="glyph-sheet__grid">
          <figure className="glyph-sheet__cell">
            <ComponentGlyph type="load_balancer" state="processing" armAngle={22} width={72} height={64} />
            <figcaption>Load balancer arm</figcaption>
          </figure>
          <figure className="glyph-sheet__cell">
            <ComponentGlyph type="cache" state="processing" capacity={16} processingCount={3} width={64} height={64} />
            <figcaption>Cache hit flicker</figcaption>
          </figure>
          <figure className="glyph-sheet__cell">
            <ComponentGlyph type="cdn" state="processing" passCount={1} width={80} height={56} />
            <figcaption>CDN node pass</figcaption>
          </figure>
          <figure className="glyph-sheet__cell">
            <ComponentGlyph type="queue" state="processing" depth={8} processingCount={6} width={96} height={48} />
            <figcaption>Queue depth</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
