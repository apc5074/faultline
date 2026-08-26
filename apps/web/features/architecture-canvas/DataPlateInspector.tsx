"use client";

import { urlShortenerChallenge } from "@faultline/challenges";
import {
  cdnConfiguredHitIntent,
  cdnHitRateForConfig,
  cdnMonthlyCostForConfig,
  cdnThroughputCapacityForConfig,
  cdnTierModels,
  cdnTtlHitRateBands,
  componentRegistry,
  loadBalancerMonthlyCost,
  loadBalancerPolicies,
  postgresReadCapacityForConfig,
  postgresReadReplicaBounds,
  postgresTierModels,
  postgresWriteCapacityForConfig,
  redisEffectiveModel,
  redisHitRateForConfig,
  redisTierModels,
  redisTtlHitRateBands,
  serviceCapacityForConfig,
  serviceSizeModels,
} from "@faultline/component-catalog";
import {
  createRegionDeployment,
  getRegions,
  isValidRegion,
  type Architecture,
  type ComponentDefinition,
  type ComponentInstance,
  type RegionDeployment,
  type RegionId,
} from "@faultline/core";
import { estimateMonthlyCost, type RequirementsEvaluationResult } from "@faultline/simulator";
import { useState, type ReactNode } from "react";

import {
  ComponentGlyph,
  glyphPropsFromComponent,
  MINI_GLYPH_SIZE,
} from "@/features/playground-glyphs";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

const activeChallenge = urlShortenerChallenge;
const challengeRedirectRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.readRatio;
const challengeWriteRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.writeRatio;

function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

