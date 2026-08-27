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
import { workloadBriefingPlacementHint } from "@/features/architecture-canvas/workload-evidence";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

const ONBOARDING_SESSION_KEY = "faultline.level1.onboarding.seen";

type OnboardingStep = "how-to" | "briefing";

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

function HowToStepGraphic() {
  return (
    <svg
      className="level-briefing__flow"
      viewBox="0 0 360 56"
      role="img"
      aria-label="Users connect through edge and app layers to cache and data."
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M 54 28 H 78 M 126 28 H 150 M 198 28 H 222 M 270 28 H 294" />
        <path d="m 72 23 6 5-6 5 M 144 23l6 5-6 5 M 216 23l6 5-6 5 M 288 23l6 5-6 5" />
      </g>
      {[
        [6, "Users"],
        [78, "Edge"],
        [150, "App"],
        [222, "Cache"],
        [294, "Data"],
      ].map(([x, label]) => (
        <g key={label as string} transform={`translate(${x} 10)`}>
          <rect width="48" height="36" fill="var(--color-paper)" stroke="currentColor" strokeWidth="1.5" />
          <text
            x="24"
            y="22"
            fill="currentColor"
            fontSize="8"
            fontWeight="700"
            letterSpacing=".5"
            textAnchor="middle"
          >
            {label as string}
          </text>
        </g>
      ))}
    </svg>
  );
}

type LevelBriefingProps = {
  open: boolean;
  step: OnboardingStep;
  onAdvance: () => void;
  onClose: () => void;
};

export function LevelBriefing({ open, step, onAdvance, onClose }: LevelBriefingProps) {
  const titleId = useId();
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const latency = activeChallenge.requirements.find((requirement) => requirement.id === "latency");
  const headroom = activeChallenge.requirements.find((requirement) => requirement.id === "headroom");
  const budget = activeChallenge.requirements.find((requirement) => requirement.id === "budget");
  const placementHint = workloadBriefingPlacementHint(activeChallenge);
  const isHowTo = step === "how-to";

  useEffect(() => {
    if (!open) return;
    primaryButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, step, onClose]);

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
            <p className="level-briefing__eyebrow">
              {isHowTo ? "Level 1 · Getting started" : "Level 1 · The problem"}
            </p>
            <h2 id={titleId}>{isHowTo ? "How to play" : activeChallenge.title}</h2>
          </div>
          <div className="level-briefing__header-actions">
            <div className="level-briefing__steps" aria-hidden="true">
              <span className={isHowTo ? "is-active" : "is-done"} />
              <span className={!isHowTo ? "is-active" : undefined} />
            </div>
            <button
              className="level-briefing__close"
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <div key={step} className="level-briefing__body level-briefing__body--swap">
          {isHowTo ? (
            <>
              <ol className="level-briefing__howto">
                <li>
                  <span className="level-briefing__howto-num">01</span>
                  <div>
                    <h3>Build</h3>
                    <p>Drag components onto the canvas and connect ports into a request path.</p>
                  </div>
                </li>
                <li>
                  <span className="level-briefing__howto-num">02</span>
                  <div>
                    <h3>Run</h3>
                    <p>Press Run to push traffic through your design. Watch packets and bottlenecks.</p>
                  </div>
                </li>
                <li>
                  <span className="level-briefing__howto-num">03</span>
                  <div>
                    <h3>Iterate</h3>
                    <p>Read the data plates, change the design, and run again until you pass.</p>
                  </div>
                </li>
              </ol>
              <HowToStepGraphic />
              <p className="level-briefing__hint">
                {isFaultlineAiEnabled()
                  ? "You design. The simulator decides pass or fail — not the AI."
                  : "You design. The simulator decides pass or fail."}
              </p>
            </>
          ) : (
            <>
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

              {placementHint ? (
                <p className="level-briefing__hint">{placementHint}</p>
              ) : null}

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
                Drag components onto the canvas, connect ports, then Run.
              </p>
            </>
          )}
        </div>

        <footer className="level-briefing__footer">
          {isHowTo ? (
            <button
              ref={primaryButtonRef}
              className="level-briefing__start"
              type="button"
              onClick={onAdvance}
            >
              Next: the problem <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button
              ref={primaryButtonRef}
              className="level-briefing__start"
              type="button"
              onClick={onClose}
            >
              Start designing <span aria-hidden="true">→</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

/** Everyone is a guest until real sign-in exists. Guests see help, then the problem. */
function isGuestUser(): boolean {
  return true;
}

export function useLevelBriefing() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("how-to");
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
    const guest = isGuestUser();
    const startStep: OnboardingStep = guest ? "how-to" : "briefing";

    if (forceBrief) {
      setStep(startStep);
      setOpen(true);
      return;
    }
    try {
      if (sessionStorage.getItem(ONBOARDING_SESSION_KEY) === "1") return;
    } catch {
      // Ignore unavailable storage and show onboarding.
    }
    setStep(startStep);
    setOpen(true);
  }, [forceBrief]);

  const closeBriefing = useCallback(() => {
    markSeen();
    setOpen(false);
    stripBriefParam();
  }, [markSeen, stripBriefParam]);

  const advanceToProblem = useCallback(() => {
    setStep("briefing");
  }, []);

  const openBriefing = useCallback(() => {
    setStep("briefing");
    setOpen(true);
  }, []);

  const restartBriefing = useCallback(() => {
    setStep(isGuestUser() ? "how-to" : "briefing");
    setOpen(true);
  }, []);

  return {
    open,
    step,
    openBriefing,
    restartBriefing,
    advanceToProblem,
    closeBriefing,
  };
}
