import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { resolveAgentDailyGuestLimitFromEnv } from "./usage-config";

export { AgentUsageConfigurationError, DEFAULT_AGENT_DAILY_GUEST_LIMIT } from "./usage-config";

export const AGENT_GUEST_COOKIE = "faultline_guest_id";

export class AgentUsageAccountingError extends Error {
  override name = "AgentUsageAccountingError";
}

export type AgentUsageOutcome = "completed" | "error" | "cancelled";

export function resolveAgentDailyGuestLimit(env: NodeJS.ProcessEnv = process.env): number {
  return resolveAgentDailyGuestLimitFromEnv(env);
}

export function isAgentGuestId(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createAgentGuestId(): string {
  return crypto.randomUUID();
}

export async function reserveAgentUsage(usageKey: string, dailyLimit = resolveAgentDailyGuestLimit()): Promise<{ reserved: boolean; usageDate: string }> {
  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new AgentUsageAccountingError(error instanceof Error ? error.message : "AI usage accounting is unavailable.");
  }
  const { data, error } = await service.rpc("reserve_agent_usage", {
    p_usage_key: usageKey,
    p_daily_limit: dailyLimit,
  });
  if (error || !data || typeof (data as { reserved?: unknown }).reserved !== "boolean" || typeof (data as { usage_date?: unknown }).usage_date !== "string") {
    throw new AgentUsageAccountingError(error?.message ?? "AI usage accounting is unavailable.");
  }
  const result = data as { reserved: boolean; usage_date: string };
  return { reserved: result.reserved, usageDate: result.usage_date };
}

export async function completeAgentUsage(input: {
  usageKey: string;
  usageDate: string;
  model: string;
  latencyMs: number;
  toolCalls: number;
  toolSteps: number;
  inputTokens?: number;
  outputTokens?: number;
  outcome: AgentUsageOutcome;
}): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("complete_agent_usage", {
    p_usage_key: input.usageKey,
    p_usage_date: input.usageDate,
    p_model: input.model,
    p_latency_ms: Math.max(0, Math.round(input.latencyMs)),
    p_tool_calls: Math.max(0, Math.round(input.toolCalls)),
    p_tool_steps: Math.max(0, Math.round(input.toolSteps)),
    p_input_tokens: input.inputTokens ?? 0,
    p_output_tokens: input.outputTokens ?? 0,
    p_outcome: input.outcome,
  });
  if (error) throw new AgentUsageAccountingError(error.message);
}
