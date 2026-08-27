"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Architecture } from "@faultline/core";

type ChatMessage = { role: "user" | "assistant"; content: string };
const suggestedPrompts = ["Interview me about this design", "What's the biggest risk?", "Where is my bottleneck?", "Where am I spending too much?", "What assumption should I test?"] as const;

export function AiEngineerPanel({
  architecture,
  onAttention,
  onShowOnCanvas,
}: {
  architecture: Architecture;
  onAttention?: (componentId: string | null) => void;
  onShowOnCanvas?: (componentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [challengeVersionId, setChallengeVersionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "error" | "limited">("idle");
  const [activity, setActivity] = useState<string | null>(null);
  const [referenceComponentId, setReferenceComponentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/challenges/active", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { challenge: { id: string } } : null)
      .then((body) => setChallengeVersionId(body?.challenge.id ?? null))
      .catch(() => setChallengeVersionId(null));
  }, [open]);

  async function submitPrompt(rawPrompt: string) {
    const content = rawPrompt.trim();
    if (!content || status === "streaming" || !challengeVersionId) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setPrompt(""); setActivity(null); onAttention?.(null); setStatus("streaming");
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ architecture, challengeVersionId, messages: nextMessages }) });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null) as { code?: string } | null;
        setMessages((current) => current.slice(0, -1));
        setStatus(body?.code === "ai_limit_reached" ? "limited" : "error"); return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ""; let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line) continue; const event = JSON.parse(line) as { type: string; delta?: string; label?: string; componentId?: string }; if (event.type === "activity") { setActivity(event.label ?? null); const componentId = event.componentId; const validId = componentId && architecture.components.some((component) => component.id === componentId) ? componentId : null; if (validId) setReferenceComponentId(validId); onAttention?.(validId); } if (event.type === "text") { answer += event.delta ?? ""; setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: answer }]); } } }
      setActivity(null); setStatus("idle");
    } catch { onAttention?.(null); setMessages((current) => current.slice(0, -1)); setStatus("error"); }
  }

  function onSubmit(event: FormEvent) { event.preventDefault(); void submitPrompt(prompt); }

  return <aside className="ai-engineer" aria-label="Built-in agent">
    <button type="button" className="ai-engineer__toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      Built-in agent (optional)
    </button>
    {open ? <div className="ai-engineer__body">
    <h2>AI Engineer</h2><p className="ai-engineer__intro">Ask me to review, question, or inspect your system.</p>
    {messages.length === 0 ? <div className="ai-engineer__suggestions" aria-label="Suggested AI prompts">{suggestedPrompts.map((suggestion) => <button key={suggestion} type="button" onClick={() => void submitPrompt(suggestion)} disabled={!challengeVersionId || status === "streaming"}>{suggestion}</button>)}</div> : null}
    <div className="ai-engineer__messages" aria-live="polite">{messages.map((message, index) => <p key={`${message.role}-${index}`} className={`ai-engineer__message ai-engineer__message--${message.role}`}>{message.content || "Inspecting system..."}</p>)}</div>
    {activity ? <p className="ai-engineer__activity" aria-live="polite">{activity}</p> : null}
    {referenceComponentId ? <div className="ai-engineer__reference"><span>Referenced: {referenceComponentId}</span><button type="button" onClick={() => onShowOnCanvas?.(referenceComponentId)}>Show on canvas</button><button type="button" onClick={() => { setReferenceComponentId(null); onAttention?.(null); }}>Dismiss</button></div> : null}
    {status === "error" ? <p className="ai-engineer__notice">AI Engineer is temporarily unavailable. You can keep building and running tests normally.</p> : null}
    {status === "limited" ? <p className="ai-engineer__notice">Today's AI Engineer limit has been reached. You can keep building and running tests normally.</p> : null}
    <form onSubmit={onSubmit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={challengeVersionId ? "Ask about this design" : "AI Engineer is connecting..."} disabled={!challengeVersionId || status === "streaming"} rows={3} /><button type="submit" disabled={!prompt.trim() || !challengeVersionId || status === "streaming"}>{status === "streaming" ? "Reviewing…" : "Ask AI Engineer"}</button></form>
    </div> : null}
  </aside>;
}
