import {
  cdnConfiguredHitIntent,
  cdnThroughputCapacityForConfig,
  objectStorageModelForConfig,
  queueCapacityModelForConfig,
  type CdnConfig,
  type ObjectStorageConfig,
  type QueueConfig,
  type WorkerConfig,
  workerCapacityForConfig,
} from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition, ComponentInstance, WorkloadChannel } from "@faultline/core";

import type { SimulationEvent, TrafficPropagationInput } from "./traffic.js";

const PROCESSING_DEADLINE_MS = 5 * 60 * 1_000;
const SERVICE_BASE_LATENCY_MS = 20;
const OBJECT_STORAGE_BASE_LATENCY_MS = 35;

export interface Level2ChannelResult {
  channelId: string;
  requestedRps: number;
  acceptedRps: number;
  completedRps: number;
  handledRatio: number;
  bytesPerSecond: number;
  workUnitsPerSecond: number;
  p95LatencyMs: number;
}

export interface Level2QueueMetrics {
  componentId: string;
  arrivalWorkPerSecond: number;
  dequeueWorkPerSecond: number;
  queueDepth: number;
  queueCapacity: number;
  oldestJobAgeMs: number;
  backlogGrowthRate: number;
  overflowWorkPerSecond: number;
  utilization: number;
}

export interface Level2WorkerMetrics {
  componentId: string;
  receivedJobsPerSecond: number;
  completedWorkPerSecond: number;
  processingCapacity: number;
  processingUtilization: number;
  activeWork: number;
  processingDelayMs: number;
  unmetWorkPerSecond: number;
}

export interface Level2ObjectStorageMetrics {
  componentId: string;
  uploadThroughputBytesPerSecond: number;
  uploadCapacityBytesPerSecond: number;
  originReadThroughputBytesPerSecond: number;
  originReadCapacityBytesPerSecond: number;
  uploadUtilization: number;
  originReadUtilization: number;
  storedBytes: number;
  rejectedOrUnmetBytesPerSecond: number;
}

export interface Level2PlaybackMetrics {
  requestedStartsPerSecond: number;
  cdnHitStartsPerSecond: number;
  originReadStartsPerSecond: number;
  startupP95LatencyMs: number;
  originReadBytesPerSecond: number;
}

export interface Level2UploadSummary {
  acceptedRps: number;
  rejectedOrUnmetRps: number;
  p95LatencyMs: number;
  serviceDemandRps: number;
  objectWriteDemandBytesPerSecond: number;
}

export interface Level2ProcessingSummary {
  acceptedWorkPerSecond: number;
  completedWorkPerSecond: number;
  queueDepth: number;
  oldestJobAgeMs: number;
  deadlineCompletionRatio: number;
  deadlineMissRatio: number;
}

export interface Level2SimulationResult {
  channels: Readonly<Record<string, Level2ChannelResult>>;
  queues: Readonly<Record<string, Level2QueueMetrics>>;
  workers: Readonly<Record<string, Level2WorkerMetrics>>;
  objectStorage: Readonly<Record<string, Level2ObjectStorageMetrics>>;
  processingDeadlineMs: number;
  processingDeadlineCompletionRatio: number;
  upload: Level2UploadSummary;
  processing: Level2ProcessingSummary;
  playback: Level2PlaybackMetrics;
  events: readonly SimulationEvent[];
}

function findChannel(channels: readonly WorkloadChannel[], ids: readonly string[]): WorkloadChannel | undefined {
  return ids.map((id) => channels.find((entry) => entry.id === id)).find((entry): entry is WorkloadChannel => entry !== undefined);
}

function configFor<T>(component: ComponentInstance, input: TrafficPropagationInput): T | undefined {
  const parsed = input.registry.get(component.type).configSchema.safeParse(component.config);
  return parsed.success ? (parsed.data as T) : undefined;
}

function serviceCapacity(architecture: Architecture, input: TrafficPropagationInput): number {
  return architecture.components.filter((component) => component.type === "service").reduce((total, component) => {
    const config = configFor<{ size: string; instances: number }>(component, input);
    if (!config) return total;
    const model = (input.registry.get("service").simulation?.sizeModels as Record<string, { capacityPerInstance: number }>)[config.size];
    return total + (model?.capacityPerInstance ?? 0) * config.instances;
  }, 0);
}

