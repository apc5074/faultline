"use client";

import { useEffect, useRef, useState } from "react";

import { PlayLevelLink } from "@/features/home/PlayLevelLink";

function SystemFlowGraphic() {
  return (
    <svg
      className="home-help__flow"
      viewBox="0 0 520 74"
      role="img"
      aria-label="A request travels from a user through connected components to a data store."
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M 78 37 H 116 M 186 37 H 224 M 294 37 H 332 M 402 37 H 440" />
        <path d="m 108 32 8 5-8 5 M 216 32l8 5-8 5 M 324 32l8 5-8 5 M 432 32l8 5-8 5" />
      </g>
      {[
        [8, "Users"],
        [116, "Edge"],
        [224, "App"],
        [332, "Cache"],
        [440, "Data"],
      ].map(([x, label]) => (
        <g key={label as string} transform={`translate(${x} 15)`}>
          <rect
            width="70"
            height="44"
            fill="var(--color-paper)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text
            x="35"
            y="27"
            fill="currentColor"
            fontSize="9"
            fontWeight="700"
            letterSpacing=".6"
            textAnchor="middle"
          >
            {label as string}
          </text>
        </g>
      ))}
    </svg>
  );
}

function WebMcpGraphic() {
  return (
    <svg
      className="home-help__webmcp"
      viewBox="0 0 520 130"
      role="img"
      aria-label="Your agent uses WebMCP to look at the Faultline design and explain live simulator evidence."
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M 128 65 H 202 M 318 65 H 392" />
        <path d="m 194 60 8 5-8 5 M 382 60l8 5-8 5" />
      </g>
      <g transform="translate(12 36)">
        <rect
          width="116"
          height="58"
          fill="var(--color-paper)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle
          cx="28"
          cy="29"
          r="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M 20 29 H 36 M 28 21 V 37"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x="74"
          y="27"
          fill="currentColor"
          fontSize="10"
          fontWeight="700"
          letterSpacing=".6"
          textAnchor="middle"
        >
          YOUR
        </text>
        <text
          x="74"
          y="41"
          fill="currentColor"
          fontSize="10"
          fontWeight="700"
          letterSpacing=".6"
          textAnchor="middle"
        >
          AGENT
        </text>
      </g>
      <g transform="translate(202 36)">
        <rect
          width="116"
          height="58"
          fill="var(--color-paper)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x="58"
          y="23"
          fill="currentColor"
          fontSize="10"
          fontWeight="700"
          letterSpacing=".6"
          textAnchor="middle"
        >
          WEBMCP
        </text>
        <path d="M 18 31 H 98" stroke="currentColor" strokeWidth="1" />
        <text
          x="58"
          y="44"
          fill="currentColor"
          fontSize="8"
          textAnchor="middle"
        >
          SAFE, LIVE CONTEXT
        </text>
      </g>
      <g transform="translate(392 36)">
        <rect
          width="116"
          height="58"
          fill="var(--color-paper)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x="58"
          y="27"
          fill="currentColor"
          fontSize="10"
          fontWeight="700"
          letterSpacing=".6"
          textAnchor="middle"
        >
          YOUR
        </text>
        <text
          x="58"
          y="42"
          fill="currentColor"
          fontSize="10"
          textAnchor="middle"
        >
          DESIGN
        </text>
      </g>
    </svg>
  );
}

function InspectGraphic() {
  return (
    <svg
      className="home-help__inspect"
      viewBox="0 0 180 92"
      role="img"
      aria-label="A component card with a highlighted utilization meter."
    >
      <rect
        x="12"
        y="12"
        width="98"
        height="68"
        fill="var(--color-paper)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="24"
        y="24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M 31 38 H 45 M 38 31 V 45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M 62 31 H 98 M 62 38 H 89"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="24"
        y="62"
        width="74"
        height="6"
        fill="none"
        stroke="currentColor"
      />
      <rect x="24" y="62" width="52" height="6" fill="currentColor" />
      <path
        d="M 121 64 C 136 64 139 54 150 45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="153"
        cy="42"
        r="11"
        fill="var(--color-paper)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m 149 42 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function HomeHelp({
  initialOpen = false,
  onContinue,
  showTrigger = true,
}: {
  initialOpen?: boolean;
  onContinue?: () => void;
  showTrigger?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeHelp = () => {
    setOpen(false);
    onContinue?.();
  };

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHelp();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onContinue]);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  return (
    <>
      {showTrigger ? (
        <button
          className="home-page__help"
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          Help
        </button>
      ) : null}

      {open ? (
        <div className="home-help" role="presentation" onMouseDown={closeHelp}>
          <section
            className="home-help__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="home-help__header">
              <div>
                <p className="home-help__eyebrow">Getting started</p>
                <h2 id="home-help-title">How to play</h2>
              </div>
              <button
                ref={closeButtonRef}
                className="home-help__close"
                type="button"
                onClick={closeHelp}
                aria-label="Close help"
              >
                ×
              </button>
            </header>

            <ol className="home-help__steps">
              <li>
                <span className="home-help__number">01</span>
                <div>
                  <h3>Build a system</h3>
                  <p>
                    Drag components onto the canvas and connect their ports.
                  </p>
                  <SystemFlowGraphic />
                </div>
              </li>
              <li>
                <span className="home-help__number">02</span>
                <div>
                  <h3>Run the simulation</h3>
                  <p>
                    Press Run to send the workload through your design. Moving
                    packets show the path the simulation evaluated.
                  </p>
                </div>
              </li>
              <li>
                <span className="home-help__number">03</span>
                <div>
                  <h3>Read the evidence, then iterate</h3>
                  <p>
                    Select components and use the run results to find
                    bottlenecks. Change the design and run it again.
                  </p>
                  <InspectGraphic />
                </div>
              </li>
              <li>
                <span className="home-help__number">04</span>
                <div>
                  <h3>Bring an external agent into the loop</h3>
                  <p>
                    In a compatible browser, WebMCP lets your agent look at
                    Faultline with you. Ask it to walk through the design, point
                    at a component, explain a confusing result, or highlight a
                    likely problem using live simulator evidence. You stay in
                    charge of changes, and the simulator decides whether the
                    design passes.
                  </p>
                  <WebMcpGraphic />
                </div>
              </li>
            </ol>

            {onContinue ? (
              <button
                className="home-help__play"
                type="button"
                onClick={closeHelp}
              >
                Continue to the level briefing <span aria-hidden="true">→</span>
              </button>
            ) : (
              <PlayLevelLink className="home-help__play">
                Play now <span aria-hidden="true">→</span>
              </PlayLevelLink>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
