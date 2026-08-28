"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  activeChallenge,
  activeLevelCurriculum,
  challengeHotKeyLabel,
  challengeReadWriteRatioLabel,
  challengeRedirectRps,
  challengeWriteRps,
} from "@/features/architecture-canvas/playground-challenge";

const ONBOARDING_SESSION_KEY = "faultline.level1.onboarding.seen";

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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
  throughput: "Your design must handle the full sustained peak without dropping work.",
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
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    primaryButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="level-briefing__body">
          <p className="level-briefing__scenario">{activeLevelCurriculum.hook}</p>
          <p className="level-briefing__stakes">{activeLevelCurriculum.stakes}</p>

          <p className="level-briefing__section-label">Traffic estimate</p>
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

          {activeChallenge.geographicDistribution?.length ? (
            <ul className="level-briefing__geo" aria-label="Traffic origin regions">
              {activeChallenge.geographicDistribution.map((origin) => (
                <li key={origin.regionId}>
                  <strong>{origin.regionId}</strong> {formatPercent(origin.fraction)}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="level-briefing__section-label">Pass when</p>
          <ul className="level-briefing__targets">
            {activeChallenge.requirements.map((requirement) => (
              <RequirementRow
                key={requirement.id}
                label={requirement.type === "budget" ? "Monthly budget" : requirement.label}
                value={formatRequirementTarget(
                  requirement.type,
                  requirement.target,
                  requirement.unit,
                )}
                help={
                  REQUIREMENT_HELP[requirement.type] ??
                  REQUIREMENT_HELP[requirement.id] ??
                  "Scored outcome for this level."
                }
              />
            ))}
          </ul>

          <p className="level-briefing__hint">
            Drag components onto the canvas, connect ports, press Run — iterate until every
            target passes.
          </p>
        </div>

        <footer className="level-briefing__footer">
          <button
            ref={primaryButtonRef}
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

  const markSeen = useCallback(() => {
    try {
      sessionStorage.setItem(ONBOARDING_SESSION_KEY, "1");
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  useEffect(() => {
    if (forceBrief) {
      setOpen(true);
      return;
    }
    try {
      if (sessionStorage.getItem(ONBOARDING_SESSION_KEY) === "1") return;
    } catch {
      // Ignore unavailable storage and show briefing.
    }
    setOpen(true);
  }, [forceBrief]);

  const closeBriefing = useCallback(() => {
    markSeen();
    setOpen(false);
    stripBriefParam();
  }, [markSeen, stripBriefParam]);

  const openBriefing = useCallback(() => {
    setOpen(true);
  }, []);

  return {
    open,
    openBriefing,
    restartBriefing: openBriefing,
    closeBriefing,
  };
}
