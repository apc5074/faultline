"use client";

import {
  getLevelComponentCard,
} from "@faultline/challenges";
import type { LevelComponentCard } from "@faultline/challenges";
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
  objectStorageModelForConfig,
  objectStorageTierModels,
  objectStorageTiers,
  queueCapacityModels,
  queueCapacityTiers,
  queueMonthlyCostForConfig,
  workerCapacityForConfig,
  workerMonthlyCostForConfig,
  workerSizeModels,
  workerSizes,
} from "@faultline/component-catalog";
import {
  createRegionDeployment,
  getRegions,
  isValidRegion,
  type Architecture,
  type ChallengeDefinition,
  type ComponentDefinition,
  type ComponentInstance,
  type RegionDeployment,
  type RegionId,
} from "@faultline/core";
import {
  estimateMonthlyCost,
  type RequirementsEvaluationResult,
} from "@faultline/simulator";
import { useState, type ReactNode } from "react";

import {
  InspectorDataRow,
  InspectorSegControl,
  InspectorStepper,
} from "@/features/architecture-canvas/InspectorPlateControls";
import {
  approximateOriginTraffic,
  formatApproxRps,
} from "@/features/architecture-canvas/approximate-origin-traffic";
import { challengeRedirectRpsFor, challengeWriteRpsFor, usePlaygroundChallenge } from "@/features/architecture-canvas/playground-challenge";
import {
  buildWorkloadEvidencePanel,
  type WorkloadEvidencePanel,
} from "@/features/architecture-canvas/workload-evidence";
import {
  ComponentGlyph,
  glyphPropsFromComponent,
} from "@/features/playground-glyphs";

type SuccessfulSimulation = Extract<
  RequirementsEvaluationResult,
  { valid: true }
>;

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
  onDeploymentsChange: (
    componentId: string,
    deployments: RegionDeployment[]
  ) => void;
};

function DataPlateShell({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
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
        <ComponentGlyph {...glyphProps} state="idle" width={40} height={40} />
      </div>
      <div className="data-plate-inspector__heading">
        {canRename ? (
          <input
            className="data-plate-inspector__rename"
            value={renameValue}
            aria-label="Component label"
            onChange={(event) => onRename(event.target.value)}
          />
        ) : (
          <input
            className="data-plate-inspector__rename"
            value={displayName}
            readOnly
            aria-label="Component label"
          />
        )}
        <span className="data-plate-inspector__type">{definition.label}</span>
      </div>
    </header>
  );
}

function DataPlateSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="data-plate-inspector__section">
      <h3 className="data-plate-inspector__section-title">{title}</h3>
      {children}
    </section>
  );
}

function SpecRow({ label, value }: { label: string; value: ReactNode }) {
  return <InspectorDataRow label={label} value={value} />;
}

function SpecList({ children }: { children: ReactNode }) {
  return <div className="inspector-plate__rows">{children}</div>;
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
      <span className="data-plate-inspector__field-label">{label}</span>
      {children}
    </label>
  );
}

