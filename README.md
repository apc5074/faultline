# Faultline

**A daily distributed-systems design game.** You inherit a system that's already on fire. You redesign it. A simulator tells you if it holds. An agent sits next to you like a sharp coworker, not a tutor with the answer key.

**[Play →](https://syslab-9ys7.vercel.app/)**

Level 1 is a global URL shortener after a celebrity campaign. $85k/month budget, p95 under 150ms worldwide, one viral short link trying to melt a single cache key. Drag services, caches, databases, and CDNs onto a canvas, place them on a world map, hit Run, watch packets move, iterate.

> Human designs. Simulator determines truth. Agent challenges the design.

Play solo in any browser. In ChatGPT's in-app browser, or Chrome with WebMCP enabled (`chrome://flags/#enable-webmcp-testing`), an agent can join the live session.

---

## Agents in the room

Built for the [WebMCP Challenge](https://webmcp.devpost.com/).

What I like about WebMCP is that the agent is actually *on the page*. Same canvas, same session, same moment you're mid-edit. It's not a chatbot you paste a screenshot into. It's another engineer in the room.

That raises a design question I care about more than the API: how should an agent act in a space a human is already using?

For a learning game, letting the agent finish the task is the wrong default. You learn systems design by making a call and watching what happens. If it can just place Redis and a CDN for you, you didn't learn anything.

So we gave the agent **limited freedom**. It gets real tools on the live design. It does not get the keys.

Concretely, the page registers three kinds of tools through `document.modelContext`:

- **Read.** The challenge, your architecture, simulator numbers, cost, whatever component you have selected. Fresh snapshot every call, not a stale dump from when the agent connected.
- **Draw.** Focus brackets, short notes, highlighted paths. Coaching marks. You can always clear them. They never change the design.
- **Experiment.** Simulated load tests, cache flushes, knocking a service or a region over. Temporary. The architecture on the canvas does not move.

What it cannot do is the whole point: add a box, drag a region, submit a score. Official leaderboard results get re-simulated on the server. The model does not grade the homework.

The personality is a good coworker. Inspect before talking. One finding, one question. Point at the saturated Postgres primary and ask if you meant to send writes through a replica. Don't hand over a canonical topology. The page even exposes that contract as a tool (`get_coaching_policy`) so the agent can read how to behave for *this* challenge instead of us hoping a system prompt survives. When you click a help chip, it can ask `get_session_focus` and see what you actually selected — we don't push a chat message into the host.

The built-in AI panel uses the same tools and the same rules. WebMCP is just that layer pointed at whatever agent is sitting in the browser.

If the browser doesn't speak WebMCP, the game still plays. The top bar says **Unsupported browser** and you keep designing.

Tool catalog and competitor prompt: [`docs/WEBMCP.md`](docs/WEBMCP.md), [`docs/WEBMCP_COMPETITION.md`](docs/WEBMCP_COMPETITION.md).

---

## Local development

```sh
pnpm install
pnpm dev
```

App runs at `http://localhost:3000`. Agent starting points: [`AGENTS.md`](AGENTS.md), [`docs/CODEX.md`](docs/CODEX.md).
