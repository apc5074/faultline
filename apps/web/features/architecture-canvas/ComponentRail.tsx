"use client";

import { useMemo } from "react";

import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import {
  ComponentGlyph,
  MINI_GLYPH_SIZE,
  glyphPropsFromComponent,
} from "@/features/playground-glyphs";

const RAIL_GROUP_ORDER = ["Edge", "Routing", "Compute", "Storage"] as const;

const RAIL_TYPE_ORDER: Partial<Record<string, number>> = {
  cdn: 0,
  "global-router": 0,
  "load-balancer": 1,
  service: 0,
  postgres: 0,
  redis: 1,
  "traffic-source": 0,
};

const RAIL_SHORT_LABELS: Partial<Record<string, string>> = {
  "global-router": "Router",
  "load-balancer": "LB",
  "traffic-source": "Traffic",
};

function railGroupForDefinition(definition: ComponentDefinition): string {
  switch (definition.type) {
    case "cdn":
      return "Edge";
    case "global-router":
    case "load-balancer":
      return "Routing";
    case "service":
      return "Compute";
    case "postgres":
    case "redis":
      return "Storage";
    default:
      return definition.category;
  }
}

function railLabelForDefinition(definition: ComponentDefinition): string {
  return RAIL_SHORT_LABELS[definition.type] ?? definition.label;
}

function sampleComponentForRail(definition: ComponentDefinition): ComponentInstance {
  return {
    id: `rail-${definition.type}`,
    type: definition.type,
    config: definition.defaultConfig,
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function compareRailDefinitions(a: ComponentDefinition, b: ComponentDefinition): number {
  const orderA = RAIL_TYPE_ORDER[a.type] ?? 0;
  const orderB = RAIL_TYPE_ORDER[b.type] ?? 0;
  if (orderA !== orderB) return orderA - orderB;
  return a.label.localeCompare(b.label);
}

export function ComponentRail({ definitions }: { definitions: readonly ComponentDefinition[] }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, ComponentDefinition[]>();

    for (const definition of definitions) {
      if (definition.type === "traffic-source") continue;

      const group = railGroupForDefinition(definition);
      const items = groups.get(group) ?? [];
      items.push(definition);
      groups.set(group, items);
    }

    return RAIL_GROUP_ORDER.filter((group) => groups.has(group)).map((group) => {
      const items = [...(groups.get(group) ?? [])].sort(compareRailDefinitions);
      return [group, items] as const;
    });
  }, [definitions]);

  return (
    <aside className="component-rail" aria-label="Components">
      {grouped.map(([category, items], index) => (
        <div key={category} className="component-rail__group">
          {index > 0 ? <div className="component-rail__divider" aria-hidden="true" /> : null}
          <p className="component-rail__category">{category}</p>
          {items.map((definition) => {
            const glyphProps = glyphPropsFromComponent(sampleComponentForRail(definition), definition);
            return (
              <div
                key={definition.type}
                className="component-rail__item"
                draggable
                title={definition.label}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/faultline-component-type", definition.type);
                }}
              >
                <span className="component-rail__glyph" aria-hidden="true">
                  <ComponentGlyph
                    {...glyphProps}
                    state="idle"
                    width={MINI_GLYPH_SIZE}
                    height={MINI_GLYPH_SIZE}
                    mini
                  />
                </span>
                <span className="component-rail__label">{railLabelForDefinition(definition)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