function AboutThisPieceSection({ card }: { card: LevelComponentCard }) {
  return (
    <details className="data-plate-inspector__teaching">
      <summary className="data-plate-inspector__teaching-summary">
        About this piece
      </summary>
      <div className="data-plate-inspector__teaching-body">
        <p className="data-plate-inspector__teaching-why">
          <span className="data-plate-inspector__teaching-label">Role</span>
          {card.whyHere}
        </p>
        <p className="data-plate-inspector__teaching-intent">
          <span className="data-plate-inspector__teaching-label">
            Placement intent
          </span>
          {card.placementIntent}
        </p>
        <div className="data-plate-inspector__teaching-lists">
          <div>
            <p className="data-plate-inspector__teaching-label">Strengths</p>
            <ul>
              {card.pros.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="data-plate-inspector__teaching-label">Limits</p>
            <ul>
              {card.cons.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="data-plate-inspector__teaching-label">
              Common mistakes
            </p>
            <ul>
              {card.commonMistakes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        {card.costNotes ? (
          <p className="data-plate-inspector__teaching-cost">
            <span className="data-plate-inspector__teaching-label">Cost</span>
            {card.costNotes}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function WorkloadFitSection({
  panel,
  emptyMessage,
}: {
  panel: WorkloadEvidencePanel | null;
  emptyMessage: string | null;
}) {
  if (emptyMessage) {
    return (
      <DataPlateSection title="Workload fit">
        <p className="data-plate-inspector__live-empty">{emptyMessage}</p>
      </DataPlateSection>
    );
  }
  if (!panel) return null;

  return (
    <DataPlateSection title="Simulator evidence">
      <div className="inspector-plate__rows">
        {panel.rows.map((row) => (
          <InspectorDataRow
            key={row.label}
            label={row.label}
            value={row.value}
          />
        ))}
      </div>
      {panel.hint ? <PlateHint>{panel.hint}</PlateHint> : null}
    </DataPlateSection>
  );
}

function workloadPanelForComponent(
  component: ComponentInstance,
  challenge: ChallengeDefinition,
  simulation: SuccessfulSimulation | null,
  simulationStale: boolean,
  runComplete: boolean
): { panel: WorkloadEvidencePanel | null; emptyMessage: string | null } {
  if (!runComplete || !simulation) {
    return {
      panel: null,
      emptyMessage: "Run simulation to see placement evidence.",
    };
  }
  if (simulationStale) {
    return {
      panel: null,
      emptyMessage:
        "Architecture changed — run again for fresh placement evidence.",
    };
  }
  const panel = buildWorkloadEvidencePanel({
    component,
    challenge,
    caches: simulation.caches,
    services: simulation.services,
    postgres: simulation.postgres,
    traffic: simulation.traffic,
    level2: simulation.level2,
    workloadPaths: simulation.workloadPaths,
  });
  return { panel, emptyMessage: null };
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
      rows.push({
        label: "Incoming",
        value: formatRps(serviceMetrics.incomingRps),
      });
      rows.push({
        label: "Utilization",
        value: formatPercent(serviceMetrics.utilization),
      });
      rows.push({
        label: "Capacity",
        value: formatRps(serviceMetrics.capacityRps),
      });
    }

    if (postgresMetrics) {
      rows.push({ label: "Read", value: formatRps(postgresMetrics.readRps) });
      rows.push({ label: "Write", value: formatRps(postgresMetrics.writeRps) });
      rows.push({
        label: "Effective util",
        value: formatPercent(postgresMetrics.effectiveUtilization),
      });
    }

    if (cacheMetrics) {
      rows.push({
        label: "Hit rate",
        value: formatPercent(cacheMetrics.hitRate),
      });
      rows.push({ label: "Hits", value: formatRps(cacheMetrics.hitRps) });
      rows.push({ label: "Misses", value: formatRps(cacheMetrics.missRps) });
      rows.push({
        label: "Utilization",
        value: formatPercent(cacheMetrics.utilization),
      });
    }

    if (trafficMetrics && rows.length === 0) {
      rows.push({
        label: "Incoming",
        value: formatRps(trafficMetrics.incomingRps),
      });
      rows.push({
        label: "Outgoing",
        value: formatRps(trafficMetrics.outgoingRps),
      });
    }

    rows.push({
      label: "System p95",
      value: `${Math.round(simulation.p95LatencyMs)} ms`,
    });
  }

  const title =
    runComplete && simulation && !simulationStale
      ? "Last Run · simulator evidence"
      : "Last Run";

  return (
    <DataPlateSection title={title}>
      {emptyMessage ? (
        <p className="data-plate-inspector__live-empty">{emptyMessage}</p>
      ) : (
        <div className="inspector-plate__rows">
          {rows.map((row) => (
            <InspectorDataRow
              key={row.label}
              label={row.label}
              value={row.value}
            />
          ))}
        </div>
      )}
    </DataPlateSection>
  );
}

function AdvancedSection({ component }: { component: ComponentInstance }) {
  const [failureInjection, setFailureInjection] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <details className="data-plate-inspector__advanced">
      <summary className="data-plate-inspector__advanced-summary">
        Advanced
      </summary>
      <div className="data-plate-inspector__advanced-body">
        <label className="data-plate-inspector__checkbox">
          <input
            type="checkbox"
            checked={failureInjection}
            disabled
            onChange={(event) => setFailureInjection(event.target.checked)}
          />
          Failure injection (dev)
        </label>
        <pre className="data-plate-inspector__json">
          {JSON.stringify(component.config, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function EmptyInspector() {
  return (
    <DataPlateShell label="Component inspector">
      <p className="data-plate-inspector__empty">
        Select a component to inspect
      </p>
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
  const { challenge: activeChallenge } = usePlaygroundChallenge();
  const challengeRedirectRps = challengeRedirectRpsFor(activeChallenge);
  const challengeWriteRps = challengeWriteRpsFor(activeChallenge);
  if (!component) return <EmptyInspector />;

  const definition = componentRegistry.get(component.type);
  const cost = estimateMonthlyCost({
    architecture,
    registry: componentRegistry,
  });
  const monthlyCost =
    cost.lineItems.find((lineItem) => lineItem.componentId === component.id)
      ?.amount ?? 0;
  const regions = getRegions();

  const workloadFit = workloadPanelForComponent(
    component,
    activeChallenge,
    simulation,
    simulationStale,
    runComplete
  );
  const teachingCard = getLevelComponentCard(
    activeChallenge.slug,
    component.type
  );

  const shell = (label: string, body: ReactNode) => (
    <DataPlateShell label={label}>
      <DataPlateHeader
        component={component}
        definition={definition}
        displayName={definition.label}
        renameValue={
          component.type === "traffic-source"
            ? String((component.config as { label?: string }).label ?? "")
            : undefined
        }
        onRename={
          component.type === "traffic-source"
            ? (next) => onConfigChange(component.id, { label: next })
            : undefined
        }
      />
      {teachingCard ? <AboutThisPieceSection card={teachingCard} /> : null}
      {body}
      <LiveStrip
        component={component}
        simulation={simulation}
        simulationStale={simulationStale}
        runComplete={runComplete}
      />
      <WorkloadFitSection
        panel={workloadFit.panel}
        emptyMessage={workloadFit.emptyMessage}
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
        const deployment = component.deployments.find(
          (entry) => entry.regionId === region.id
        );
        const count = deployment ? Number(deployment.config.instances ?? 0) : 0;
        return [region.id, Number.isFinite(count) ? count : 0];
      })
    ) as Record<string, number>;

    const regionalSum = regions.reduce(
      (sum, region) => sum + (instancesByRegion[region.id] ?? 0),
      0
    );
    const homeRegionId =
      regions.find((region) => region.id === "us-east")?.id ?? regions[0]?.id;
    // Logical-only services (no deployments yet): show current total on the home region so
    // players adjust capacity per region instead of a global stepper.
    const displayByRegion =
      !regional && regionalSum === 0 && instances > 0 && homeRegionId
        ? ({ ...instancesByRegion, [homeRegionId]: instances } as Record<
            string,
            number
          >)
        : instancesByRegion;
    const totalInstances = regional
      ? Math.max(0, regionalSum)
      : Math.max(instances, regionalSum);

    const setRegionalInstances = (regionId: string, nextCount: number) => {
      const base =
        !regional && regionalSum === 0 && instances > 0 && homeRegionId
          ? ({ ...instancesByRegion, [homeRegionId]: instances } as Record<
              string,
              number
            >)
          : instancesByRegion;
      const nextCounts = {
        ...base,
        [regionId]: Math.max(0, Math.floor(nextCount)),
      };
      const sum = regions.reduce(
        (total, region) => total + (nextCounts[region.id] ?? 0),
        0
      );
      if (sum <= 0) {
        nextCounts[regionId] = 1;
      }
      const nextDeployments: RegionDeployment[] = regions
        .filter((region) => (nextCounts[region.id] ?? 0) > 0)
        .map((region) =>
          createRegionDeployment(
            region.id,
            { instances: nextCounts[region.id] },
            `dep-${component.id}-${region.id}`
          )
        );
      onDeploymentsChange(component.id, nextDeployments);
    };

    return shell(
      "Stateless Service inspector",
      <>
        <DataPlateSection title="Machine">
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="Size"
              value={size}
              options={
                Object.keys(
                  serviceSizeModels
                ) as (keyof typeof serviceSizeModels)[]
              }
              onChange={(next) =>
                onConfigChange(component.id, {
                  size: next,
                  instances: totalInstances,
                })
              }
            />
            <InspectorDataRow label="Total" value={totalInstances} />
          </div>
          <div className="data-plate-inspector__region-block">
            <p className="data-plate-inspector__region-title">
              Regional instances {regional ? "" : "(optional)"}
            </p>
            {regions.map((region) => (
              <InspectorStepper
                key={region.id}
                label={region.label}
                value={displayByRegion[region.id] ?? 0}
                min={0}
                max={10}
                onChange={(next) => setRegionalInstances(region.id, next)}
              />
            ))}
            <PlateHint>
              {regional
                ? "Total is the sum of regional instances. CDN absorbs at the edge; regions handle miss traffic."
                : "Keep this logical for a single-region design, or set capacity per region below."}
            </PlateHint>
          </div>
          <SpecList>
            <SpecRow
              label="Capacity / instance"
              value={`${sizeModel.capacityPerInstance.toLocaleString()} req/sec`}
            />
            <SpecRow
              label="Estimated capacity"
              value={`${serviceCapacityForConfig({
                size,
                instances: totalInstances,
              }).toLocaleString()} req/sec`}
            />
            <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
          </SpecList>
        </DataPlateSection>
      </>
    );
  }

  if (component.type === "postgres") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const tier = parsed.data.tier as keyof typeof postgresTierModels;
    const readReplicaCount = parsed.data.readReplicaCount as number;
    const model = postgresTierModels[tier];
    const primary = component.deployments.find(
      (deployment) => deployment.config.role === "primary"
    );
    const replicaRegionIds = new Set(
      component.deployments
        .filter((deployment) => deployment.config.role === "replica")
        .map((deployment) => deployment.regionId)
    );
    const primaryRegionId = primary?.regionId;
    const homeRegionId =
      regions.find((region) => region.id === "us-east")?.id ?? regions[0]?.id;
    // Logical-only: show home region as the implied primary so players place via the grid.
    const displayPrimaryId =
      primaryRegionId ??
      (!component.deployments.length ? homeRegionId : undefined);

    const applyPlacement = (
      nextPrimaryId: RegionId,
      nextReplicaIds: ReadonlySet<string>
    ) => {
      const replicas = regions
        .filter(
          (region) =>
            nextReplicaIds.has(region.id) && region.id !== nextPrimaryId
        )
        .slice(0, postgresReadReplicaBounds.maximum)
        .map((region) =>
          createRegionDeployment(
            region.id,
            { role: "replica" },
            `dep-${component.id}-${region.id}-replica`
          )
        );
      onDeploymentsChange(component.id, [
        createRegionDeployment(
          nextPrimaryId,
          { role: "primary" },
          `dep-${component.id}-${nextPrimaryId}-primary`
        ),
        ...replicas,
      ]);
    };

    const setPrimaryRegion = (regionId: string) => {
      if (!isValidRegion(regionId)) return;
      const nextReplicas = new Set(replicaRegionIds);
      nextReplicas.delete(regionId);
      applyPlacement(regionId, nextReplicas);
    };

    const toggleReplicaRegion = (regionId: string, enabled: boolean) => {
      if (!isValidRegion(regionId)) return;
      const nextPrimary = displayPrimaryId;
      if (!nextPrimary || !isValidRegion(nextPrimary)) return;
      if (regionId === nextPrimary) return;
      const nextReplicaIds = new Set(replicaRegionIds);
      if (enabled) {
        if (nextReplicaIds.size >= postgresReadReplicaBounds.maximum) return;
        nextReplicaIds.add(regionId);
      } else {
        nextReplicaIds.delete(regionId);
      }
      applyPlacement(nextPrimary, nextReplicaIds);
    };

    return shell(
      "Postgres inspector",
      <DataPlateSection title="Machine">
        <div className="inspector-plate__controls">
          <InspectorSegControl
            label="Tier"
            value={tier}
            options={
              Object.keys(
                postgresTierModels
              ) as (keyof typeof postgresTierModels)[]
            }
            onChange={(next) =>
              onConfigChange(component.id, { tier: next, readReplicaCount })
            }
          />
          <InspectorDataRow label="Total replicas" value={readReplicaCount} />
        </div>
        <div className="data-plate-inspector__region-block">
          <p className="data-plate-inspector__region-title">
            Regional placement
          </p>
          <div
            className="data-plate-inspector__role-grid"
            role="group"
            aria-label="Postgres primary and replica regions"
          >
            <div className="data-plate-inspector__role-col">
              <p className="data-plate-inspector__role-col-title">
                Primary zone (writes)
              </p>
              <ul className="data-plate-inspector__role-list">
                {regions.map((region) => (
                  <li key={`primary-${region.id}`}>
                    <label className="data-plate-inspector__bullet">
                      <input
                        type="radio"
                        name={`postgres-primary-${component.id}`}
                        checked={displayPrimaryId === region.id}
                        onChange={() => setPrimaryRegion(region.id)}
                      />
                      <span>{region.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="data-plate-inspector__role-col">
              <p className="data-plate-inspector__role-col-title">
                Replica regions (reads)
              </p>
              <ul className="data-plate-inspector__role-list">
                {regions.map((region) => {
                  const isPrimary = displayPrimaryId === region.id;
                  return (
                    <li key={`replica-${region.id}`}>
                      <label
                        className={`data-plate-inspector__bullet${
                          isPrimary ? " is-disabled" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            !isPrimary && replicaRegionIds.has(region.id)
                          }
                          disabled={isPrimary || !displayPrimaryId}
                          onChange={(event) =>
                            toggleReplicaRegion(region.id, event.target.checked)
                          }
                        />
                        <span>{region.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <PlateHint>
            One primary handles writes. Replicas add reads and must match the
            configured count; invalid placements are rejected with no
            auto-promotion.
          </PlateHint>
        </div>
        <SpecList>
          <SpecRow
            label="Read capacity"
            value={`${postgresReadCapacityForConfig({
              tier,
              readReplicaCount,
            }).toLocaleString()} req/sec`}
          />
          <SpecRow
            label="Write capacity"
            value={`${postgresWriteCapacityForConfig({
              tier,
            }).toLocaleString()} req/sec`}
          />
          <SpecRow
            label="Primary read"
            value={`${model.readCapacityRps.toLocaleString()} req/sec`}
          />
          <SpecRow
            label="Replica read pool"
            value={`${(
              model.replicaReadCapacityRps * readReplicaCount
            ).toLocaleString()} req/sec`}
          />
          <SpecRow
            label="Per replica read"
            value={`${model.replicaReadCapacityRps.toLocaleString()} req/sec`}
          />
          <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
        </SpecList>
      </DataPlateSection>
    );
  }

  if (component.type === "redis") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const mode = parsed.data.mode as "standalone" | "replicated";
    const tier = parsed.data.tier as keyof typeof redisTierModels;
    const ttlBand = parsed.data.ttlBand as keyof typeof redisTtlHitRateBands;
    const effective = redisEffectiveModel({ mode, tier });
    const placed = new Set(
      component.deployments.map((deployment) => deployment.regionId)
    );

    const toggleRegion = (regionId: string, enabled: boolean) => {
      const next = new Set(placed);
      if (enabled) next.add(regionId);
      else next.delete(regionId);
      onDeploymentsChange(
        component.id,
        regions
          .filter((region) => next.has(region.id))
          .map((region) =>
            createRegionDeployment(
              region.id,
              {},
              `dep-${component.id}-${region.id}`
            )
          )
      );
    };

    return shell(
      "Redis inspector",
      <>
        <DataPlateSection title="Machine">
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="Tier"
              value={tier}
              options={
                Object.keys(redisTierModels) as (keyof typeof redisTierModels)[]
              }
              onChange={(next) =>
                onConfigChange(component.id, { mode, tier: next, ttlBand })
              }
            />
          </div>
          <div className="data-plate-inspector__region-block">
            <p className="data-plate-inspector__region-title">
              Regional placement
            </p>
            {regions.map((region) => (
              <label key={region.id} className="data-plate-inspector__checkbox">
                <input
                  type="checkbox"
                  checked={placed.has(region.id)}
                  onChange={(event) =>
                    toggleRegion(region.id, event.target.checked)
                  }
                />
                {region.label}
              </label>
            ))}
            <PlateHint>
              Each checked region is an independent Redis cache. Replicated mode
              is local HA, not cross-region sync. Unchecked everywhere keeps the
              logical single-cache path.
            </PlateHint>
          </div>
        </DataPlateSection>
        <DataPlateSection title="Behavior">
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="Mode"
              value={mode}
              options={["standalone", "replicated"] as const}
              onChange={(next) =>
                onConfigChange(component.id, { mode: next, tier, ttlBand })
              }
            />
            <InspectorSegControl
              label="TTL band"
              value={ttlBand}
              options={
                Object.keys(
                  redisTtlHitRateBands
                ) as (keyof typeof redisTtlHitRateBands)[]
              }
              onChange={(next) =>
                onConfigChange(component.id, { mode, tier, ttlBand: next })
              }
            />
          </div>
          <SpecList>
            <SpecRow
              label="Configured hit rate"
              value={`${Math.round(redisHitRateForConfig({ ttlBand }) * 100)}%`}
            />
            <SpecRow
              label="Throughput capacity"
              value={`${effective.throughputRps.toLocaleString()} req/sec`}
            />
            <SpecRow
              label="Hot-key capacity"
              value={`${effective.hotKeyCapacityRps.toLocaleString()} req/sec`}
            />
            <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
          </SpecList>
        </DataPlateSection>
      </>
    );
  }

  if (component.type === "queue") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const capacityTier = parsed.data.capacityTier as keyof typeof queueCapacityModels;
    const model = queueCapacityModels[capacityTier];
    return shell(
      "Queue inspector",
      <>
        <DataPlateSection title="Buffer capacity">
          <InspectorSegControl
            label="Capacity tier"
            value={capacityTier}
            options={queueCapacityTiers}
            onChange={(next) => onConfigChange(component.id, { capacityTier: next })}
          />
          <SpecList>
            <SpecRow label="Queue capacity" value={`${model.capacityWorkUnits.toLocaleString()} work units`} />
            <SpecRow label="Enqueue capacity" value={`${model.enqueueCapacityWorkUnitsPerSecond.toLocaleString()} work units/sec`} />
            <SpecRow label="Dequeue capacity" value={`${model.dequeueCapacityWorkUnitsPerSecond.toLocaleString()} work units/sec`} />
            <SpecRow label="Monthly cost" value={formatCost(queueMonthlyCostForConfig({ capacityTier }))} />
          </SpecList>
          <PlateHint>A larger buffer buys time for a backlog; it does not create processing capacity.</PlateHint>
        </DataPlateSection>
      </>,
    );
  }

  if (component.type === "worker") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const size = parsed.data.size as keyof typeof workerSizeModels;
    const instances = parsed.data.instances as number;
    const model = workerSizeModels[size];
    return shell(
      "Worker inspector",
      <>
        <DataPlateSection title="Processing capacity">
          <div className="inspector-plate__controls">
            <InspectorSegControl label="Size" value={size} options={workerSizes} onChange={(next) => onConfigChange(component.id, { size: next, instances })} />
            <InspectorDataRow label="Instances" value={instances} />
          </div>
          <InspectorStepper label="Worker instances" value={instances} min={1} max={20} onChange={(next) => onConfigChange(component.id, { size, instances: next })} />
          <SpecList>
            <SpecRow label="Processing capacity" value={`${workerCapacityForConfig({ size, instances }).toLocaleString()} work units/sec`} />
            <SpecRow label="Source read capacity" value={`${(model.sourceReadCapacityBytesPerSecond * instances).toLocaleString()} bytes/sec`} />
            <SpecRow label="Monthly cost" value={formatCost(workerMonthlyCostForConfig({ size, instances }))} />
          </SpecList>
          <PlateHint>Workers drain queued processing work independently from user-facing Services.</PlateHint>
        </DataPlateSection>
      </>,
    );
  }

  if (component.type === "object-storage") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const tier = parsed.data.tier as keyof typeof objectStorageTierModels;
    const model = objectStorageModelForConfig({ tier });
    return shell(
      "Object Storage inspector",
      <DataPlateSection title="Storage tier">
        <InspectorSegControl label="Tier" value={tier} options={objectStorageTiers} onChange={(next) => onConfigChange(component.id, { tier: next })} />
        <SpecList>
          <SpecRow label="Upload capacity" value={`${model.uploadCapacityBytesPerSecond.toLocaleString()} bytes/sec`} />
          <SpecRow label="Origin read capacity" value={`${model.originReadCapacityBytesPerSecond.toLocaleString()} bytes/sec`} />
          <SpecRow label="Monthly base cost" value={formatCost(model.monthlyBaseCost)} />
        </SpecList>
        <PlateHint>Use Object Storage for large source and rendition bytes; Postgres remains the metadata store.</PlateHint>
      </DataPlateSection>,
    );
  }

  if (component.type === "global-router") {
    const hasRegionalServices =
      activeChallenge.geographicDistribution !== undefined &&
      architecture.components.some(
        (candidate) =>
          candidate.type === "service" && candidate.deployments.length > 0
      );
    return shell(
      "Global Router inspector",
      <DataPlateSection title="Reference">
        <SpecList>
          <SpecRow label="Role" value="Logical request passthrough" />
          <SpecRow
            label="Geographic routing"
            value={hasRegionalServices ? "Active" : "Inactive"}
          />
          <SpecRow label="Monthly cost" value={formatCost(0)} />
        </SpecList>
        <PlateHint>
          Needs regional Services to steer post-CDN miss traffic to the nearest
          healthy deployment. Otherwise it is a passthrough and does not change
          volume.
        </PlateHint>
      </DataPlateSection>
    );
  }

  if (component.type === "load-balancer") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const policy = parsed.data.policy as (typeof loadBalancerPolicies)[number];
    const upstreamCount = architecture.connections.filter(
      (connection) =>
        connection.sourceComponentId === component.id &&
        connection.type === "request"
    ).length;

    return shell(
      "Load Balancer inspector",
      <>
        <DataPlateSection title="Behavior">
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="Policy"
              value={policy}
              options={loadBalancerPolicies}
              formatOption={(option) =>
                option === "equal" ? "equal" : "weighted"
              }
              onChange={(next) =>
                onConfigChange(component.id, { policy: next })
              }
            />
          </div>
          <SpecList>
            <SpecRow
              label="Monthly cost"
              value={formatCost(loadBalancerMonthlyCost)}
            />
          </SpecList>
          <PlateHint>
            {policy === "equal"
              ? "Splits post-CDN miss traffic evenly across connected services."
              : "Splits post-CDN miss traffic by each service's configured capacity."}{" "}
            {upstreamCount <= 1
              ? "One connected Service gives the balancer no fan-out leverage."
              : "More connected Service pools create fan-out leverage."}{" "}
            Failure experiments provide simulated evidence; this inspector does
            not promise automatic repair.
          </PlateHint>
        </DataPlateSection>
      </>
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
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="Tier"
              value={tier}
              options={
                Object.keys(cdnTierModels) as (keyof typeof cdnTierModels)[]
              }
              onChange={(next) =>
                onConfigChange(component.id, { coverage, ttlBand, tier: next })
              }
            />
          </div>
        </DataPlateSection>
        <DataPlateSection title="Behavior">
          <div className="inspector-plate__controls">
            <InspectorSegControl
              label="TTL band"
              value={ttlBand}
              options={
                Object.keys(
                  cdnTtlHitRateBands
                ) as (keyof typeof cdnTtlHitRateBands)[]
              }
              onChange={(next) =>
                onConfigChange(component.id, { coverage, ttlBand: next, tier })
              }
            />
          </div>
          <PlateField label="Coverage">
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={coverage}
              onChange={(event) =>
                onConfigChange(component.id, {
                  coverage: Number(event.target.value),
                  ttlBand,
                  tier,
                })
              }
            />
          </PlateField>
          <SpecList>
            <SpecRow
              label="TTL hit rate"
              value={`${Math.round(cdnHitRateForConfig({ ttlBand }) * 100)}%`}
            />
            <SpecRow
              label="Configured hit intent"
              value={`${Math.round(
                cdnConfiguredHitIntent({ coverage, ttlBand, tier }) * 100
              )}%`}
            />
            <SpecRow
              label="Edge capacity"
              value={`${cdnThroughputCapacityForConfig({
                tier,
              }).toLocaleString()} req/sec`}
            />
            <SpecRow
              label="Base monthly cost"
              value={formatCost(cdnMonthlyCostForConfig({ tier }))}
            />
          </SpecList>
          <PlateHint>
            Reduces origin redirect traffic via cache hit/miss offload. Writes
            always miss and reach origin. Coverage is logical, not geographic.
          </PlateHint>
        </DataPlateSection>
      </>
    );
  }

  const originShares = approximateOriginTraffic({
    geographicDistribution: activeChallenge.geographicDistribution,
    totalRequestsPerSecond: activeChallenge.workload.requestsPerSecond,
  });

  return shell(
    "Traffic Source inspector",
    <>
      <DataPlateSection title="Expected origins">
        {originShares.length === 0 ? (
          <PlateHint>
            This challenge does not publish a geographic origin split.
          </PlateHint>
        ) : (
          <>
            <ul className="data-plate-inspector__origin-list">
              {originShares.map((origin) => (
                <li
                  key={origin.regionId}
                  className="data-plate-inspector__origin-row"
                >
                  <span className="data-plate-inspector__origin-label">
                    {origin.label}
                  </span>
                  <span className="data-plate-inspector__origin-meta tabular">
                    ~{origin.sharePct}% · {formatApproxRps(origin.approxRps)}
                  </span>
                </li>
              ))}
            </ul>
            <PlateHint>
              Approximate demand by region — not simulator evidence. After Run,
              world map arcs show the authoritative paths.
            </PlateHint>
          </>
        )}
      </DataPlateSection>
      <DataPlateSection title="Reference">
        <SpecList>
          <SpecRow
            label="Workload"
            value={`${Math.round(challengeRedirectRps).toLocaleString(
              "en-US"
            )} redirects/sec · ${Math.round(challengeWriteRps).toLocaleString(
              "en-US"
            )} writes/sec`}
          />
          <SpecRow label="Monthly cost" value={formatCost(monthlyCost)} />
        </SpecList>
      </DataPlateSection>
    </>
  );
}
