"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  activeChallenge,
  challengeHotKeyLabel,
  challengeReadWriteRatioLabel,
  challengeRedirectRps,
  challengeWriteRps,
} from "@/features/architecture-canvas/playground-challenge";

const BRIEFING_SESSION_KEY = "faultline.level1.briefing.seen";

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function formatBudget(usd: number): string {
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}k`;
  return `$${usd}`;
}

function formatRequirementTarget(type: string, target: number, unit: string): string {
  if (type === "latency") return `< ${target}${unit}`;
  if (type === "headroom") return `≥ ${Math.round(target * 100)}%`;
  if (type === "budget") return `≤ ${formatBudget(target)}/mo`;
  if (type === "throughput") return "Handle peak load";
  return `${target} ${unit}`;
}

const REQUIREMENT_HELP: Record<string, string> = {
  latency:
    "How fast redirects feel for nearly all users. Under this limit means most people reach the destination quickly.",
  headroom:
    "How much unused capacity you still have at peak. Extra room means a traffic spike is less likely to overload you.",
  budget:
    "What your whole design costs per month. You pass if the total stays at or under this amount.",
};

function RequirementHelp({ explanation }: { explanation: string }) {
  return (
    <span className="level-briefing__help">
      <button
        type="button"
        className="level-briefing__help-btn"
        aria-label="What this requirement means"
      >
        ?
      </button>
      <span role="tooltip" className="level-briefing__help-tip">
        {explanation}
      </span>
    </span>
  );
}

function RequirementRow({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <li>
      <span className="level-briefing__target-label">
        {label}
        <RequirementHelp explanation={help} />
      </span>
      <span className="level-briefing__target-value tabular">{value}</span>
    </li>
  );
}

type LevelBriefingProps = {
  open: boolean;
  onClose: () => void;
};

export function LevelBriefing({ open, onClose }: LevelBriefingProps) {
  const titleId = useId();
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const latency = activeChallenge.requirements.find((requirement) => requirement.id === "latency");
  const headroom = activeChallenge.requirements.find((requirement) => requirement.id === "headroom");
  const budget = activeChallenge.requirements.find((requirement) => requirement.id === "budget");

  useEffect(() => {
    if (!open) return;
    startButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="level-briefing" role="presentation" onMouseDown={onClose}>
      <section
        className="level-briefing__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="level-briefing__header">
          <div>
            <p className="level-briefing__eyebrow">Level 1 · Briefing</p>
            <h2 id={titleId}>{activeChallenge.title}</h2>
          </div>
          <button
            className="level-briefing__close"
            type="button"
            onClick={onClose}
            aria-label="Close briefing"
          >
            ×
          </button>
        </header>

        <div className="level-briefing__body">
          <p className="level-briefing__scenario">
            You&apos;re shipping <em>Shortline</em> — a link shortener used worldwide.
            Most traffic is redirects. A single viral link can dominate reads.
            Design the infrastructure so it stays fast, has spare capacity, and
            fits the budget.
          </p>

          <dl className="level-briefing__traffic">
            <div>
              <dt>Redirects</dt>
              <dd>{formatCompactCount(challengeRedirectRps)}/s</dd>
            </div>
            <div>
              <dt>New links</dt>
              <dd>{formatCompactCount(challengeWriteRps)}/s</dd>
            </div>
            <div>
              <dt>Mix</dt>
              <dd>{challengeReadWriteRatioLabel} reads</dd>
            </div>
            <div>
              <dt>Spike</dt>
              <dd>{challengeHotKeyLabel}</dd>
            </div>
          </dl>

          <p className="level-briefing__section-label">Pass when</p>
          <ul className="level-briefing__targets">
            {latency ? (
              <RequirementRow
                label={latency.label}
                value={formatRequirementTarget(latency.type, latency.target, latency.unit)}
                help={REQUIREMENT_HELP.latency}
              />
            ) : null}
            {headroom ? (
              <RequirementRow
                label={headroom.label}
                value={formatRequirementTarget(headroom.type, headroom.target, headroom.unit)}
                help={REQUIREMENT_HELP.headroom}
              />
            ) : null}
            {budget ? (
              <RequirementRow
                label="Monthly budget"
                value={formatRequirementTarget(budget.type, budget.target, budget.unit)}
                help={REQUIREMENT_HELP.budget}
              />
            ) : null}
          </ul>

          <p className="level-briefing__hint">
            Drag components onto the canvas, connect ports, then Run. The simulator
            decides pass or fail — not the AI.
          </p>
        </div>

        <footer className="level-briefing__footer">
          <button
            ref={startButtonRef}
            className="level-briefing__start"
            type="button"
            onClick={onClose}
          >
            Start designing <span aria-hidden="true">→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

export function useLevelBriefing() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceBrief = searchParams.get("brief") === "1";

  const stripBriefParam = useCallback(() => {
    if (!forceBrief) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("brief");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [forceBrief, pathname, router, searchParams]);

  useEffect(() => {
    if (forceBrief) {
      setOpen(true);
      return;
    }
    try {
      if (sessionStorage.getItem(BRIEFING_SESSION_KEY) === "1") return;
    } catch {
      // Ignore unavailable storage and show the briefing.
    }
    setOpen(true);
  }, [forceBrief]);

  const closeBriefing = useCallback(() => {
    try {
      sessionStorage.setItem(BRIEFING_SESSION_KEY, "1");
    } catch {
      // Ignore unavailable storage.
    }
    setOpen(false);
    stripBriefParam();
  }, [stripBriefParam]);

  return {
    open,
    openBriefing: () => setOpen(true),
    closeBriefing,
  };
}
