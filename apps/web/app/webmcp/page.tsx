import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WebMCP guide · Faultline",
  description: "Connect ChatGPT to Faultline and review a distributed-system design together.",
};

const PROMPTS = [
  "Inspect my architecture. What is the first bottleneck the simulator sees, and what evidence supports that?",
  "Review my Global URL Shortener design for the current challenge. Give me one finding and one question.",
  "Inspect the focused component and the current simulator evidence. Explain what I should change without editing the design.",
  "Propose one bounded failure experiment, explain what it will test, and wait for my approval before running it.",
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
            Good prompts give the agent a job, ask for evidence, and leave the
            design decision with you.
          </p>
          <div className="webmcp-guide__prompt-list">
            {PROMPTS.map((prompt) => <code key={prompt}>{prompt}</code>)}
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
