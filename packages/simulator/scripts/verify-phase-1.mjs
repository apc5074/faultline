import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { tinyApiChallenge } from "@faultline/challenges";
import {
  componentRegistry,
  createComponentRegistry,
  postgresDefinition,
  serviceCapacityForInstances,
  serviceDefinition,
  trafficSourceDefinition,
} from "@faultline/component-catalog";
import { parseArchitecture } from "@faultline/core";
import { estimateMonthlyCost, evaluateRequirements } from "../dist/index.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function architectureFor(instances, tier, positions = { traffic: { x: 0, y: 0 }, service: { x: 300, y: 0 }, postgres: { x: 600, y: 0 } }) {
  return {
    version: 1,
    components: [
      { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: positions.traffic },
      { id: "service-01", type: "service", config: { size: "medium", instances }, deployments: [], ui: positions.service },
      { id: "postgres-01", type: "postgres", config: { tier }, deployments: [], ui: positions.postgres },
    ],
    connections: [
      {
        id: "traffic-service",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-postgres",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

function evaluate(architecture) {
  return evaluateRequirements({
    architecture,
    challenge: tinyApiChallenge,
    registry: componentRegistry,
  });
}

function outcomeFingerprint(result) {
  assert.equal(result.valid, true);
  return JSON.stringify({
    traffic: result.traffic,
    services: result.services,
    postgres: result.postgres,
    p95LatencyMs: result.p95LatencyMs,
    headroom: result.headroom,
    throughputRatio: result.throughputRatio,
    cost: result.cost,
    requirements: result.requirements,
    allRequirementsPass: result.allRequirementsPass,
  });
}

function byId(result, id) {
  return result.requirements.find((requirement) => requirement.id === id);
}

console.log("Verification 2 — canonical architecture / UI-independent simulation");
{
  const left = evaluate(architectureFor(4, "medium"));
  const right = evaluate(
    architectureFor(4, "medium", {
      traffic: { x: 12, y: 90 },
      service: { x: -40, y: 220 },
      postgres: { x: 880, y: -15 },
    }),
  );
  assert.equal(outcomeFingerprint(left), outcomeFingerprint(right));
}

console.log("Verification 3 — serialization round-trip");
{
  const original = architectureFor(4, "medium", {
    traffic: { x: 10, y: 20 },
    service: { x: 310, y: 40 },
    postgres: { x: 610, y: 60 },
  });
  const serialized = JSON.stringify(original);
  const restored = parseArchitecture(JSON.parse(serialized));
  assert.equal(restored.components[0].id, "traffic-01");
  assert.deepEqual(restored.components[1].config, { size: "medium", instances: 4 });
  assert.equal(restored.connections.length, 2);
  assert.equal(restored.connections[0].sourcePortId, "request_out");
  assert.deepEqual(restored.components[2].ui, { x: 610, y: 60 });
  assert.equal(outcomeFingerprint(evaluate(original)), outcomeFingerprint(evaluate(restored)));
}

console.log("Verification 4 — invalid architecture feedback");
{
  const disconnected = {
    version: 1,
    components: architectureFor(4, "medium").components,
    connections: [],
  };
  const result = evaluate(disconnected);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "MISSING_REQUEST_PATH"));
  assert.ok(result.errors.every((error) => typeof error.message === "string" && error.message.length > 0));
}

console.log("Verification 5 — underprovisioned failure");
{
  const result = evaluate(architectureFor(2, "small"));
  assert.equal(result.valid, true);
  assert.equal(result.allRequirementsPass, false);
  assert.ok(
    !byId(result, "throughput").passed || !byId(result, "latency").passed || !byId(result, "headroom").passed,
  );
  assert.equal(result.services["service-01"].state, "saturated");
  assert.equal(result.postgres["postgres-01"].state, "saturated");
}

console.log("Verification 6 — borderline headroom failure");
{
  const result = evaluate(architectureFor(3, "medium"));
  assert.equal(result.valid, true);
  assert.equal(byId(result, "throughput").passed, true);
  assert.equal(byId(result, "headroom").passed, false);
  assert.equal(byId(result, "headroom").actual, 0);
  assert.ok(byId(result, "headroom").explanation.length > 0);
}

console.log("Verification 7 — known valid pass");
{
  const result = evaluate(architectureFor(4, "medium"));
  assert.equal(result.valid, true);
  assert.equal(result.allRequirementsPass, true);
  assert.deepEqual(
    result.requirements.map((requirement) => ({ id: requirement.id, passed: requirement.passed })),
    [
      { id: "throughput", passed: true },
      { id: "latency", passed: true },
      { id: "headroom", passed: true },
      { id: "budget", passed: true },
    ],
  );
  assert.equal(result.cost.monthlyTotal, 8_000);
}

console.log("Verification 8 — budget failure with performance pass");
{
  const result = evaluate(architectureFor(5, "medium"));
  assert.equal(result.valid, true);
  assert.equal(byId(result, "throughput").passed, true);
  assert.equal(byId(result, "latency").passed, true);
  assert.equal(byId(result, "headroom").passed, true);
  assert.equal(byId(result, "budget").passed, false);
  assert.equal(result.cost.monthlyTotal, 9_000);
  assert.ok(result.cost.monthlyTotal > tinyApiChallenge.monthlyBudget);
}

console.log("Verification 9 — determinism");
{
  const architecture = architectureFor(4, "medium");
  const fingerprints = Array.from({ length: 5 }, () => outcomeFingerprint(evaluate(architecture)));
  assert.ok(fingerprints.every((fingerprint) => fingerprint === fingerprints[0]));
}

console.log("Verification 10 — configuration reactivity");
{
  const four = architectureFor(4, "medium");
  const five = architectureFor(5, "medium");
  const small = architectureFor(4, "small");
  assert.equal(serviceCapacityForInstances(4), 8_000);
  assert.equal(serviceCapacityForInstances(5), 10_000);
  assert.equal(estimateMonthlyCost({ architecture: four, registry: componentRegistry }).monthlyTotal, 8_000);
  assert.equal(estimateMonthlyCost({ architecture: five, registry: componentRegistry }).monthlyTotal, 9_000);
  assert.notEqual(outcomeFingerprint(evaluate(four)), outcomeFingerprint(evaluate(five)));
  assert.notEqual(outcomeFingerprint(evaluate(four)), outcomeFingerprint(evaluate(small)));
}

console.log("Verification 11 — component registry integrity");
{
  assert.equal(componentRegistry.get("traffic-source"), trafficSourceDefinition);
  assert.equal(componentRegistry.get("service"), serviceDefinition);
  assert.equal(componentRegistry.get("postgres"), postgresDefinition);
  assert.ok(serviceDefinition.ports.length > 0);
  assert.ok(serviceDefinition.simulation);
  assert.ok(serviceDefinition.cost);
  assert.deepEqual(serviceDefinition.defaultConfig, { size: "medium", instances: 1 });

  const throwaway = {
    ...trafficSourceDefinition,
    type: "throwaway-dev-component",
    label: "Throwaway",
    defaultConfig: { label: "temp" },
  };
  const extended = createComponentRegistry([trafficSourceDefinition, serviceDefinition, postgresDefinition, throwaway]);
  assert.equal(extended.get("throwaway-dev-component").label, "Throwaway");
  assert.equal(componentRegistry.has("throwaway-dev-component"), false);
}

console.log("Verification 12 — package boundary review");
{
  const forbiddenCore = [/from ["']react["']/, /from ["']react-dom["']/, /@xyflow\/react/, /@supabase\//, /ai["']/, /webmcp/i];
  const forbiddenSimulator = [/from ["']react["']/, /from ["']react-dom["']/, /@xyflow\/react/, /@supabase\//, /ai["']/, /webmcp/i];

  function walk(directory) {
    const entries = [];
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) entries.push(...walk(path));
      else if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".mjs")) entries.push(path);
    }
    return entries;
  }

  for (const file of walk(join(root, "packages/core/src"))) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenCore) {
      assert.equal(pattern.test(source), false, `${relative(root, file)} violates core boundary: ${pattern}`);
    }
  }

  for (const file of walk(join(root, "packages/simulator/src"))) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenSimulator) {
      assert.equal(pattern.test(source), false, `${relative(root, file)} violates simulator boundary: ${pattern}`);
    }
  }

  const corePkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
  const simulatorPkg = JSON.parse(readFileSync(join(root, "packages/simulator/package.json"), "utf8"));
  assert.equal(corePkg.dependencies?.react, undefined);
  assert.equal(simulatorPkg.dependencies?.react, undefined);
  assert.ok(simulatorPkg.dependencies["@faultline/core"]);
  assert.ok(simulatorPkg.dependencies["@faultline/component-catalog"]);
}

console.log("phase 1 integration verified");
