import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WebMCP guide · Faultline",
  description:
    "Connect ChatGPT to Faultline and review a distributed-system design together.",
};

const PROMPT_GROUPS = [
  {
    label: "Walk the canvas",
    title: "Make the system legible",
    prompt:
      "Walk me through the current configured request path like a systems teacher. Cover at most three important connected components, explain their roles, and identify one simulator-backed constraint. Treat any absent infrastructure as hypothetical and use persistent visual marks only when useful.",
    result:
      "The agent reads the live architecture, focuses components, and highlights an existing connection as it explains.",
  },
  {
    label: "Find the break",
    title: "Where is the biggest problem?",
    prompt:
      "What is the single biggest simulator-backed problem in my current design, if one exists? Explain the numbers in plain language, mark the responsible component only if useful, and ask me one question about how I want to improve it.",
    result:
      "One grounded bottleneck, one risk mark, and one design question—not a wall of metrics.",
  },
  {
    label: "Teach the mechanism",
    title: "Why does this fail?",
    prompt:
      "I selected a component. Use current evidence to explain what it is doing, what is saturating or under pressure, and why that affects the user-facing requirement. Include its verified neighbors and relevant path; do not assume absent components or prescribe a topology.",
    result:
      "The explanation stays tied to the selected component, its neighbors, and deterministic outcomes.",
  },
  {
    label: "Compare a change",
    title: "Did my edit help?",
    prompt:
      "I just changed the design without pressing Run. Compare the current live draft with the previous evidence revision if a valid baseline exists; otherwise say comparison is unavailable. Explain any changed outcome or tradeoff without claiming official verification.",
    result:
      "The agent compares revisions, distinguishes live-draft evidence from a Run, and avoids pretending the change is officially verified.",
  },
  {
    label: "Interview",
    title: "Think through the design",
    prompt:
      "Interview me on my current design. Ask one focused question at a time about my architecture and tradeoffs, evaluate my answers against the current evidence, and let me ask follow-ups before moving on. Do not edit the canvas or run experiments.",
    result:
      "The agent runs a structured design interview—one question, one evaluation, your pace—without editing the canvas or claiming official pass/fail.",
  },
];

const ABILITIES = [
  {
    label: "Read",
    title: "Inspect the design",
    body: "Ask about the active challenge, architecture, components, requirements, costs, cache behavior, regional traffic, and simulator metrics.",
  },
  {
    label: "Visual",
    title: "Work from the canvas",
    body: "Focus on a component or region, follow the current visual evidence, and pin observations for a shared design review.",
  },
  {
    label: "Interview",
    title: "Think through the design",
    body: "Answer focused questions about your architecture, explain your tradeoffs, and explore other ways the system could be designed without handing over control of the canvas.",
  },
];

export default function WebMcpPage() {
  return (
    <main className="webmcp-guide">
      <header className="webmcp-guide__header">
        <Link className="webmcp-guide__wordmark" href="/">
          Faultline
        </Link>
        <Link className="webmcp-guide__back" href="/level/1">
          Back to the canvas →
        </Link>
      </header>

      <div className="webmcp-guide__content">
        <section
          className="webmcp-guide__hero"
          aria-labelledby="webmcp-guide-title"
        >
          <p className="webmcp-guide__eyebrow">Faultline × WebMCP</p>
          <h1 id="webmcp-guide-title">
            Bring an agent into the design review.
          </h1>
          <p>
            You design the system. The simulator determines what is true. Your
            agent can inspect the evidence, ask sharper questions, and help you
            explore where the architecture breaks.
          </p>
        </section>

        <section
          className="webmcp-guide__section"
          aria-labelledby="connect-title"
        >
          <p className="webmcp-guide__kicker">01 / Connect</p>
          <h2 id="connect-title">Open Faultline in ChatGPT&apos;s browser</h2>
          <ol className="webmcp-guide__steps">
            <li>
              <strong>Update and open the ChatGPT desktop app.</strong> Use its
              integrated browser with ChatGPT Work or Codex and a model that
              currently supports Site tools.
            </li>
            <li>
              <strong>Enable Site tools.</strong> In ChatGPT, check Settings →
              Browser → Permissions → Enable site tools.
            </li>
            <li>
              <strong>Open the live Faultline app at Level 1</strong> as the
              top-level page, not inside an iframe. Keep the canvas open while
              you chat.
            </li>
            <li>
              <strong>Check Site tools in the address bar.</strong> Confirm
              Faultline appears under Available site tools before asking the
              agent to inspect the page. Page registration alone does not prove
              host discovery or invocation.
            </li>
            <li>
              <strong>Verify the call after the answer.</strong> Recently used
              Site tools should show the invocation. Without an observed call,
              treat simulator-looking prose as unverified.
            </li>
          </ol>
        </section>

        <section
          className="webmcp-guide__section"
          aria-labelledby="abilities-title"
        >
          <p className="webmcp-guide__kicker">02 / Abilities</p>
          <h2 id="abilities-title">What the agent can do</h2>
          <div className="webmcp-guide__ability-grid">
            {ABILITIES.map((ability) => (
              <article className="webmcp-guide__ability" key={ability.label}>
                <span className="webmcp-guide__ability-label">
                  {ability.label}
                </span>
                <h3>{ability.title}</h3>
                <p>{ability.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="webmcp-guide__section"
          aria-labelledby="prompts-title"
        >
          <p className="webmcp-guide__kicker">03 / Prompt it well</p>
          <h2 id="prompts-title">Start with a design question</h2>
          <ol className="webmcp-guide__prompt-playbook">
            {PROMPT_GROUPS.map((group, index) => (
              <li className="webmcp-guide__prompt-move" key={group.label}>
                <div className="webmcp-guide__prompt-move-head">
                  <span className="webmcp-guide__prompt-move-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="webmcp-guide__prompt-move-title">
                    <span className="webmcp-guide__ability-label">
                      {group.label}
                    </span>
                    <span>{group.title}</span>
                  </p>
                </div>
                <p className="webmcp-guide__prompt-copy">{group.prompt}</p>
                <p className="webmcp-guide__prompt-outcome">{group.result}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
