import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.window = { localStorage: new MemoryStorage() };

const { createDesignInterviewV2HostService } = await import("../features/agent-session/interview-v2-host-service.ts");

const starterOnly = {
  challenge: { slug: "url-shortener", version: 3, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 120000, readRatio: 0.95, writeRatio: 0.05 }, requirements: [], monthlyBudget: 1000, allowedComponentTypes: ["traffic-source", "service", "postgres", "redis"] },
  architecture: {
    version: 1,
    components: [
      { id: "traffic-source-start", type: "traffic-source", config: { label: "users" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-start", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 1, y: 0 } },
      { id: "postgres-start", type: "postgres", config: { size: "small", storageGb: 20 }, deployments: [], ui: { x: 2, y: 0 } },
    ],
    connections: [
      { id: "c1", sourceComponentId: "traffic-source-start", sourcePortId: "request_out", targetComponentId: "service-start", targetPortId: "request_in", type: "request" },
      { id: "c2", sourceComponentId: "service-start", sourcePortId: "db_out", targetComponentId: "postgres-start", targetPortId: "db_in", type: "read_write" },
    ],
  },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "2026-09-02T00:00:00.000Z" },
  simulation: {
    available: true,
    components: {},
    workloadPaths: {
      redirects: {
        channelId: "redirects",
        paths: [{ pathId: "path-1", componentIds: ["traffic-source-start", "service-start", "postgres-start"], connectionIds: ["c1", "c2"], status: "complete" }],
        inactiveComponentIds: [],
      },
    },
  },
};

const service = createDesignInterviewV2HostService("v2-host-owner");
assert.throws(() => service.start(starterOnly), (error) => error?.code === "PREPARATION_REQUIRED");

const provider = readFileSync(new URL("../features/agent-session/AgentSessionProvider.tsx", import.meta.url), "utf8");
assert.match(provider, /createDesignInterviewV2HostService/);
assert.equal(provider.includes("createDesignInterviewService("), false);

const panel = readFileSync(new URL("../features/agent-session/InterviewV2StatusPanel.tsx", import.meta.url), "utf8");
assert.match(panel, /Question \{ordinal\} of \{totalQuestions\}/);
assert.match(panel, /not an official submission/);

const host = readFileSync(new URL("../features/agent-session/interview-v2-host-service.ts", import.meta.url), "utf8");
assert.match(host, /liveTargetPresentationCue/);
assert.match(host, /kind === "live_failure"/);
assert.match(host, /componentIds: question\.targetComponentId \? \[question\.targetComponentId\] : \[\]/);
assert.match(host, /reason: question\.kind === "live_failure" \? "error-location"/);
assert.doesNotMatch(host, /Make one or two supported recovery edits on the canvas/);

const canvas = readFileSync(new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url), "utf8");
assert.match(canvas, /InterviewLiveSpotlightBridge/);

console.log("verify-interview-v2-host-service: ok");
