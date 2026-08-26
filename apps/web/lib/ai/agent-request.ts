import type { Architecture } from "@faultline/core";
import { validateArchitecture } from "@faultline/core";
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