function storageCapacity(architecture: Architecture, input: TrafficPropagationInput): { upload: number; originRead: number } {
  return architecture.components.filter((component) => component.type === "object-storage").reduce(
    (total, component) => {
      const config = configFor<ObjectStorageConfig>(component, input);
      if (!config) return total;
      const model = objectStorageModelForConfig(config);
      return { upload: total.upload + model.uploadCapacityBytesPerSecond, originRead: total.originRead + model.originReadCapacityBytesPerSecond };
    },
    { upload: 0, originRead: 0 },
  );
}

function cdnOnIngress(architecture: Architecture, componentId: string): boolean {
  const sources = architecture.components.filter((component) => component.type === "traffic-source").map((component) => component.id);
  const visited = new Set(sources);
  const pending = [...sources];
  while (pending.length > 0) {
    const current = pending.shift() as string;
    if (current === componentId) return true;
    if (architecture.components.find((component) => component.id === current)?.type === "service") continue;
    for (const edge of architecture.connections) {
      if (edge.type !== "request" || edge.sourceComponentId !== current || visited.has(edge.targetComponentId)) continue;
      visited.add(edge.targetComponentId);
      pending.push(edge.targetComponentId);
    }
  }
  return false;
}

function playbackMetrics(architecture: Architecture, input: TrafficPropagationInput, channel: WorkloadChannel): Level2PlaybackMetrics {
  const cdn = architecture.components.find((component) => component.type === "cdn" && cdnOnIngress(architecture, component.id));
  const config = cdn ? configFor<CdnConfig>(cdn, input) : undefined;
  const hit = config ? Math.min(channel.ratePerSecond * cdnConfiguredHitIntent(config), cdnThroughputCapacityForConfig(config)) : 0;
  const origin = Math.max(0, channel.ratePerSecond - hit);
  const originBytes = origin * (channel.bytesPerOperation ?? 0);
  const storage = storageCapacity(architecture, input);
  const utilization = storage.originRead > 0 ? originBytes / storage.originRead : origin > 0 ? 2 : 0;
  return {
    requestedStartsPerSecond: channel.ratePerSecond,
    cdnHitStartsPerSecond: hit,
    originReadStartsPerSecond: origin,
    startupP95LatencyMs: (hit > 0 ? SERVICE_BASE_LATENCY_MS : 0) + (origin > 0 ? OBJECT_STORAGE_BASE_LATENCY_MS * (1 + Math.max(0, utilization - 0.7) * 4) : 0) + (utilization > 1 ? 1_000 : 0),
    originReadBytesPerSecond: originBytes,
  };
}

/**
 * Evaluates named Level 2 workloads without changing the existing Level 1
 * request propagation. All values are derived from canonical architecture,
 * catalog config, and challenge channels.
 */
