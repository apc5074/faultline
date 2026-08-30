"use client";

import { useCallback, useState } from "react";

import {
  AGENT_HELP_CHIPS,
  buildPendingHelpRequest,
  isAgentHelpChipEnabled,
  type AgentHelpChipDefinition,
} from "./agent-help-templates";
import { useAgentSessionState, useAgentSessionStore } from "./AgentSessionProvider";

async function copyPromptToClipboard(prompt: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    return false;
  }
}

export function AgentHelpChips({ webMcpReady }: { webMcpReady: boolean }) {
  const sessionStore = useAgentSessionStore();
  const session = useAgentSessionState();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const onChipClick = useCallback(
    async (chip: AgentHelpChipDefinition) => {
      if (!isAgentHelpChipEnabled(chip, session.focus)) return;

      sessionStore.setPendingHelp(buildPendingHelpRequest(chip, session.focus, session.revision));

      const copied = await copyPromptToClipboard(chip.clipboardPrompt);
      setCopyState(copied ? "copied" : "failed");
      window.setTimeout(() => setCopyState("idle"), 2400);
    },
    [session.focus, session.revision, sessionStore],
  );

  const pendingLabel =
    session.pendingHelpRequest !== null
      ? AGENT_HELP_CHIPS.find((chip) => chip.id === session.pendingHelpRequest?.id)?.label ??
        "Agent help requested"
      : null;

  return (
    <div className="sim-bar__agent-help" role="group" aria-label="Agent help">
      <span className="sim-bar__agent-help-label">{webMcpReady ? "Ask ChatGPT" : "Prompt starters"}</span>
      {AGENT_HELP_CHIPS.map((chip) => {
        const enabled = isAgentHelpChipEnabled(chip, session.focus);
        return (
          <button
            key={chip.id}
            type="button"
            className="sim-bar__help-chip"
            disabled={!enabled}
            aria-disabled={!enabled}
            title={enabled ? chip.template : "Select a component first"}
            onClick={() => void onChipClick(chip)}
          >
            {chip.label}
          </button>
        );
      })}
      {!webMcpReady ? <span className="sim-bar__help-indicator">Live tool access unavailable; you can still copy a prompt.</span> : null}
      {copyState === "failed" ? (
        <textarea
          className="sim-bar__help-fallback"
          aria-label="Suggested ChatGPT prompt"
          readOnly
          value={AGENT_HELP_CHIPS.find((chip) => chip.id === session.pendingHelpRequest?.id)?.clipboardPrompt ?? "Select a prompt starter to copy its text."}
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : pendingLabel ? (
        <span className="sim-bar__help-indicator" aria-live="polite">
          {copyState === "copied" ? "Prompt copied — not sent" : pendingLabel}
        </span>
      ) : copyState === "copied" ? (
        <span className="sim-bar__help-indicator" aria-live="polite">
          Prompt copied — not sent
        </span>
      ) : null}
    </div>
  );
}
