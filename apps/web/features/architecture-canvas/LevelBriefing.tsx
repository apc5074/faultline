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
import { consumeLevelIntroPending } from "@/features/architecture-canvas/level-intro-storage";

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

function formatRequirementTarget(
  type: string,
  target: number,
  unit: string
): string {
  if (type === "latency") return `< ${target}${unit}`;
  if (type === "headroom") return `≥ ${Math.round(target * 100)}%`;
  if (type === "budget") return `≤ ${formatBudget(target)}/mo`;
  if (type === "throughput") return "Handle peak load (see traffic est.)";
  return `${target} ${unit}`;
}

const REQUIREMENT_HELP: Record<string, string> = {
  throughput: "Peak traffic that system must reliably handle.",
  latency: "How fast redirects feel for users.",
  headroom: "Necessary extra capacity above peak traffic.",
  budget: "Maximum budget for system upkeep.",
};

function RequirementHelp({ explanation }: { explanation: string }) {
  const helpId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [tipPosition, setTipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const positionTip = useCallback(() => {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!button || !tip) return;

    const buttonRect = button.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const dialog = button
      .closest(".level-briefing__dialog")
      ?.getBoundingClientRect();
    const padding = 8;
    const leftBound = Math.max(padding, (dialog?.left ?? padding) + padding);
    const rightBound = Math.min(
      window.innerWidth - padding,
      (dialog?.right ?? window.innerWidth - padding) - padding
    );
    const topBound = Math.max(padding, (dialog?.top ?? padding) + padding);
    const bottomBound = Math.min(
      window.innerHeight - padding,
      (dialog?.bottom ?? window.innerHeight - padding) - padding
    );
    const centeredLeft =
      buttonRect.left + buttonRect.width / 2 - tipRect.width / 2;
    const left = Math.min(
      Math.max(centeredLeft, leftBound),
      Math.max(leftBound, rightBound - tipRect.width)
    );
    const aboveTop = buttonRect.top - tipRect.height - 8;
    const belowTop = buttonRect.bottom + 8;
    const top =
      aboveTop >= topBound
        ? aboveTop
        : belowTop + tipRect.height <= bottomBound
        ? belowTop
        : Math.min(
            Math.max(aboveTop, topBound),
            Math.max(topBound, bottomBound - tipRect.height)
          );

    setTipPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(positionTip);
    const reposition = () => positionTip();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, positionTip]);

  return (
    <span className="level-briefing__help">
      <button
        ref={buttonRef}
        type="button"
        className="level-briefing__help-btn"
        aria-label="What this requirement means"
        aria-describedby={open ? helpId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      <span
        ref={tipRef}
        id={helpId}
        role="tooltip"
        aria-hidden={!open}
        className={`level-briefing__help-tip${
          open ? " level-briefing__help-tip--open" : ""
        }`}
        style={
          tipPosition
            ? { left: tipPosition.left, top: tipPosition.top }
            : undefined
        }
      >
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
  onStartDesigning?: () => void;
};

export function LevelBriefing({
  open,
  onClose,
  onStartDesigning,
}: LevelBriefingProps) {
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
          <p className="level-briefing__scenario">
            {activeLevelCurriculum.hook}
          </p>
          <p className="level-briefing__stakes">
            {activeLevelCurriculum.stakes}
          </p>

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
            <ul
              className="level-briefing__geo"
              aria-label="Traffic origin regions"
            >
              {activeChallenge.geographicDistribution.map((origin) => (
                <li key={origin.regionId}>
                  <strong>{origin.regionId}</strong>{" "}
                  {formatPercent(origin.fraction)}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="level-briefing__section-label">Pass when</p>
          <ul className="level-briefing__targets">
            {activeChallenge.requirements.map((requirement) => (
              <RequirementRow
                key={requirement.id}
                label={
                  requirement.type === "budget"
                    ? "Monthly budget"
                    : requirement.label
                }
                value={formatRequirementTarget(
                  requirement.type,
                  requirement.target,
                  requirement.unit
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
            Drag components onto the canvas, connect ports, press Run.
          </p>
        </div>

        <footer className="level-briefing__footer">
          <button
            ref={primaryButtonRef}
            className="level-briefing__start"
            type="button"
            onClick={() => {
              onStartDesigning?.();
              onClose();
            }}
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
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceBrief = searchParams.get("brief") === "1";
  const forceIntro = searchParams.get("intro") === "1";
  const introInitializedRef = useRef(false);

  const stripBriefParam = useCallback(() => {
    if (!forceBrief) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("brief");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [forceBrief, pathname, router, searchParams]);

  const stripIntroParam = useCallback(() => {
    if (!forceIntro) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("intro");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [forceIntro, pathname, router, searchParams]);

  useEffect(() => {
    if (forceBrief) {
      // The query flag is navigation intent, not durable modal state. Remove
      // it as soon as it has opened the briefing so a browser refresh does
      // not reopen the overlay.
      stripBriefParam();
      setHelpOpen(false);
      setOpen(true);
      return;
    }

    if (introInitializedRef.current) return;
    introInitializedRef.current = true;
    // The home link supplies both a query trigger and a session marker. Read
    // the marker even when the query is present; otherwise `||` short-circuits
    // and leaves it behind to reopen Help after a refresh.
    const introPending = consumeLevelIntroPending();
    const shouldShowIntro = forceIntro || introPending;
    if (forceIntro) {
      // As above, consume the URL trigger on entry. The session-storage flag
      // has already been consumed, so a refresh stays on the playable board.
      stripIntroParam();
    }
    if (!shouldShowIntro) {
      setHelpOpen(false);
      setOpen(false);
      return;
    }

    setHelpOpen(true);
    setOpen(false);
  }, [forceBrief, forceIntro, stripBriefParam, stripIntroParam]);

  const closeBriefing = useCallback(() => {
    setOpen(false);
    stripBriefParam();
  }, [stripBriefParam]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    setOpen(true);
    stripIntroParam();
  }, [stripIntroParam]);

  const openBriefing = useCallback(() => {
    setOpen(true);
  }, []);

  return {
    open,
    helpOpen,
    openBriefing,
    restartBriefing: openBriefing,
    closeHelp,
    closeBriefing,
  };
}
