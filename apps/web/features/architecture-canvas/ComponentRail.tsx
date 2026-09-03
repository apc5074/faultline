"use client";

import { useCallback, useMemo, useState } from "react";

import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import {
  ComponentGlyph,
  glyphPropsFromComponent,
} from "@/features/playground-glyphs";

const RAIL_GROUP_ORDER = ["Edge", "Routing", "Compute", "Async", "Storage"] as const;

const RAIL_TYPE_ORDER: Partial<Record<string, number>> = {
  cdn: 0,
  "global-router": 0,
  "load-balancer": 1,
  service: 0,
  postgres: 0,
  redis: 1,
  "traffic-source": 0,
  queue: 0,
  worker: 1,
  "object-storage": 0,
};

const RAIL_SHORT_LABELS: Partial<Record<string, string>> = {
  "global-router": "Router",
  "load-balancer": "LB",
  "traffic-source": "Traffic",
};

const RAIL_GLYPH_SIZE = 36;

const RAIL_DESCRIPTIONS: Partial<Record<string, string>> = {
  cdn: "Caches responses at the edge so fewer requests reach your origin.",
  "global-router": "Routes users to the best region for latency and failover.",
  "load-balancer": "Spreads incoming traffic across multiple service instances.",
  service: "Runs application logic; scale with size and instance count.",
  redis: "In-memory cache that speeds reads and protects the database.",
  postgres: "Durable relational store; replicas scale read traffic.",
  queue: "Buffers asynchronous work so user-facing requests do not wait for processing.",
  worker: "Consumes queued work and processes it independently from API capacity.",
  "object-storage": "Stores large source and rendition objects outside the relational database.",
};

function railDescriptionForDefinition(definition: ComponentDefinition): string {
  return RAIL_DESCRIPTIONS[definition.type] ?? definition.label;
}

function railGroupForDefinition(definition: ComponentDefinition): string {
  switch (definition.type) {
    case "cdn":
      return "Edge";
    case "global-router":
    case "load-balancer":
      return "Routing";
    case "service":
      return "Compute";
    case "queue":
    case "worker":
      return "Async";
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

type ActiveRailTip = {
  label: string;
  description: string;
  top: number;
  left: number;
};

export function ComponentRail({ definitions }: { definitions: readonly ComponentDefinition[] }) {
  const [activeTip, setActiveTip] = useState<ActiveRailTip | null>(null);

  const showTip = useCallback((element: HTMLElement, definition: ComponentDefinition) => {
    const rect = element.getBoundingClientRect();
    const mobile = window.matchMedia("(width <= 640px)").matches;
    setActiveTip({
      label: definition.label,
      description: railDescriptionForDefinition(definition),
      top: mobile ? rect.bottom : rect.top + rect.height / 2,
      left: mobile ? rect.left + rect.width / 2 : rect.right + 8,
    });
  }, []);

  const hideTip = useCallback(() => setActiveTip(null), []);
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
    <>
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
                  onMouseEnter={(event) => showTip(event.currentTarget, definition)}
                  onMouseLeave={hideTip}
                  onDragStart={(event) => {
                    hideTip();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/faultline-component-type", definition.type);
                  }}
                >
                  <span className="component-rail__glyph" aria-hidden="true">
                    <ComponentGlyph
                      {...glyphProps}
                      state="idle"
                      width={RAIL_GLYPH_SIZE}
                      height={RAIL_GLYPH_SIZE}
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
      {activeTip ? (
        <div
          role="tooltip"
          className="component-rail__tooltip component-rail__tooltip--floating"
          style={{ top: activeTip.top, left: activeTip.left }}
        >
          <span className="component-rail__tooltip-title">{activeTip.label}</span>
          <span className="component-rail__tooltip-body">{activeTip.description}</span>
        </div>
      ) : null}
    </>
  );
}