export function evaluateLevel2Workloads(input: TrafficPropagationInput): Level2SimulationResult | undefined {
  const channels = input.challenge.workloadChannels;
  if (!channels?.length) return undefined;
  const architecture = input.architecture as Architecture;
  const upload = findChannel(channels, ["upload"]);
  const processing = findChannel(channels, ["processing"]);
  const playbackChannel = findChannel(channels, ["playback-start", "playback_start"]);
  const serviceCap = serviceCapacity(architecture, input);
  const storage = storageCapacity(architecture, input);
  const uploadBytes = upload ? upload.ratePerSecond * (upload.bytesPerOperation ?? 0) : 0;
  const storageUploadCap = upload
    ? upload.bytesPerOperation && storage.upload > 0
      ? storage.upload / upload.bytesPerOperation
      : serviceCap
    : 0;
  const acceptedUpload = upload ? Math.min(upload.ratePerSecond, serviceCap, storageUploadCap) : 0;
  const results: Record<string, Level2ChannelResult> = {};
  const events: SimulationEvent[] = [];

  if (upload) {
    results[upload.id] = { channelId: upload.id, requestedRps: upload.ratePerSecond, acceptedRps: acceptedUpload, completedRps: acceptedUpload, handledRatio: acceptedUpload / upload.ratePerSecond, bytesPerSecond: uploadBytes, workUnitsPerSecond: 0, p95LatencyMs: SERVICE_BASE_LATENCY_MS + (acceptedUpload < upload.ratePerSecond ? 1_000 : 0) };
    events.push({ type: "workload_channel_evaluated", data: { channelId: upload.id, requestedRps: upload.ratePerSecond, acceptedRps: acceptedUpload, bytesPerSecond: uploadBytes } });
  }

  const queues = architecture.components.filter((component) => component.type === "queue");
  const workers = architecture.components.filter((component) => component.type === "worker");
  const workUnitsPerUpload = processing?.workUnitsPerOperation ?? 0;
  const processingRate = processing ? Math.min(processing.ratePerSecond, acceptedUpload) : 0;
  const arrivalWork = processingRate * workUnitsPerUpload;
  const queueConfigs = queues.map((component) => ({ component, config: configFor<QueueConfig>(component, input) })).filter((entry): entry is { component: ComponentInstance; config: QueueConfig } => entry.config !== undefined);
  const workerCapacity = workers.reduce((total, component) => {
    const config = configFor<WorkerConfig>(component, input);
    return config ? total + workerCapacityForConfig(config) : total;
  }, 0);
  const enqueueCap = queueConfigs.reduce((total, entry) => total + queueCapacityModelForConfig(entry.config).enqueueCapacityWorkUnitsPerSecond, 0);
  const dequeueCap = queueConfigs.reduce((total, entry) => total + queueCapacityModelForConfig(entry.config).dequeueCapacityWorkUnitsPerSecond, 0);
  const acceptedWork = queueConfigs.length > 0 ? Math.min(arrivalWork, enqueueCap) : 0;
  const dequeuedWork = queueConfigs.length > 0 ? Math.min(acceptedWork, dequeueCap, workerCapacity) : 0;
  const backlogGrowth = Math.max(0, acceptedWork - dequeuedWork);
  const completedWork = Math.min(acceptedWork, dequeuedWork);
  const totalQueueCapacity = queueConfigs.reduce((total, entry) => total + queueCapacityModelForConfig(entry.config).capacityWorkUnits, 0);
  const queueDepth = Math.min(totalQueueCapacity, backlogGrowth * (PROCESSING_DEADLINE_MS / 1_000));
  const processingDelayMs = dequeuedWork > 0 ? (workUnitsPerUpload / dequeuedWork) * 1_000 : PROCESSING_DEADLINE_MS * 2;
  const deadlineRatio = arrivalWork <= 0 ? 1 : dequeuedWork >= arrivalWork && processingDelayMs <= PROCESSING_DEADLINE_MS ? 1 : completedWork / arrivalWork;
  const queueMetrics: Record<string, Level2QueueMetrics> = {};
  for (const entry of queueConfigs) {
    const model = queueCapacityModelForConfig(entry.config);
    const share = 1 / queueConfigs.length;
    const depth = queueDepth * share;
    queueMetrics[entry.component.id] = { componentId: entry.component.id, arrivalWorkPerSecond: arrivalWork * share, dequeueWorkPerSecond: dequeuedWork * share, queueDepth: depth, queueCapacity: model.capacityWorkUnits, oldestJobAgeMs: backlogGrowth > 0 ? Math.min(PROCESSING_DEADLINE_MS, depth / Math.max(dequeuedWork * share, 1) * 1_000) : 0, backlogGrowthRate: backlogGrowth * share, overflowWorkPerSecond: Math.max(0, arrivalWork - enqueueCap) * share, utilization: model.capacityWorkUnits > 0 ? depth / model.capacityWorkUnits : 0 };
    events.push({ type: "queue_depth_changed", componentId: entry.component.id, data: { queueDepth: depth, queueCapacity: model.capacityWorkUnits, oldestJobAgeMs: queueMetrics[entry.component.id].oldestJobAgeMs } });
  }
  const workerMetrics: Record<string, Level2WorkerMetrics> = {};
  for (const component of workers) {
    const config = configFor<WorkerConfig>(component, input);
    if (!config) continue;
    const capacity = workerCapacityForConfig(config);
    const completedShare = completedWork / Math.max(workers.length, 1);
    workerMetrics[component.id] = { componentId: component.id, receivedJobsPerSecond: processingRate / Math.max(workUnitsPerUpload, 1) / Math.max(workers.length, 1), completedWorkPerSecond: completedShare, processingCapacity: capacity, processingUtilization: completedShare / Math.max(capacity, 1), activeWork: Math.min(queueDepth, capacity * (PROCESSING_DEADLINE_MS / 1_000)), processingDelayMs, unmetWorkPerSecond: Math.max(0, arrivalWork - workerCapacity) / Math.max(workers.length, 1) };
    events.push({ type: "processing_work_completed", componentId: component.id, data: { completedWorkPerSecond: completedShare, processingCapacity: capacity, processingUtilization: workerMetrics[component.id].processingUtilization } });
  }
  if (processing) results[processing.id] = { channelId: processing.id, requestedRps: processing.ratePerSecond, acceptedRps: processingRate, completedRps: workUnitsPerUpload > 0 ? completedWork / workUnitsPerUpload : processingRate, handledRatio: arrivalWork > 0 ? completedWork / arrivalWork : 1, bytesPerSecond: 0, workUnitsPerSecond: arrivalWork, p95LatencyMs: processingDelayMs };

  const playback = playbackChannel ? playbackMetrics(architecture, input, playbackChannel) : { requestedStartsPerSecond: 0, cdnHitStartsPerSecond: 0, originReadStartsPerSecond: 0, startupP95LatencyMs: 0, originReadBytesPerSecond: 0 };
  if (playbackChannel) {
    results[playbackChannel.id] = { channelId: playbackChannel.id, requestedRps: playbackChannel.ratePerSecond, acceptedRps: playbackChannel.ratePerSecond, completedRps: playbackChannel.ratePerSecond, handledRatio: 1, bytesPerSecond: playback.originReadBytesPerSecond, workUnitsPerSecond: 0, p95LatencyMs: playback.startupP95LatencyMs };
    events.push({ type: "playback_path_evaluated", data: { requestedStartsPerSecond: playback.requestedStartsPerSecond, cdnHitStartsPerSecond: playback.cdnHitStartsPerSecond, originReadStartsPerSecond: playback.originReadStartsPerSecond, startupP95LatencyMs: playback.startupP95LatencyMs } });
  }
  const objectMetrics: Record<string, Level2ObjectStorageMetrics> = {};
  const outputBytes = acceptedUpload * (upload?.bytesPerOperation ?? 0) * 4;
  for (const component of architecture.components.filter((entry) => entry.type === "object-storage")) {
    const config = configFor<ObjectStorageConfig>(component, input);
    if (!config) continue;
    const model = objectStorageModelForConfig(config);
    const writeBytes = uploadBytes + outputBytes;
    objectMetrics[component.id] = { componentId: component.id, uploadThroughputBytesPerSecond: writeBytes, uploadCapacityBytesPerSecond: model.uploadCapacityBytesPerSecond, originReadThroughputBytesPerSecond: playback.originReadBytesPerSecond, originReadCapacityBytesPerSecond: model.originReadCapacityBytesPerSecond, uploadUtilization: writeBytes / Math.max(model.uploadCapacityBytesPerSecond, 1), originReadUtilization: playback.originReadBytesPerSecond / Math.max(model.originReadCapacityBytesPerSecond, 1), storedBytes: acceptedUpload * (upload?.bytesPerOperation ?? 0) * 30 * 24 * 60 * 60, rejectedOrUnmetBytesPerSecond: Math.max(0, writeBytes - model.uploadCapacityBytesPerSecond) };
    events.push({ type: "object_io_pressure", componentId: component.id, data: { uploadThroughputBytesPerSecond: writeBytes, originReadThroughputBytesPerSecond: playback.originReadBytesPerSecond, uploadUtilization: objectMetrics[component.id].uploadUtilization, originReadUtilization: objectMetrics[component.id].originReadUtilization } });
  }
  return {
    channels: results,
    queues: queueMetrics,
    workers: workerMetrics,
    objectStorage: objectMetrics,
    processingDeadlineMs: PROCESSING_DEADLINE_MS,
    processingDeadlineCompletionRatio: deadlineRatio,
    upload: {
      acceptedRps: acceptedUpload,
      rejectedOrUnmetRps: upload ? Math.max(0, upload.ratePerSecond - acceptedUpload) : 0,
      p95LatencyMs: upload ? results[upload.id].p95LatencyMs : 0,
      serviceDemandRps: acceptedUpload,
      objectWriteDemandBytesPerSecond: uploadBytes,
    },
    processing: {
      acceptedWorkPerSecond: acceptedWork,
      completedWorkPerSecond: completedWork,
      queueDepth,
      oldestJobAgeMs: Math.max(0, ...Object.values(queueMetrics).map((metric) => metric.oldestJobAgeMs)),
      deadlineCompletionRatio: deadlineRatio,
      deadlineMissRatio: Math.max(0, 1 - deadlineRatio),
    },
    playback,
    events,
  };
}
