import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { NextResponse } from "next/server";

import { parseAgentRequest } from "@/lib/ai/agent-request";
import { createAgentContext } from "@/lib/agent-context/create-agent-context";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";
import { streamFaultlineGatewayAgent } from "@/lib/ai/stream-agent";
import { resolveAgentModelId } from "@/lib/ai/model";
import { AGENT_GUEST_COOKIE, completeAgentUsage, createAgentGuestId, isAgentGuestId, reserveAgentUsage, resolveAgentNetworkUsageKey } from "@/lib/ai/usage";
import { ActiveDailyChallengeError, getActiveDailyChallenge } from "@/lib/challenges/daily";

export const dynamic = "force-dynamic";

const MAX_AGENT_REQUEST_BYTES = 64_000;
const encoder = new TextEncoder();
const visualToolNames = new Set(["focus_component", "annotate_component", "highlight_connection", "clear_annotations"]);

function activityLabel(toolName: string, input: unknown): { label: string; componentId?: string } | null {
  if (toolName === "get_architecture") return { label: "Inspecting architecture…" };
  if (toolName === "get_metrics") return { label: "Checking system metrics…" };
  if (toolName === "estimate_capacity") return { label: "Checking capacity…" };
  if (toolName === "get_cost_breakdown") return { label: "Reviewing cost…" };
  if (toolName === "get_requirements") return { label: "Reviewing requirements…" };
  if (toolName === "inspect_component" && typeof input === "object" && input && typeof (input as { componentId?: unknown }).componentId === "string") { const componentId = (input as { componentId: string }).componentId; return { label: `Inspecting ${componentId}…`, componentId }; }
  if (toolName === "inspect_cache") return { label: "Inspecting cache…" };
  if (toolName === "inspect_replication") return { label: "Inspecting replication…" };
  if (toolName === "inspect_regional_traffic") return { label: "Inspecting regional traffic…" };
  if (toolName === "trace_request") return { label: "Tracing a simulator request path…" };
  if (toolName === "inspect_bottlenecks") return { label: "Ranking simulator bottlenecks…" };
  if (["run_load_test", "change_traffic_pattern", "flush_cache", "inject_component_failure", "inject_region_failure"].includes(toolName)) return { label: "Running simulated experiment…" };
  return null;
}

function agentEventResponse(stream: AsyncIterable<unknown>): Response {
  const body = new ReadableStream<Uint8Array>({ async start(controller) {
    try { for await (const part of stream) {
      const event = part as { type?: string; textDelta?: string; toolName?: string; input?: unknown; output?: unknown };
      if (event.type === "text-delta") controller.enqueue(encoder.encode(`${JSON.stringify({ type: "text", delta: event.textDelta ?? "" })}\n`));
      if (event.type === "tool-call" && event.toolName) { const activity = activityLabel(event.toolName, event.input); if (activity) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "activity", ...activity })}\n`)); }
      if (event.type === "tool-result" && event.toolName && visualToolNames.has(event.toolName)) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "visual-intent", capabilityName: event.toolName, input: event.input, visualResult: event.output })}\n`));
      }
      if (event.type === "tool-result" && event.toolName && ["run_load_test", "change_traffic_pattern", "flush_cache", "inject_component_failure", "inject_region_failure"].includes(event.toolName)) {
        const output = event.output as { ok?: boolean; data?: { simulated?: boolean } } | undefined;
        if (output?.ok === true && output.data?.simulated === true) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "experiment-result", result: output.data })}\n`));
      }
    } controller.close(); } catch { controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error" })}\n`)); controller.close(); }
  }});
  return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}

function unavailableResponse(): Response {
  return Response.json(
    {
      ok: false,
      code: "ai_unavailable",
      error: "AI Engineer is temporarily unavailable. You can keep building and running tests normally.",
    },
    { status: 503 },
  );
}