function formatRps(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} RPS`;
}

export type DataPlateInspectorProps = {
  architecture: Architecture;
  component: ComponentInstance | undefined;
  simulation: SuccessfulSimulation | null;
  simulationStale: boolean;
  runComplete: boolean;
  onConfigChange: (componentId: string, config: unknown) => void;
  onDeploymentsChange: (componentId: string, deployments: RegionDeployment[]) => void;
};

function DataPlateShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside className="data-plate-inspector" aria-label={label}>
      {children}
    </aside>
  );
}

function DataPlateHeader({
  component,
  definition,
  displayName,
  renameValue,
  onRename,
}: {
  component: ComponentInstance;
  definition: ComponentDefinition;
  displayName: string;
  renameValue?: string;
  onRename?: (next: string) => void;
}) {
  const glyphProps = glyphPropsFromComponent(component, definition);
  const canRename = renameValue !== undefined && onRename !== undefined;

  return (
    <header className="data-plate-inspector__header">
      <div className="data-plate-inspector__glyph" aria-hidden>
        <ComponentGlyph
          {...glyphProps}
          state="idle"
          width={MINI_GLYPH_SIZE}
          height={MINI_GLYPH_SIZE}
          mini
        />
      </div>
      {canRename ? (
        <input
          className="data-plate-inspector__rename"
          value={renameValue}
          aria-label="Component label"
          onChange={(event) => onRename(event.target.value)}
        />
      ) : (
        <p className="data-plate-inspector__title">{displayName}</p>
      )}
    </header>
  );
}

function DataPlateSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="data-plate-inspector__section">
      <h3 className="data-plate-inspector__section-title">{title}</h3>
      {children}
    </section>
  );
}

function SpecRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SpecList({ children }: { children: ReactNode }) {
  return <dl className="data-plate-inspector__spec tabular">{children}</dl>;
}

function PlateHint({ children }: { children: ReactNode }) {
  return <p className="data-plate-inspector__hint">{children}</p>;
}

function PlateField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="data-plate-inspector__field">
      {label}
      {children}
    </label>
  );
}

function LiveStrip({
  component,
  simulation,
  simulationStale,
  runComplete,
}: {
  component: ComponentInstance;
  simulation: SuccessfulSimulation | null;
  simulationStale: boolean;
  runComplete: boolean;
}) {
  const emptyMessage =
    !runComplete || !simulation
      ? "Run simulation to see live metrics."
      : simulationStale
        ? "Architecture changed — run again for fresh metrics."
        : null;

  const rows: { label: string; value: string }[] = [];

  if (!emptyMessage && simulation) {
    const serviceMetrics = simulation.services[component.id];
    const postgresMetrics = simulation.postgres[component.id];
    const cacheMetrics = simulation.caches[component.id];
    const trafficMetrics = simulation.traffic[component.id];

    if (serviceMetrics) {
      rows.push({ label: "Incoming", value: formatRps(serviceMetrics.incomingRps) });
      rows.push({ label: "Utilization", value: formatPercent(serviceMetrics.utilization) });
      rows.push({ label: "Capacity", value: formatRps(serviceMetrics.capacityRps) });
    }

    if (postgresMetrics) {
      rows.push({ label: "Read", value: formatRps(postgresMetrics.readRps) });
      rows.push({ label: "Write", value: formatRps(postgresMetrics.writeRps) });
      rows.push({ label: "Effective util", value: formatPercent(postgresMetrics.effectiveUtilization) });
    }

    if (cacheMetrics) {
      rows.push({ label: "Hit rate", value: formatPercent(cacheMetrics.hitRate) });
      rows.push({ label: "Hits", value: formatRps(cacheMetrics.hitRps) });
      rows.push({ label: "Misses", value: formatRps(cacheMetrics.missRps) });
      rows.push({ label: "Utilization", value: formatPercent(cacheMetrics.utilization) });
    }

    if (trafficMetrics && rows.length === 0) {
      rows.push({ label: "Incoming", value: formatRps(trafficMetrics.incomingRps) });
      rows.push({ label: "Outgoing", value: formatRps(trafficMetrics.outgoingRps) });
    }

    rows.push({ label: "System p95", value: `${Math.round(simulation.p95LatencyMs)} ms` });
  }

  return (
    <DataPlateSection title="Live">
      {emptyMessage ? (
        <p className="data-plate-inspector__live-empty">{emptyMessage}</p>
      ) : (
        <SpecList>
          {rows.map((row) => (
            <SpecRow key={row.label} label={row.label} value={row.value} />
          ))}
        </SpecList>
      )}
    </DataPlateSection>
  );
}

function AdvancedSection({ component }: { component: ComponentInstance }) {
  const [failureInjection, setFailureInjection] = useState(false);

  return (
    <details className="data-plate-inspector__advanced">
      <summary className="data-plate-inspector__advanced-summary">Advanced</summary>
      <div className="data-plate-inspector__advanced-body">
        <SpecList>
          <SpecRow label="Component ID" value={component.id} />
        </SpecList>
        <label className="data-plate-inspector__checkbox">
          <input
            type="checkbox"
            checked={failureInjection}
            disabled
            onChange={(event) => setFailureInjection(event.target.checked)}
          />
          Failure injection (dev)
        </label>
        <pre className="data-plate-inspector__json">{JSON.stringify(component.config, null, 2)}</pre>
      </div>
    </details>
  );
}

function EmptyInspector() {
  return (
    <DataPlateShell label="Component inspector">
      <p className="data-plate-inspector__empty">Select a component to inspect its configuration.</p>
    </DataPlateShell>
  );
}

export function DataPlateInspector({
  architecture,
  component,
  simulation,
  simulationStale,
  runComplete,
  onConfigChange,
  onDeploymentsChange,
}: DataPlateInspectorProps) {
  if (!component) return <EmptyInspector />;

  const definition = componentRegistry.get(component.type);
  const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
  const monthlyCost = cost.lineItems.find((lineItem) => lineItem.componentId === component.id)?.amount ?? 0;
  const regions = getRegions();

  const shell = (label: string, body: ReactNode) => (
    <DataPlateShell label={label}>
      <DataPlateHeader
        component={component}
        definition={definition}
        displayName={definition.label}
        renameValue={component.type === "traffic-source" ? String((component.config as { label?: string }).label ?? "") : undefined}
        onRename={
          component.type === "traffic-source"
            ? (next) => onConfigChange(component.id, { label: next })
            : undefined
        }
      />
      {body}
      <LiveStrip
        component={component}
        simulation={simulation}
        simulationStale={simulationStale}
        runComplete={runComplete}
      />
      <AdvancedSection component={component} />
    </DataPlateShell>
  );

  if (component.type === "service") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const size = parsed.data.size as keyof typeof serviceSizeModels;
    const instances = parsed.data.instances as number;
    const sizeModel = serviceSizeModels[size];
    const regional = component.deployments.length > 0;
    const instancesByRegion = Object.fromEntries(
      regions.map((region) => {
        const deployment = component.deployments.find((entry) => entry.regionId === region.id);
        const count = deployment ? Number(deployment.config.instances ?? 0) : 0;
        return [region.id, Number.isFinite(count) ? count : 0];
      }),
    ) as Record<string, number>;

    const setRegionalInstances = (regionId: string, nextCount: number) => {
      const nextCounts = { ...instancesByRegion, [regionId]: Math.max(0, Math.floor(nextCount)) };
      const nextDeployments: RegionDeployment[] = regions
        .filter((region) => (nextCounts[region.id] ?? 0) > 0)
        .map((region) =>
          createRegionDeployment(region.id, { instances: nextCounts[region.id] }, `dep-${component.id}-${region.id}`),
        );
      onDeploymentsChange(component.id, nextDeployments);
    };

    return shell(
      "Stateless Service inspector",
      <>
        <DataPlateSection title="Machine">
          <PlateField label="Size">
            <select
              value={size}
              onChange={(event) => onConfigChange(component.id, { size: event.target.value, instances })}
            >
              {Object.keys(serviceSizeModels).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
          <PlateField label={`Instances ${regional ? "(from regions)" : ""}`}>
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              value={instances}
              disabled={regional}
              onChange={(event) => onConfigChange(component.id, { size, instances: Number(event.target.value) })}
            />
          </PlateField>
          <div className="data-plate-inspector__region-block">
            <p className="data-plate-inspector__region-title">Regional instances</p>
            {regions.map((region) => (
              <PlateField key={region.id} label={region.label}>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={instancesByRegion[region.id] ?? 0}
                  onChange={(event) => setRegionalInstances(region.id, Number(event.target.value))}
                />
              </PlateField>
            ))}
            <PlateHint>
              When any region is set, regional instances are the capacity source and must sum to the logical total.
            </PlateHint>
          </div>
          <SpecList>
            <SpecRow label="Capacity / instance" value={`${sizeModel.capacityPerInstance.toLocaleString()} req/sec`} />
            <SpecRow
              label="Estimated capacity"
              value={`${serviceCapacityForConfig({ size, instances }).toLocaleString()} req/sec`}
            />
            <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
          </SpecList>
        </DataPlateSection>
      </>,
    );
  }

  if (component.type === "postgres") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const tier = parsed.data.tier as keyof typeof postgresTierModels;
    const readReplicaCount = parsed.data.readReplicaCount as number;
    const model = postgresTierModels[tier];
    const primary = component.deployments.find((deployment) => deployment.config.role === "primary");
    const replicaRegionIds = new Set(
      component.deployments
        .filter((deployment) => deployment.config.role === "replica")
        .map((deployment) => deployment.regionId),
    );
    const regional = component.deployments.length > 0;

    const setPrimaryRegion = (regionId: string) => {
      if (!regionId || !isValidRegion(regionId)) {
        onDeploymentsChange(component.id, []);
        return;
      }
      const primaryRegionId: RegionId = regionId;
      const replicas = regions
        .filter((region) => replicaRegionIds.has(region.id) && region.id !== primaryRegionId)
        .map((region) =>
          createRegionDeployment(region.id, { role: "replica" }, `dep-${component.id}-${region.id}-replica`),
        );
      onDeploymentsChange(component.id, [
        createRegionDeployment(primaryRegionId, { role: "primary" }, `dep-${component.id}-${primaryRegionId}-primary`),
        ...replicas,
      ]);
    };

    const toggleReplicaRegion = (regionId: string, enabled: boolean) => {
      const primaryRegionId = primary?.regionId;
      if (!primaryRegionId || !isValidRegion(primaryRegionId) || !isValidRegion(regionId)) return;
      const nextReplicaIds = new Set(replicaRegionIds);
      if (enabled) nextReplicaIds.add(regionId);
      else nextReplicaIds.delete(regionId);
      onDeploymentsChange(component.id, [
        createRegionDeployment(primaryRegionId, { role: "primary" }, `dep-${component.id}-${primaryRegionId}-primary`),
        ...regions
          .filter((region) => nextReplicaIds.has(region.id))
          .map((region) =>
            createRegionDeployment(region.id, { role: "replica" }, `dep-${component.id}-${region.id}-replica`),
          ),
      ]);
    };

    return shell(
      "Postgres inspector",
      <DataPlateSection title="Machine">
        <PlateField label="Tier">
          <select
            value={tier}
            onChange={(event) => onConfigChange(component.id, { tier: event.target.value, readReplicaCount })}
          >
            {Object.keys(postgresTierModels).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </PlateField>
        <PlateField label={`Read replicas ${regional ? "(from regions)" : ""}`}>
          <input
            type="number"
            min={postgresReadReplicaBounds.minimum}
            max={postgresReadReplicaBounds.maximum}
            step="1"
            value={readReplicaCount}
            disabled={regional}
            onChange={(event) =>
              onConfigChange(component.id, { tier, readReplicaCount: Number(event.target.value) })
            }
          />
        </PlateField>
        <div className="data-plate-inspector__region-block">
          <p className="data-plate-inspector__region-title">Regional placement</p>
          <PlateField label="Primary region">
            <select value={primary?.regionId ?? ""} onChange={(event) => setPrimaryRegion(event.target.value)}>
              <option value="">Logical only (no region)</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.label}
                </option>
              ))}
            </select>
          </PlateField>
          {primary ? (
            <div className="data-plate-inspector__replica-list">
              <p className="data-plate-inspector__region-title">Read replica regions</p>
              {regions.map((region) => (
                <label key={region.id} className="data-plate-inspector__checkbox">
                  <input
                    type="checkbox"
                    checked={replicaRegionIds.has(region.id)}
                    onChange={(event) => toggleReplicaRegion(region.id, event.target.checked)}
                  />
                  {region.label}
                </label>
              ))}
            </div>
          ) : null}
          <PlateHint>Exactly one primary. Writes target the primary. Replica regions set readReplicaCount.</PlateHint>
        </div>
        <SpecList>
          <SpecRow
            label="Read capacity"
            value={`${postgresReadCapacityForConfig({ tier, readReplicaCount }).toLocaleString()} req/sec`}
          />
          <SpecRow
            label="Write capacity"
            value={`${postgresWriteCapacityForConfig({ tier }).toLocaleString()} req/sec`}
          />
          <SpecRow label="Primary read" value={`${model.readCapacityRps.toLocaleString()} req/sec`} />
          <SpecRow
            label="Replica read pool"
            value={`${(model.replicaReadCapacityRps * readReplicaCount).toLocaleString()} req/sec`}
          />
          <SpecRow label="Per replica read" value={`${model.replicaReadCapacityRps.toLocaleString()} req/sec`} />
          <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
        </SpecList>
      </DataPlateSection>,
    );
  }

  if (component.type === "redis") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const mode = parsed.data.mode as "standalone" | "replicated";
    const tier = parsed.data.tier as keyof typeof redisTierModels;
    const ttlBand = parsed.data.ttlBand as keyof typeof redisTtlHitRateBands;
    const effective = redisEffectiveModel({ mode, tier });
    const placed = new Set(component.deployments.map((deployment) => deployment.regionId));

    const toggleRegion = (regionId: string, enabled: boolean) => {
      const next = new Set(placed);
      if (enabled) next.add(regionId);
      else next.delete(regionId);
      onDeploymentsChange(
        component.id,
        regions
          .filter((region) => next.has(region.id))
          .map((region) => createRegionDeployment(region.id, {}, `dep-${component.id}-${region.id}`)),
      );
    };

    return shell(
      "Redis inspector",
      <>
        <DataPlateSection title="Machine">
          <PlateField label="Tier">
            <select
              value={tier}
              onChange={(event) => onConfigChange(component.id, { mode, tier: event.target.value, ttlBand })}
            >
              {Object.keys(redisTierModels).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
          <div className="data-plate-inspector__region-block">
            <p className="data-plate-inspector__region-title">Regional placement</p>
            {regions.map((region) => (
              <label key={region.id} className="data-plate-inspector__checkbox">
                <input
                  type="checkbox"
                  checked={placed.has(region.id)}
                  onChange={(event) => toggleRegion(region.id, event.target.checked)}
                />
                {region.label}
              </label>
            ))}
            <PlateHint>
              Each checked region is an independent Redis cache. Replicated mode is local HA, not cross-region sync.
            </PlateHint>
          </div>
        </DataPlateSection>
        <DataPlateSection title="Behavior">
          <PlateField label="Mode">
            <select
              value={mode}
              onChange={(event) => onConfigChange(component.id, { mode: event.target.value, tier, ttlBand })}
            >
              <option value="standalone">standalone</option>
              <option value="replicated">replicated</option>
            </select>
          </PlateField>
          <PlateField label="TTL band">
            <select
              value={ttlBand}
              onChange={(event) => onConfigChange(component.id, { mode, tier, ttlBand: event.target.value })}
            >
              {Object.keys(redisTtlHitRateBands).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
          <SpecList>
            <SpecRow label="Configured hit rate" value={`${Math.round(redisHitRateForConfig({ ttlBand }) * 100)}%`} />
            <SpecRow label="Throughput capacity" value={`${effective.throughputRps.toLocaleString()} req/sec`} />
            <SpecRow label="Hot-key capacity" value={`${effective.hotKeyCapacityRps.toLocaleString()} req/sec`} />
            <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
          </SpecList>
        </DataPlateSection>
      </>,
    );
  }

  if (component.type === "global-router") {
    return shell(
      "Global Router inspector",
      <DataPlateSection title="Reference">
        <SpecList>
          <SpecRow label="Role" value="Logical request passthrough" />
          <SpecRow label="Geographic routing" value="Inactive" />
          <SpecRow label="Monthly cost" value={formatCost(0)} />
        </SpecList>
        <PlateHint>
          Forwards traffic without changing volume. Nearest healthy region routing activates when geography is enabled.
        </PlateHint>
      </DataPlateSection>,
    );
  }

  if (component.type === "load-balancer") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const policy = parsed.data.policy as (typeof loadBalancerPolicies)[number];

    return shell(
      "Load Balancer inspector",
      <>
        <DataPlateSection title="Behavior">
          <PlateField label="Policy">
            <select
              value={policy}
              onChange={(event) => onConfigChange(component.id, { policy: event.target.value })}
            >
              {loadBalancerPolicies.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
          <SpecList>
            <SpecRow label="Monthly cost" value={formatCost(loadBalancerMonthlyCost)} />
          </SpecList>
          <PlateHint>
            {policy === "equal"
              ? "Splits requests evenly across connected services."
              : "Splits requests by each service's configured capacity."}{" "}
            Failed backends are not excluded yet; health-aware redistribution comes with failure injection.
          </PlateHint>
        </DataPlateSection>
      </>,
    );
  }

  if (component.type === "cdn") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const coverage = parsed.data.coverage as number;
    const ttlBand = parsed.data.ttlBand as keyof typeof cdnTtlHitRateBands;
    const tier = parsed.data.tier as keyof typeof cdnTierModels;

    return shell(
      "CDN inspector",
      <>
        <DataPlateSection title="Machine">
          <PlateField label="Tier">
            <select
              value={tier}
              onChange={(event) => onConfigChange(component.id, { coverage, ttlBand, tier: event.target.value })}
            >
              {Object.keys(cdnTierModels).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
        </DataPlateSection>
        <DataPlateSection title="Behavior">
          <PlateField label="Coverage">
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={coverage}
              onChange={(event) =>
                onConfigChange(component.id, { coverage: Number(event.target.value), ttlBand, tier })
              }
            />
          </PlateField>
          <PlateField label="TTL band">
            <select
              value={ttlBand}
              onChange={(event) => onConfigChange(component.id, { coverage, ttlBand: event.target.value, tier })}
            >
              {Object.keys(cdnTtlHitRateBands).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PlateField>
          <SpecList>
            <SpecRow label="TTL hit rate" value={`${Math.round(cdnHitRateForConfig({ ttlBand }) * 100)}%`} />
            <SpecRow
              label="Configured hit intent"
              value={`${Math.round(cdnConfiguredHitIntent({ coverage, ttlBand, tier }) * 100)}%`}
            />
            <SpecRow
              label="Edge capacity"
              value={`${cdnThroughputCapacityForConfig({ tier }).toLocaleString()} req/sec`}
            />
            <SpecRow label="Base monthly cost" value={formatCost(cdnMonthlyCostForConfig({ tier }))} />
          </SpecList>
          <PlateHint>
            Reduces origin redirect traffic via cache hit/miss offload. Writes always miss and reach origin. Coverage is
            logical, not geographic.
          </PlateHint>
        </DataPlateSection>
      </>,
    );
  }

  return shell(
    "Traffic Source inspector",
    <DataPlateSection title="Reference">
      <SpecList>
        <SpecRow
          label="Workload"
          value={`${Math.round(challengeRedirectRps).toLocaleString("en-US")} redirects/sec · ${Math.round(challengeWriteRps).toLocaleString("en-US")} writes/sec`}
        />
        <SpecRow
          label="Geography"
          value="Origins from challenge geographic distribution; place capacity via component deployments"
        />
        <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
      </SpecList>
      <PlateHint>Traffic is configured by the challenge and cannot be edited here.</PlateHint>
    </DataPlateSection>,
  );
}
