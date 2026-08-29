# Faultline

**A daily distributed-systems design game.** You inherit a system that's already on fire. You redesign it. A deterministic simulator tells you if it holds. An agent sits next to you like a sharp coworker, not a tutor with the answer key.

**[Play →](https://syslab-9ys7.vercel.app/)**

The first challenge is a global URL shortener. Celebrity campaign just dropped. Traffic jumped overnight. You have an $85k/month budget, a p95 under 150ms worldwide, and one viral short link trying to melt a single cache key.

Drag services, databases, caches, load balancers, CDNs, and replicas onto a canvas. Place them on a world map. Hit Run. Watch packets move. Read the evidence. Iterate.

The rule the whole product is built on:

> Human designs. Simulator determines truth. Agent challenges the design.

You can play it solo in any browser. If you're on ChatGPT's in-app browser, or Chrome with WebMCP enabled (`chrome://flags/#enable-webmcp-testing`), an external agent can join the session and actually _see_ the live design.

---

## Built for the [WebMCP Challenge](https://webmcp.devpost.com/)

WebMCP is interesting to me because it puts an agent in the same space a human is already using. Same page, same canvas, same live session. Another engineer in the room.

The design question, then, is how that presence should behave. I think the default should be: the human is mid-task, the agent can read the same live design through tools, and the catalog you register is a statement of what kind of collaborator it's allowed to be.

Faultline's use case is education, which made that statement easy. Systems design is a skill you get by making a call and watching what happens. If the agent can finish the architecture for you, the page stops being a place to learn. So we gave it limited freedom: real tools on the live design, no keys to the design itself.

### Why education

Faultline makes architecture runnable. You place boxes, hit Run, and a deterministic simulator reports latency, capacity, cost, geography, and pass/fail. Official leaderboard scores are re-simulated server-side, so neither the browser nor the model gets to grade the homework.

The collaboration we wanted looks like a sharp coworker sitting next to you. They look at the same wreckage, point at the saturated Postgres primary, and ask whether you meant to send write traffic through a replica. They inspect, they question, they can try to break a design in a simulated experiment. Then they wait for you to change the architecture.

That's the coworker we registered tools for.

### What the agent can do

Three surfaces, registered through `document.modelContext` on the live Level 1 page. Every call reads a fresh snapshot of the challenge, architecture, simulator evidence, and whatever the human currently has selected.

**Read.** Facts only. Challenge brief, requirements, architecture, per-component inspection, capacity, metrics, cost. A few tools only appear once the design has the structure they inspect — Redis for `inspect_cache`, replicas for `inspect_replication`, multiple regions for `inspect_regional_traffic`.

**Visual.** The agent can mark the canvas: focus brackets, 280-character notes, highlighted connections, region focus, observation pins. Coaching marks never mutate architecture. Notes/focus/path marks cap at 12. You can always hit **Clear marks**.

**Experiment.** Simulated only. Load tests, traffic-pattern changes, cache flushes, component/region failures. Temporary. They don't edit infra and they don't touch official results. The tool descriptions ask for inspect-first reasoning and explicit user intent; that is coaching policy, not a confirmation dialog.

The catalog cannot add a component, move a region, or submit a score. Official pass/fail is the server-side simulator. Coaching policy tells the agent not to invent metrics or act as the judge — `get_metrics` still returns simulator facts like throughput and hot-key results, because those are evidence, not a grade.

### The coworker protocol

If you click a help chip, the agent is supposed to:

1. Call `get_coaching_policy` — the page returns the behavioral contract for this challenge.
2. Call `get_session_focus` so it knows what you actually selected.
3. Inspect evidence for that thing.
4. Give one finding and one question.
5. If it names a component, mark it on the canvas so you're looking at the same node.

That's the coworker voice: interviewer / reviewer / peer. Ground claims in tool results. Don't reveal a canonical topology. Don't prescribe a stack. Don't praise, don't scold, don't roleplay. It is policy the agent is asked to follow, not a sandbox lock.

The built-in AI Engineer panel uses the same policy and the same capability registry. WebMCP is that layer exposed to whatever agent is sitting in the browser.

### Why WebMCP

The agent has to inhabit the page, because the space _is_ the page: the component you just dragged, the node you have selected, the help chip you clicked, live simulator evidence for the current architecture, the note sitting on Redis. Selection and help live in session state. Tools read them on invoke, so we don't re-register the world every time you click a box.

WebMCP is how the page exposes the verbs we trust — with `readOnlyHint` / `destructiveHint` annotations, a fresh live snapshot on every call, and a cancellation lifecycle that unmounts cleanly. If the browser doesn't speak WebMCP, the game still plays. The top bar just says **Unsupported browser**.

### How the tooling is wired

Domain logic lives in `@faultline/agent-capabilities`. Capabilities have a validated input schema, a mode (`read` / `visual` / `experiment`), an `availableWhen` predicate, and an executor. `@faultline/webmcp` is a thin adapter: `toWebMcpTool()` maps one capability onto `document.modelContext.registerTool`. The Next app registers all three surfaces with one `AbortSignal`. Visual intents go through a publisher into the same annotation store the built-in agent uses.

A few details I cared about while building this:

- **Dynamic registration.** Read tools re-register when Redis, replicas, or multi-region structure appears or disappears. An agent with `inspect_cache` on a Redis-less design would just start inventing cache advice.
- **Coaching policy as a tool.** `get_coaching_policy` is callable. The page tells the agent how to behave for _this_ challenge, including learning themes and prohibited reveals (canonical topology, specific component requirements, solution-only thresholds).
- **Human focus as a tool.** `get_session_focus` is how the agent finds out you clicked the primary in `us-east`. We don't push chat messages into the host.
- **No architecture-editing tools.** That was a deliberate non-feature. Limited freedom is the catalog.
- **Simulator, not the model, is truth.** Agents interpret simulator evidence; they do not own official pass/fail. Submissions ignore browser-provided metrics and re-run the shared simulator on the server.

If you want the exact tool catalog and the competitor system prompt, see [`docs/WEBMCP.md`](docs/WEBMCP.md) and [`docs/WEBMCP_COMPETITION.md`](docs/WEBMCP_COMPETITION.md).

### Try it with an agent

1. Open **[https://syslab-9ys7.vercel.app/](https://syslab-9ys7.vercel.app/)** in ChatGPT's in-app browser, or Chrome with WebMCP testing enabled.
2. Play Level 1. Confirm the top-bar plate says **Agent ready**.
3. Connect your agent. Ask it to call `get_coaching_policy`, then look at your design.
4. Select a component, click a help chip, and see if it inspects before it talks.

---

## Local development

```sh
pnpm install
pnpm dev
```

App runs at `http://localhost:3000`.

```sh
pnpm typecheck
pnpm build
```

Agent starting points: [`AGENTS.md`](AGENTS.md), [`docs/CODEX.md`](docs/CODEX.md).
