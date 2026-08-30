import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WebMCP guide · Faultline",
  description: "Connect ChatGPT to Faultline and review a distributed-system design together.",
};

const PROMPT_GROUPS = [
  {
    label: "Walk the canvas",
    title: "Make the system legible",
    prompt: "Walk me through this design like a systems teacher. Start with the traffic source, point to each important component, explain its role in the request path, and highlight the connection where the workload is most constrained.",
    result: "The agent reads the live architecture, focuses components, and highlights an existing connection as it explains.",
  },
  {
    label: "Find the break",
    title: "Where is the biggest problem?",
    prompt: "What is the single biggest problem in my current design? Use simulator evidence, mark the responsible component as a risk, explain the numbers in plain language, and ask me one question about how I want to improve it.",
    result: "One grounded bottleneck, one risk mark, and one design question—not a wall of metrics.",
  },
  {
    label: "Teach the mechanism",
    title: "Why does this fail?",
    prompt: "I selected a component. Explain what it is doing, what is saturating or under pressure, and why that affects the user-facing requirement. Point to the component and show me the relevant path. Do not prescribe a topology yet.",
    result: "The explanation stays tied to the selected component, its neighbors, and deterministic outcomes.",
  },
  {
    label: "Compare a change",
    title: "Did my edit help?",
    prompt: "I just changed the design without pressing Run. What changed in the live draft, did the edit improve the failing outcome, and what new tradeoff did it introduce? Use the previous evidence revision if available and highlight the changed path.",
    result: "The agent compares revisions, distinguishes live-draft evidence from a Run, and avoids pretending the change is officially verified.",
  },
  {
    label: "Challenge it",
    title: "Try to break my idea",
    prompt: "Find the most credible way this design could fail under the active workload. Explain the hypothesis and the evidence first, then propose one bounded simulated test. Wait for my explicit approval before running anything.",
    result: "The agent reasons from evidence, asks permission, and keeps experiments simulated and reversible.",
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
    label: "Simulated",
    title: "Challenge the design",
    body: "Run bounded load, cache, traffic-pattern, or failure experiments after you explicitly approve the named experiment.",
  },
];

export default function WebMcpPage() {
  return (
    <main className="webmcp-guide">
      <header className="webmcp-guide__header">
        <Link className="webmcp-guide__wordmark" href="/">Faultline</Link>
        <Link className="webmcp-guide__back" href="/level/1">Back to the canvas →</Link>
      </header>

      <div className="webmcp-guide__content">
        <section className="webmcp-guide__hero" aria-labelledby="webmcp-guide-title">
          <p className="webmcp-guide__eyebrow">Faultline × WebMCP</p>
          <h1 id="webmcp-guide-title">Bring an agent into the design review.</h1>
          <p>
            You design the system. The simulator determines what is true. Your agent
            can inspect the evidence, ask sharper questions, and help you explore
            where the architecture breaks.
          </p>
        </section>

        <section className="webmcp-guide__section" aria-labelledby="connect-title">
          <p className="webmcp-guide__kicker">01 / Connect</p>
          <h2 id="connect-title">Open Faultline in ChatGPT&apos;s browser</h2>
          <ol className="webmcp-guide__steps">
            <li><strong>Open the ChatGPT desktop app.</strong> Use its in-app browser, where WebMCP is supported by default.</li>
            <li><strong>Open the live Faultline app</strong> and go to Level 1. Keep the canvas open while you chat.</li>
            <li><strong>Ask ChatGPT to inspect the page.</strong> It can discover Faultline&apos;s WebMCP tools and use them in the conversation.</li>
          </ol>
          <p className="webmcp-guide__note">
            Prefer Chrome? The challenge rules describe Chrome 149 or later with
            <code>chrome://flags/#enable-webmcp-testing</code> enabled and the browser restarted.
          </p>
        </section>

        <section className="webmcp-guide__section" aria-labelledby="abilities-title">
          <p className="webmcp-guide__kicker">02 / Abilities</p>
          <h2 id="abilities-title">What the agent can do</h2>
          <div className="webmcp-guide__ability-grid">
            {ABILITIES.map((ability) => (
              <article className="webmcp-guide__ability" key={ability.label}>
                <span className="webmcp-guide__ability-label">{ability.label}</span>
                <h3>{ability.title}</h3>
                <p>{ability.body}</p>
              </article>
            ))}
          </div>
          <p className="webmcp-guide__callout">
            The human stays in charge of architecture changes. Agents do not edit
            the canvas, submit results, or decide pass/fail. Faultline&apos;s
            deterministic simulator owns the truth.
          </p>
        </section>

        <section className="webmcp-guide__section" aria-labelledby="prompts-title">
          <p className="webmcp-guide__kicker">03 / Prompt it well</p>
          <h2 id="prompts-title">Start with a design question</h2>
          <p className="webmcp-guide__section-intro">
            Start with one review_current_design call. Ask for targeted follow-up
            evidence only when the first finding needs more detail; independent
            reads can run in parallel when the host supports it.
          </p>
          <div className="webmcp-guide__prompt-showcase">
            {PROMPT_GROUPS.map((group) => (
              <article className="webmcp-guide__prompt-card" key={group.label}>
                <div>
                  <span className="webmcp-guide__ability-label">{group.label}</span>
                  <h3>{group.title}</h3>
                </div>
                <code>{group.prompt}</code>
                <p>{group.result}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="webmcp-guide__footer">
          <p><strong>Building for the OpenAI WebMCP Challenge?</strong> Faultline is designed to show a real human-and-agent workflow, not just a tool demo: a working live project, meaningful WebMCP usage, and a clear explanation of what became possible together.</p>
          <p className="webmcp-guide__fineprint">
            This guide is product documentation, not official contest guidance.
            The <a href="https://webmcp.devpost.com" target="_blank" rel="noreferrer">Official Rules</a> and Hackathon Website control in the event of a conflict.
          </p>
        </footer>
      </div>
    </main>
  );
}
