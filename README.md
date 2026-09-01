# Faultline

**A daily distributed-systems design game.** You inherit a system that's already on fire. You redesign it. A simulator tells you if it holds. An agent sits next to you like a sharp coworker, not a tutor with the answer key.

**[Play Now →](https://syslab-9ys7.vercel.app/)**

Level 1 is a global URL shortener after a celebrity campaign. $85k/month budget, p95 under 150ms worldwide, one viral short link trying to melt a single cache key. Drag services, caches, databases, and CDNs onto a canvas, place them on a world map, hit Run, watch packets move, iterate.

Play solo in any browser. In ChatGPT's in-app browser, or Chrome with WebMCP enabled (`chrome://flags/#enable-webmcp-testing`), an agent can join the live session.

---

## Working with an Agent

Built for the [WebMCP Challenge](https://webmcp.devpost.com/).

WebMCP was interesting to me because it allows the agent to actually be on the page. Most AI workflows focus on how we can automate something, but WebMCP is built for coming up with ways for agents and humans to work in the same session together.

I wanted to build an app that utilizes this collaboration without allowing the AI to do everything.

The perfect use case for this is an educational game. You learn system design by making an attempt and watching what happens and bouncing ideas until you have another idea. If the agent can just coordinate the system, you didn't learn anything.

The agent is designed around this limited freedom. It gets real tools on the live design, but it can't make changes to your work. I wanted the agent to act like your favorite coworker. Knows what they're talking about, doesn't make you feel dumb, and doesn't just take over. I achieved this by exposing the personality as a tool (`get_coaching_policy`) so the agent can read how to behave for this specific challenge.

The page registers three kinds of tools through `document.modelContext`:

- **Read.** The challenge, your architecture, simulator numbers, cost, whatever component you have selected. Fresh snapshot every call.
- **Draw.** Focus brackets, short notes, highlighted paths. Coaching marks. You can always clear them. They never change the design.
- **Experiment.** Simulated load tests, cache flushes, knocking a service or a region over. Temporary. The architecture on the canvas does not move.

If the browser doesn't support WebMCP, the game still plays. The top bar says **Unsupported browser** and you keep designing.

Tool catalog and competitor prompt: [`docs/WEBMCP.md`](docs/TOOL_CATALOG.md), [`docs/WEBMCP_COMPETITION.md`](docs/WEBMCP_COMPETITION.md).

---

## Local development

```sh
pnpm install
pnpm dev
```

App runs at `http://localhost:3000`. Agent starting points: [`AGENTS.md`](AGENTS.md), [`docs/CODEX.md`](docs/CODEX.md).
