import type { AgentContext, AgentSimulationEvidence } from "@faultline/agent-capabilities";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { validateArchitecture } from "@faultline/core";
import { evaluateRequirements, type RequirementsEvaluationResult } from "@faultline/simulator";
import type { ModelMessage } from "ai";

export const MAX_AGENT_CONTEXT_MESSAGES = 12;
const MAX_AGENT_SUBMITTED_MESSAGES = 24;
const MAX_AGENT_MESSAGE_CHARS = 4_000;

type AgentConversationMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

export interface AgentRequest {
  readonly architecture: Architecture;
  /** An opaque ID for a server-owned challenge_versions row, never challenge JSON. */
  readonly challengeVersionId: string;
  /** Recent plain-text user/assistant turns after central rolling-window reduction. */
  readonly messages: readonly ModelMessage[];
}

type AgentRequestParseResult =
  | { readonly success: true; readonly data: AgentRequest }
  | { readonly success: false; readonly error: string; readonly architectureErrors?: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keep only the newest plain-language exchange turns. Tool messages and hidden
 * reasoning are intentionally absent: fresh capabilities retrieve current truth
 * for every request.
 */
export function reduceAgentConversation(
  messages: readonly AgentConversationMessage[],
): readonly ModelMessage[] {
  return messages.slice(-MAX_AGENT_CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content }));
}

/**
 * Validate the public endpoint payload before any model or database work. At this
 * stage the endpoint accepts a bounded plain-text conversation. Older turns are
 * reduced centrally; current architecture truth is always rebuilt separately.
 */
export function parseAgentRequest(input: unknown): AgentRequestParseResult {
  if (!isRecord(input)) return { success: false, error: "Request body must be a JSON object." };

  const challengeVersionId = input.challengeVersionId;
  if (typeof challengeVersionId !== "string" || challengeVersionId.trim().length === 0) {
    return { success: false, error: "challengeVersionId is required." };
  }

  if (!("architecture" in input)) return { success: false, error: "architecture is required." };
  const architecture = validateArchitecture(input.architecture);
  if (!architecture.success) {
    return {
      success: false,
      error: "architecture is invalid.",
      architectureErrors: architecture.errors.map(({ path, message }) => `${path}: ${message}`),
    };
  }

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_AGENT_SUBMITTED_MESSAGES) {
    return { success: false, error: `messages must contain 1-${MAX_AGENT_SUBMITTED_MESSAGES} recent conversation turns.` };
  }

  const parsedMessages: AgentConversationMessage[] = [];
  for (const message of messages) {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return { success: false, error: "messages support only user or assistant text content." };
    }
    const content = message.content.trim();
    if (content.length === 0 || content.length > MAX_AGENT_MESSAGE_CHARS) {
      return { success: false, error: `message content must be 1-${MAX_AGENT_MESSAGE_CHARS} characters.` };
    }
    parsedMessages.push({ role: message.role, content });
  }
  if (parsedMessages.at(-1)?.role !== "user") {
    return { success: false, error: "The most recent message must be a user prompt." };
  }

  return {
    success: true,
    data: {
      architecture: architecture.data,
      challengeVersionId: challengeVersionId.trim(),
      messages: reduceAgentConversation(parsedMessages),
    },
  };
}

function numericMetrics(value: object): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [name, metric] of Object.entries(value)) {
    if (typeof metric === "number" && Number.isFinite(metric)) metrics[name] = metric;
  }
  return metrics;
}

function simulationEvidence(result: RequirementsEvaluationResult): AgentSimulationEvidence {
  if (!result.valid) {
    return { available: false, validationErrors: result.errors.map((error) => error.message) };
  }

  const components: Record<string, { metrics: Record<string, number>; state?: string }> = {};
  for (const [componentId, metrics] of Object.entries(result.services)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.postgres)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.caches)) {
    components[componentId] = { metrics: numericMetrics(metrics) };
  }

  const throughput = result.requirements.find((requirement) => requirement.type === "throughput");
  return {
    available: true,
    components,
    system: {
      redirectP95Ms: result.p95LatencyMs,
      throughputPass: throughput?.passed,
      minimumHeadroom: result.headroom,
    },
    scenarios: { hotKey: { active: result.hotKey.active, passed: result.hotKey.passed } },
  };
}

/** Build one immutable, simulator-grounded capability snapshot for an agent request. */
export function createAgentContext(architecture: Architecture, challenge: ChallengeDefinition): AgentContext {
  const result = evaluateRequirements({ architecture, challenge, registry: componentRegistry });
  return {
    challenge,
    architecture,
    simulation: simulationEvidence(result),
    ...(result.valid ? { cost: result.cost } : {}),
    user: { authenticated: false },
  };
}
