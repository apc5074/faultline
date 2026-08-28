"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Architecture, RegionId } from "@faultline/core";
import type { ExperimentResult } from "@faultline/core";
import type { CapabilityResult, ClearAnnotationsIntent, FocusRegionIntent, PinObservationIntent, PinnedObservation, VisualAnnotationIntent } from "@faultline/agent-capabilities";
import { publishVisualIntent } from "@faultline/webmcp";

import { useAgentSessionStore } from "@/features/agent-session/AgentSessionProvider";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";

type ChatMessage = { role: "user" | "assistant"; content: string };
const visualToolNames = new Set(["focus_component", "annotate_component", "highlight_connection", "clear_annotations"]);
const suggestedPrompts = ["Interview me about this design", "What's the biggest risk?", "Where is my bottleneck?", "Where am I spending too much?", "What assumption should I test?", "Try to break it"] as const;

export function AiEngineerPanel({
  architecture,
  onAttention,
  onShowOnCanvas,
  onShowRegionOnMap,
  onPinObservation,
  onExperimentResult,
}: {
  architecture: Architecture;
  onAttention?: (componentId: string | null) => void;
  onShowOnCanvas?: (componentId: string) => void;
  onShowRegionOnMap?: (regionId: RegionId) => void;
  onPinObservation?: (observation: PinnedObservation) => void;
  onExperimentResult?: (result: ExperimentResult) => void;
}) {
  const sessionStore = useAgentSessionStore();
  const onVisualIntent = createVisualCommandPublisher(sessionStore, {
    onFocusComponent: onShowOnCanvas,
    onFocusRegion: onShowRegionOnMap,
    onPinObservation,
  });
  const [open, setOpen] = useState(false);
  const [challengeVersionId, setChallengeVersionId] = useState<string | null>(null);
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);
  const [challengeRetryToken, setChallengeRetryToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "error" | "limited">("idle");
  const [activity, setActivity] = useState<string | null>(null);
  const [referenceComponentId, setReferenceComponentId] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setChallengeUnavailable(true);
      controller.abort();
    }, 8_000);
    setChallengeVersionId(null);
    setChallengeUnavailable(false);
    void fetch("/api/challenges/active", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("challenge unavailable");
        return (await response.json()) as { challenge?: { id?: string } };
      })
      .then((body) => {
        if (!body.challenge?.id) throw new Error("challenge unavailable");
        setChallengeVersionId(body.challenge.id);
      })
      .catch(() => {
        if (!controller.signal.aborted) setChallengeUnavailable(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, challengeRetryToken]);

  async function submitPrompt(rawPrompt: string) {
    const content = rawPrompt.trim();
    if (!content || status === "streaming" || !challengeVersionId) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setPrompt(""); setActivity(null); onAttention?.(null); setStatus("streaming");
    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ architecture, challengeVersionId, messages: nextMessages }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null) as { code?: string } | null;
        setMessages((current) => current.slice(0, -1));
        setStatus(body?.code === "ai_limit_reached" ? "limited" : "error"); return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ""; let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line) continue; const event = JSON.parse(line) as { type: string; delta?: string; label?: string; componentId?: string; result?: ExperimentResult; capabilityName?: string; input?: unknown; visualResult?: CapabilityResult<VisualAnnotationIntent | ClearAnnotationsIntent | FocusRegionIntent | PinObservationIntent> }; if (event.type === "activity") { setActivity(event.label ?? null); const componentId = event.componentId; const validId = componentId && architecture.components.some((component) => component.id === componentId) ? componentId : null; if (validId) setReferenceComponentId(validId); onAttention?.(validId); } if (event.type === "experiment-result" && event.result) onExperimentResult?.(event.result); if (event.type === "visual-intent" && event.capabilityName && event.visualResult && onVisualIntent) publishVisualIntent(event.capabilityName, event.input, event.visualResult, onVisualIntent); if (event.type === "text") { answer += event.delta ?? ""; setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: answer }]); } } }
      setActivity(null); setStatus("idle");
    } catch {
      onAttention?.(null); setActivity(null); setMessages((current) => current.slice(0, -1));
      setStatus(controller.signal.aborted ? "idle" : "error");
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
    }
  }

  function cancelRequest() {
    requestControllerRef.current?.abort();
  }

  function onSubmit(event: FormEvent) { event.preventDefault(); void submitPrompt(prompt); }

  return <aside className="ai-engineer" aria-label="Built-in agent">
    <button type="button" className="ai-engineer__toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      Built-in agent (optional)
    </button>
    {open ? <div className="ai-engineer__body">
    <h2>AI Engineer</h2><p className="ai-engineer__intro">Reads simulator evidence, asks hard questions, and runs simulated tests. It never edits your architecture.</p>
    {challengeUnavailable ? <p className="ai-engineer__notice">AI Engineer is temporarily unavailable. You can keep building and running tests normally. <button type="button" onClick={() => setChallengeRetryToken((token) => token + 1)}>Retry</button></p> : null}
    {messages.length === 0 ? <div className="ai-engineer__suggestions" aria-label="Suggested AI prompts">{suggestedPrompts.map((suggestion) => <button key={suggestion} type="button" onClick={() => void submitPrompt(suggestion)} disabled={!challengeVersionId || status === "streaming"}>{suggestion}</button>)}</div> : null}
    <div className="ai-engineer__messages">{messages.map((message, index) => <p key={`${message.role}-${index}`} className={`ai-engineer__message ai-engineer__message--${message.role}`}>{message.content || "Inspecting system..."}</p>)}</div>
    {activity ? <p className="ai-engineer__activity">{activity}</p> : null}
    {referenceComponentId ? <div className="ai-engineer__reference"><span>Referenced: {referenceComponentId}</span><button type="button" onClick={() => onShowOnCanvas?.(referenceComponentId)}>Show on canvas</button><button type="button" onClick={() => { setReferenceComponentId(null); onAttention?.(null); }}>Dismiss</button></div> : null}
    {status === "error" ? <p className="ai-engineer__notice">AI Engineer is temporarily unavailable. You can keep building and running tests normally.</p> : null}
    {status === "limited" ? <p className="ai-engineer__notice">Today's AI Engineer limit has been reached. You can keep building and running tests normally.</p> : null}
    <form onSubmit={onSubmit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={challengeUnavailable ? "AI Engineer unavailable — keep building" : challengeVersionId ? "Ask about this design" : "Connecting to AI Engineer…"} disabled={!challengeVersionId || status === "streaming"} rows={3} /><button type="submit" disabled={!prompt.trim() || !challengeVersionId || status === "streaming"}>{status === "streaming" ? "Reviewing…" : "Ask AI Engineer"}</button>{status === "streaming" ? <button type="button" onClick={cancelRequest}>Cancel</button> : null}</form>
    </div> : null}
  </aside>;
}
