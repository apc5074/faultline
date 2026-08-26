import { isValidRegion, type Architecture, type CostResult } from "@faultline/core";

export interface RegionalDeploymentEntry {
  readonly componentId: string;
  readonly deploymentId: string;
  readonly regionId: string;
}

export interface RegionalTrafficOrigin {
  readonly regionId: string;
  readonly redirectRps: number;
  readonly writeRps: number;
}

export interface CompactGeographicRoute {
  readonly originRegion: string;
  readonly destinationRegion: string;
  readonly componentId: string;
  readonly deploymentId: string;
  readonly kind: "request" | "read" | "write";
  readonly rps: number;
  readonly networkLatencyMs: number;
}

export interface CrossRegionCostFact {
  readonly sourceRegion: string;
  readonly targetRegion: string;
  readonly kind: "transfer" | "replication";
  readonly monthlyAmount: number;
  readonly label: string;
}

/** Compact simulator regional facts attached to AgentContext. */
export interface AgentRegionalEvidence {
  readonly active: boolean;
  readonly origins?: readonly RegionalTrafficOrigin[];
  readonly routes?: readonly CompactGeographicRoute[];
}

export interface DeploymentInventory {
  readonly regions: readonly string[];
  readonly deployments: readonly RegionalDeploymentEntry[];
}

function parseRegionPairFromSyntheticId(
  componentId: string,
  prefix: "xfer" | "repl",
): { sourceRegion: string; targetRegion: string } | null {
  const marker = `${prefix}:`;
  if (!componentId.startsWith(marker)) return null;
  const pair = componentId.slice(marker.length);
  const separator = pair.indexOf("->");
  if (separator <= 0 || separator >= pair.length - 2) return null;
  return {
    sourceRegion: pair.slice(0, separator),
    targetRegion: pair.slice(separator + 2),
  };
}

/** Canonical multi-region deployment inventory from architecture state. */
export function deploymentInventoryFromArchitecture(architecture: Architecture): DeploymentInventory {
  const regions = new Set<string>();
  const deployments: RegionalDeploymentEntry[] = [];

  for (const component of [...architecture.components].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const deployment of [...component.deployments].sort((left, right) => left.id.localeCompare(right.id))) {
      if (!isValidRegion(deployment.regionId)) continue;
      regions.add(deployment.regionId);
      deployments.push({
        componentId: component.id,
        deploymentId: deployment.id,
        regionId: deployment.regionId,
      });
    }
  }

  return {
    regions: [...regions].sort((left, right) => left.localeCompare(right)),
    deployments,
  };
}

/** Project cross-region transfer/replication cost facts from shared CostResult line items. */
export function crossRegionCostFacts(cost: CostResult): readonly CrossRegionCostFact[] {
  const facts: CrossRegionCostFact[] = [];

  for (const item of cost.lineItems) {
    const transferPair = parseRegionPairFromSyntheticId(item.componentId, "xfer");
    if (transferPair) {
      facts.push({
        sourceRegion: transferPair.sourceRegion,
        targetRegion: transferPair.targetRegion,
        kind: "transfer",
        monthlyAmount: item.amount,
        label: item.label ?? `Transfer · ${transferPair.sourceRegion} → ${transferPair.targetRegion}`,
      });
      continue;
    }

    const replicationPair = parseRegionPairFromSyntheticId(item.componentId, "repl");
    if (replicationPair) {
      facts.push({
        sourceRegion: replicationPair.sourceRegion,
        targetRegion: replicationPair.targetRegion,
        kind: "replication",
        monthlyAmount: item.amount,
        label: item.label ?? `Replication · ${replicationPair.sourceRegion} → ${replicationPair.targetRegion}`,
      });
    }
  }

  return facts.sort((left, right) => {
    const byKind = left.kind.localeCompare(right.kind);
    if (byKind !== 0) return byKind;
    const bySource = left.sourceRegion.localeCompare(right.sourceRegion);
    return bySource !== 0 ? bySource : left.targetRegion.localeCompare(right.targetRegion);
  });
}

/** Build adapter-neutral regional simulator evidence from propagation output. */
export function buildAgentRegionalEvidence(input: {
  readonly regionalWorkload: {
    readonly active: boolean;
    readonly origins: readonly {
      readonly regionId: string;
      readonly redirectRps: number;
      readonly writeRps: number;
    }[];
  };
  readonly geographicRoutes: readonly {
    readonly originRegion: string;
    readonly destinationRegion: string;
    readonly componentId: string;
    readonly deploymentId: string;
    readonly kind: "request" | "read" | "write";
    readonly rps: number;
    readonly networkLatencyMs: number;
  }[];
}): AgentRegionalEvidence {
  const origins =
    input.regionalWorkload.active && input.regionalWorkload.origins.length > 0
      ? [...input.regionalWorkload.origins]
          .sort((left, right) => left.regionId.localeCompare(right.regionId))
          .map((origin) => ({
            regionId: origin.regionId,
            redirectRps: origin.redirectRps,
            writeRps: origin.writeRps,
          }))
      : undefined;

  const routes =
    input.geographicRoutes.length > 0
      ? [...input.geographicRoutes]
          .sort((left, right) => {
            const byOrigin = left.originRegion.localeCompare(right.originRegion);
            if (byOrigin !== 0) return byOrigin;
            const byDestination = left.destinationRegion.localeCompare(right.destinationRegion);
            if (byDestination !== 0) return byDestination;
            const byComponent = left.componentId.localeCompare(right.componentId);
            if (byComponent !== 0) return byComponent;
            const byDeployment = left.deploymentId.localeCompare(right.deploymentId);
            if (byDeployment !== 0) return byDeployment;
            const byKind = left.kind.localeCompare(right.kind);
            return byKind !== 0 ? byKind : left.rps - right.rps;
          })
          .map((route) => ({
            originRegion: route.originRegion,
            destinationRegion: route.destinationRegion,
            componentId: route.componentId,
            deploymentId: route.deploymentId,
            kind: route.kind,
            rps: route.rps,
            networkLatencyMs: route.networkLatencyMs,
          }))
      : undefined;

  return {
    active: input.regionalWorkload.active || (routes?.length ?? 0) > 0,
    ...(origins ? { origins } : {}),
    ...(routes ? { routes } : {}),
  };
}
