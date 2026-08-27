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

export function AgentHelpChips({ selectedComponentId }: { selectedComponentId: string | null }) {
  const sessionStore = useAgentSessionStore();
  const session = useAgentSessionState();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const onChipClick = useCallback(
    async (chip: AgentHelpChipDefinition) => {
      if (!isAgentHelpChipEnabled(chip, selectedComponentId)) return;

      if (chip.requiresSelection && selectedComponentId) {
        sessionStore.setFocus({
          kind: "component",
          componentId: selectedComponentId,
          source: "help",
        });
      }

      sessionStore.setPendingHelp(buildPendingHelpRequest(chip, selectedComponentId));

      const copied = await copyPromptToClipboard(chip.clipboardPrompt);
      setCopyState(copied ? "copied" : "failed");
      window.setTimeout(() => setCopyState("idle"), 2400);
    },
    [selectedComponentId, sessionStore],
  );

  const pendingLabel =
    session.pendingHelpRequest !== null
      ? AGENT_HELP_CHIPS.find((chip) => chip.id === session.pendingHelpRequest?.id)?.label ??
        "Agent help requested"
      : null;

  return (
    <div className="sim-bar__agent-help" role="group" aria-label="Agent help">
      <span className="sim-bar__agent-help-label">Agent</span>
      {AGENT_HELP_CHIPS.map((chip) => {
        const enabled = isAgentHelpChipEnabled(chip, selectedComponentId);
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
      {pendingLabel ? (
        <span className="sim-bar__help-indicator" aria-live="polite">
          {copyState === "copied" ? "Prompt copied" : copyState === "failed" ? "Help requested" : pendingLabel}
        </span>
      ) : copyState === "copied" ? (
        <span className="sim-bar__help-indicator" aria-live="polite">
          Prompt copied
        </span>
      ) : null}
    </div>
  );
}
