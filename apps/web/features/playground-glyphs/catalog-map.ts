import type { LoadBalancerConfig, PostgresConfig, RedisConfig, ServiceConfig } from "@faultline/component-catalog";
import type { ComponentDefinition, ComponentInstance, JsonObject } from "@faultline/core";

import { GLYPH_SIZES } from "./glyph-sizes";
import type { CatalogGlyphProps, GlyphRenderType, GlyphType } from "./glyph-types";

/** Stable catalog type → visual glyph type. Unlisted types fall back to a labeled rectangle. */
export const CATALOG_GLYPH_MAP: Readonly<Record<string, GlyphType>> = {
  "traffic-source": "user",
  service: "server",
  "load-balancer": "load_balancer",
  redis: "cache",
  postgres: "sql_db",
  cdn: "cdn",
  "global-router": "global_router",
};

const TIER_VISUAL_CAPACITY: Readonly<Record<string, number>> = {
  small: 9,
  medium: 16,
  large: 25,
};

export function catalogTypeToGlyphType(catalogType: string): GlyphRenderType {
  return CATALOG_GLYPH_MAP[catalogType] ?? "fallback";
}

function tierToVisualCapacity(tier: string | undefined): number {
  if (tier && tier in TIER_VISUAL_CAPACITY) {
    return TIER_VISUAL_CAPACITY[tier];
  }
  return TIER_VISUAL_CAPACITY.medium;
}

function parseConfig<T extends JsonObject>(
  definition: ComponentDefinition,
  config: JsonObject,
): T {
  const parsed = definition.configSchema.safeParse(config);
  if (parsed.success) {
    return parsed.data as T;
  }
  return definition.defaultConfig as T;
}

function serviceInstances(component: ComponentInstance, config: ServiceConfig): number {
  const regionalTotal = component.deployments.reduce((sum, deployment) => {
    const instances = deployment.config.instances;
    return sum + (typeof instances === "number" && Number.isFinite(instances) ? instances : 0);
  }, 0);
  return regionalTotal > 0 ? regionalTotal : config.instances;
}

function postgresReplicaCount(component: ComponentInstance, config: PostgresConfig): number {
  const deploymentReplicas = component.deployments.filter(
    (deployment) => deployment.config.role === "replica",
  ).length;
  return deploymentReplicas > 0 ? deploymentReplicas : config.readReplicaCount;
}

function loadBalancerArmAngle(policy: LoadBalancerConfig["policy"]): number {
  // Equal policy steps sequentially; capacity-weighted sweeps toward the quietest line.
  return policy === "capacity_weighted" ? 18 : -12;
}

function propsForCatalogType(
  catalogType: string,
  component: ComponentInstance,
  definition: ComponentDefinition,
): CatalogGlyphProps {
  switch (catalogType) {
    case "traffic-source":
      return { type: "user" };

    case "service": {
      const config = parseConfig<ServiceConfig>(definition, component.config);
      return { type: "server", instances: serviceInstances(component, config) };
    }

    case "load-balancer": {
      const config = parseConfig<LoadBalancerConfig>(definition, component.config);
      return { type: "load_balancer", armAngle: loadBalancerArmAngle(config.policy) };
    }

    case "redis": {
      const config = parseConfig<RedisConfig>(definition, component.config);
      const baseCapacity = tierToVisualCapacity(config.tier);
      return {
        type: "cache",
        capacity: config.mode === "replicated" ? Math.round(baseCapacity * 1.5) : baseCapacity,
      };
    }

    case "postgres": {
      const config = parseConfig<PostgresConfig>(definition, component.config);
      return {
        type: "sql_db",
        replicas: postgresReplicaCount(component, config),
      };
    }

    case "cdn":
      return { type: "cdn" };

    case "global-router":
      return { type: "global_router" };

    default:
      return { type: "fallback", fallbackLabel: definition.label };
  }
}

/** Pure catalog → glyph props. No simulator calls. */
export function glyphPropsFromComponent(
  component: ComponentInstance,
  definition: ComponentDefinition,
): CatalogGlyphProps {
  const glyphType = catalogTypeToGlyphType(component.type);
  if (glyphType === "fallback") {
    return { type: "fallback", fallbackLabel: definition.label };
  }
  return propsForCatalogType(component.type, component, definition);
}

export function glyphDimensionsForProps(props: CatalogGlyphProps): { width: number; height: number } {
  if (props.type === "fallback") {
    return { width: 64, height: 56 };
  }
  const size = GLYPH_SIZES[props.type];
  if (!size) {
    return { width: 64, height: 56 };
  }
  return { width: size.w, height: size.h };
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
