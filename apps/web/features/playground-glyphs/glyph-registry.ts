import type { LoadBalancerConfig, PostgresConfig, RedisConfig, ServiceConfig } from "@faultline/component-catalog";
import type { ComponentDefinition, ComponentInstance, JsonObject } from "@faultline/core";

import type { CatalogGlyphProps, GlyphMachineSize, GlyphType } from "./glyph-types.ts";

export type GlyphFamilyAdapter = (
  component: ComponentInstance,
  definition: ComponentDefinition,
) => CatalogGlyphProps;

const TIER_VISUAL_CAPACITY: Readonly<Record<string, number>> = { small: 9, medium: 16, large: 25 };

function asMachineSize(value: unknown): GlyphMachineSize {
  if (value === "small" || value === "medium" || value === "large") return value;
  return "medium";
}

function parseConfig<T extends JsonObject>(definition: ComponentDefinition, config: JsonObject): T {
  const parsed = definition.configSchema.safeParse(config);
  return (parsed.success ? parsed.data : definition.defaultConfig) as T;
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
  // This is an idle posture only; live route selection belongs to simulator evidence.
  return policy === "capacity_weighted" ? 18 : -12;
}

function staticGlyph(type: GlyphType): GlyphFamilyAdapter {
  return () => ({ type });
}

/** Web-only family registry. It contains no catalog-type switch and no simulator access. */
export const glyphFamilyRegistry: Readonly<Record<GlyphType, GlyphFamilyAdapter>> = {
  user: staticGlyph("user"),
  global_router: staticGlyph("global_router"),
  dns: staticGlyph("dns"),
  api_gateway: staticGlyph("api_gateway"),
  nosql_db: staticGlyph("nosql_db"),
  queue: staticGlyph("queue"),
  pubsub: staticGlyph("pubsub"),
  object_storage: staticGlyph("object_storage"),
  load_balancer: (component, definition) => {
    const config = parseConfig<LoadBalancerConfig>(definition, component.config);
    return { type: "load_balancer", armAngle: loadBalancerArmAngle(config.policy) };
  },
  server: (component, definition) => {
    const config = parseConfig<ServiceConfig>(definition, component.config);
    return {
      type: "server",
      instances: serviceInstances(component, config),
      machineSize: asMachineSize(config.size),
    };
  },
  cdn: (component, definition) => {
    const config = parseConfig<{ tier?: string }>(definition, component.config);
    return { type: "cdn", machineSize: asMachineSize(config.tier) };
  },
  cache: (component, definition) => {
    const config = parseConfig<RedisConfig>(definition, component.config);
    const baseCapacity = TIER_VISUAL_CAPACITY[config.tier] ?? TIER_VISUAL_CAPACITY.medium;
    return {
      type: "cache",
      capacity: config.mode === "replicated" ? Math.round(baseCapacity * 1.5) : baseCapacity,
      machineSize: asMachineSize(config.tier),
    };
  },
  sql_db: (component, definition) => {
    const config = parseConfig<PostgresConfig>(definition, component.config);
    return {
      type: "sql_db",
      replicas: postgresReplicaCount(component, config),
      machineSize: asMachineSize(config.tier),
    };
  },
};

export function hasGlyphFamily(glyph: string): glyph is GlyphType {
  return glyph in glyphFamilyRegistry;
}