function withGuestCookie(response: Response, guestId: string, shouldSet: boolean): Response {
  if (!shouldSet) return response;
  const next = new NextResponse(response.body, { status: response.status, headers: response.headers });
  next.cookies.set(AGENT_GUEST_COOKIE, guestId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return next;
}

/**
 * Guest-accessible, read-only AI Engineer endpoint. The browser supplies only its
 * unsaved architecture and an opaque challenge version reference; all truth comes
 * from the trusted challenge row and the shared deterministic simulator.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFaultlineAiEnabled()) {
    return Response.json(
      {
        ok: false,
        code: "ai_disabled",
        error: "AI Engineer is disabled on this deployment.",
      },
      { status: 503 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_AGENT_REQUEST_BYTES) {
    return Response.json({ ok: false, code: "payload_too_large", error: "AI request is too large." }, { status: 413 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return Response.json({ ok: false, code: "invalid_request", error: "Could not read AI request." }, { status: 400 });
  }
  if (text.length > MAX_AGENT_REQUEST_BYTES) {
    return Response.json({ ok: false, code: "payload_too_large", error: "AI request is too large." }, { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = text.length === 0 ? null : JSON.parse(text);
  } catch {
    return Response.json({ ok: false, code: "invalid_request", error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseAgentRequest(parsedBody);
  if (!parsed.success) {
    return Response.json(
      { ok: false, code: "invalid_request", error: parsed.error, ...(parsed.architectureErrors ? { details: parsed.architectureErrors } : {}) },
      { status: 400 },
    );
  }

  try {
    const activeChallenge = await getActiveDailyChallenge();
    if (activeChallenge.challengeVersion.id !== parsed.data.challengeVersionId) {
      return Response.json(
        { ok: false, code: "challenge_mismatch", error: "The requested challenge is no longer active. Refresh and try again." },
        { status: 409 },
      );
    }
    const context = createAgentContext(parsed.data.architecture, activeChallenge.challengeVersion.config);
    const requestCookies = request.headers.get("cookie") ?? "";
    const existingGuestId = requestCookies.match(new RegExp(`(?:^|;\\s*)${AGENT_GUEST_COOKIE}=([^;]+)`))?.[1];
    const guestId = isAgentGuestId(existingGuestId) ? existingGuestId : createAgentGuestId();
    const shouldSetGuestCookie = guestId !== existingGuestId;
    const modelId = resolveAgentModelId();
    const reservation = await reserveAgentUsage({
      guestKey: guestId,
      networkKey: resolveAgentNetworkUsageKey(request.headers),
    });
    if (!reservation.reserved) {
      return withGuestCookie(Response.json({ ok: false, code: "ai_limit_reached", error: "Today's AI Engineer limit has been reached. You can keep building and running tests normally." }, { status: 429 }), guestId, shouldSetGuestCookie);
    }

    const startedAt = Date.now();
    let finalized = false;
    const finalize = async (outcome: "completed" | "error" | "cancelled", details: { toolCalls?: number; toolSteps?: number; inputTokens?: number; outputTokens?: number } = {}) => {
      if (finalized) return;
      finalized = true;
      try {
        await completeAgentUsage({ usageKey: guestId, usageDate: reservation.usageDate, model: modelId, latencyMs: Date.now() - startedAt, outcome, toolCalls: details.toolCalls ?? 0, toolSteps: details.toolSteps ?? 0, inputTokens: details.inputTokens, outputTokens: details.outputTokens });
      } catch {
        // The reservation was authoritative. Completion telemetry must not disrupt the stream.
      }
    };
    try {
      const result = streamFaultlineGatewayAgent({
        messages: parsed.data.messages,
        registry: createDefaultCapabilityRegistry(),
        context,
        abortSignal: request.signal,
        onEnd: (event) => finalize("completed", { toolCalls: event.toolCalls.length, toolSteps: event.steps.length, inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens }),
        onError: () => finalize("error"),
        onAbort: (event) => finalize("cancelled", { toolCalls: event.steps.reduce((total, step) => total + (step.toolCalls?.length ?? 0), 0), toolSteps: event.steps.length }),
      });
      return withGuestCookie(agentEventResponse(result.fullStream), guestId, shouldSetGuestCookie);
    } catch {
      await finalize("error");
      return withGuestCookie(unavailableResponse(), guestId, shouldSetGuestCookie);
    }
  } catch (error) {
    // Challenge/configuration/provider setup failures must never affect the canvas or simulator.
    if (error instanceof ActiveDailyChallengeError || error instanceof Error) return unavailableResponse();
    return unavailableResponse();
  }
}
