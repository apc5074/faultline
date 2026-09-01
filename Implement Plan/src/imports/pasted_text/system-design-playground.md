Design the visual system and interaction model for an interactive system-design playground: users drag infrastructure components onto a canvas, connect them, configure them, press Run, and watch simulated traffic move through what they built.

North star: a patent drawing of a marble run. The precision of a technical pen illustration; the tactility of a well-made construction toy. The interface is a still engineering drawing when paused and a working machine when running. All playfulness comes from physical-feeling interaction and truthful system behavior — never from decoration.

Ink laws (absolute)
Paper and ink only. Warm off-white paper. One near-black ink. Three line weights: hairline (interior detail, grid), standard (outlines, edges), heavy (selection, overload). No gradients, no blur, no drop shadows, no rounded-card SaaS chrome. Depth is expressed only as an offset duplicate outline — like a paper cutout lifted off the sheet.
One signal color. A single red appears only on failed or failing components, their ports, and rejected packets. If anything else is red, the design is wrong.
Typography. One grotesk or monospace family, two weights. Small-cap labels set beneath components, never inside them. All live metrics use tabular numerals so running numbers don't jitter.
Motion is evidence. Nothing moves unless the simulation emitted an event. No idle loops, no ambient drift, no decorative pulses. A paused architecture is a completely still drawing.
The component grammar
Every component is built from the same four-part anatomy:

Silhouette — recognizable at 24px without its label. Shape encodes function class.
Mechanism — the interior drawing where state lives. Utilization, capacity, depth, and replication are drawn in the mechanism, never as text badges.
Ports — one identical circle everywhere. Inputs left, outputs right. Empty port: outline. Connected: filled. Failed: red ×.
State layer — every component ships in five states: idle (still drawing), selected (heavy outline + corner registration ticks, like crop marks — never a bounding box with resize handles), processing (the mechanism moves while a packet dwells inside), overloaded (all interior capacity filled, heavier outline, a short holding spur of waiting packets forms at the input), failed (diagonal hatch fill, dashed outline, closed ports, red).
Commit to these metaphors — one per component, no alternates:

Server / Compute — an upright chassis containing a grid of core cells. A packet parks in a free core; the core fills while it works. Multiple instances are drawn as stacked plates offset behind the chassis, like paper layers — never the text "instances: 4". Autoscaling slides a new plate in mid-run.
Load Balancer — a wedge, narrow at the input and fanned at the output edge, with a pivoting pointer arm at the apex. One packet enters; the arm snaps to the chosen output; the packet exits exactly one port. Routing algorithm changes the arm's motion pattern (round-robin steps sequentially; least-connections sweeps to the quietest line). Adding servers adds output ports on the wide edge.
Redis / Cache — a square filled with a dense grid of small memory cells, like an ice tray. Hit: the addressed cell fills for an instant and the response leaves immediately — near-zero dwell, the fastest transaction in the whole system. Miss: a cell flickers empty and the request exits the far side toward storage. Capacity adds and removes cells.
SQL Database — the classic cylinder, earned: stacked disks with horizontal row lines and a heavier base line. A read lifts one row briefly; a write sets a row permanently. Its dwell is the longest in the system — packets visibly park here, which makes database bottlenecks emerge on their own. Replicas are ghost cylinders behind the primary, joined by a hairline sync edge that small packets traverse after each write.
NoSQL Database — a rectangle containing staggered index-card outlines of varying widths: documents, not rows. A read slides one card out and back; a write slides one in. Irregular cards versus uniform rows is the entire SQL/NoSQL distinction, stated visually.
Queue — a long horizontal channel segmented into slots. Packets physically sit in the slots and advance toward the consumer end. Depth is legible at a glance. Capacity changes the slot count. At overflow, packets are turned away at the mouth. The Queue is the only component whose job is backlog — everywhere else, backlog is a symptom.
Pub/Sub — a circular hub with ports radiating and a ring inside. An event enters; the ring flashes once; an event exits every output simultaneously. The Load Balancer's pointer chooses one; the hub pulses all. That contrast is the lesson.
CDN — a perforated boundary band containing cache cells, placed at the edge between users and infrastructure. Hit: the packet rebounds off a cell and the origin stays silent. Miss: the packet passes through a gate in the band and continues. Its placement is its meaning.
Object Storage — a bin. Writes drop in and rest, stacking from the bottom; reads are slow and occasional. Its stillness is its character — cold storage.
API Gateway — a narrow gate with a barrier arm. Every packet dwells at the arm while it lifts, passes, and falls. Under rate limiting the arm stays down: a holding spur forms and excess packets are turned away.
DNS — a ledger. A request arrives, one row flips, and the answer returns immediately, pointing the way. Fast like Redis, but for directions — the book silhouette keeps them unmistakable.
User origin — a plain labeled disc where packets are born and where responses die.
Canvas and connections
The canvas is warm paper with a visible dot grid. Edges route orthogonally — schematic right-angle elbows, parallel edges offset, crossings hop. Idle edges are hairline; while running, edge weight thickens with live load. Nothing curvy, ever.

Drag: the component lifts via its offset outline, follows the cursor precisely, and the grid magnetically attracts it. Region boundaries quietly wake as it approaches.
Drop: one 2px settle, ~100ms, no bounce. A brief outline emphasis, then the ports fade in. Adding a piece should feel like setting a part into a chassis.
Connect: dragging from a port reveals all compatible ports; valid targets get a second ring, invalid targets fade. The pending edge is dashed and routes orthogonally. On completion the elbows draw in and a single pulse travels the new edge once. Then it goes quiet.
Rearrange: edges re-route live, staying schematic. The whole architecture should feel physically manipulable.
Delete: the component lifts, its edges peel back in reverse, and it's gone. Deleted under traffic, in-flight packets visibly U-turn and reroute — deletion is a lesson, not a confirmation dialog.
Empty state: dot grid, a slim left rail of component glyphs grouped by category, and one hairline line of guidance. Silence until the user acts.
Traffic and motion grammar
Traffic is monochrome; shape carries meaning, not color: request = small outline square; response = small filled square; write = square with an internal bar; event = small triangle; rejected/failed = a small × that halts.

One speed. All packets travel at the same velocity. Latency is expressed as dwell inside mechanisms; distance is expressed as path length. Cache hits are fast because Redis barely holds the packet; databases are slow because packets park there; cross-region traffic is slow because the route is physically longer.
Causal order is sacred. A downstream effect never begins before its upstream packet physically arrives. Responses retrace the exact request path. A completed request's route lingers as a fading hairline for a moment — the user should be able to watch one request's full round trip and narrate it.
Honest abstraction. Low traffic: individual packets. Medium: small spaced groups. High: edges become streams whose weight carries the volume. Never fake per-request precision at scale; never render chaos.
Processing is mechanism motion plus dwell — cores fill, the pointer swings, a row lifts, a card slides. Never spinners.
Simulation controls
One calm bar: Run (fills solid while running), Pause, Step, Reset, a 0.5/1/2× speed switch, and the view toggle.

Run is the ritual: components wake in dependency order with a brief stagger, a beat passes, the first packet is born at the origin. Only the system comes alive — never the interface chrome.
Pause lets in-flight packets complete to their next node and park there. Nothing freezes mid-edge.
Step advances exactly one event. It exists because causal order is the product's core lesson.
Reset drains all packets and returns every mechanism to empty.
Regions and world view
Regions (us-east, eu-west…) are dashed hairline enclosures with small-cap labels — zones drawn on the paper, never cards. Dropping a component into one gives a single settle and the faintest sense of belonging. Cross-region edges stay the same ink; their length teaches the latency.

An Architecture | World toggle switches between "what did I build" and "how does traffic reach it." World view is the same paper: coastlines as hairline contours (abstract, not cartographic), origin cities as labeled dots, regions as dashed enclosures, CDN bands sitting near the origins, packets traveling the routes at the same constant speed. No map tiles, no map chrome.

Inspector — the data plate
Clicking a component strengthens its outline with corner ticks and opens a slim right panel styled like the data plate riveted to industrial equipment — not a settings form.

Structure: header with the component's glyph and inline-renamable name; a Machine section whose controls physically alter the drawing (server instances add stacked plates; Redis capacity adds cells; queue depth adds slots; database replication adds a ghost cylinder); a Behavior section with the few policy controls that matter; a Live strip of tabular numerals (requests/sec, latency, hit rate) — numbers only, no charts. Everything else sits behind a single collapsed Advanced divider.

The test for every setting: if changing it can't change the drawing, it belongs in Advanced. The user should feel they are tuning a machine, not filing paperwork. Controls are steppers, segmented controls, short sliders, and switches — compact, engraved, precise.

Semantic zoom
Zoomed out, components reduce to pure silhouette plus state (idle/processing/overloaded/failed), labels hide, traffic becomes streams. Zoomed in, full mechanism detail returns. The architecture must stay readable with thirty components on the paper.

Hero scene
Ship one complete example architecture across two regions: Users → CDN → Load Balancer → three Servers → Redis → SQL Database, plus a Queue feeding a worker. Demonstrate, in this order: CDN hit, CDN miss, load balancing, Redis hit, Redis miss, database query, queue buildup and drain, server overload, cross-region traffic, component failure, and visible failover rerouting — packets already in flight hesitating, U-turning, and taking the surviving path. The failover moment is the emotional peak: the user watches their redundancy work.

Refuse
No blue/purple SaaS palettes. No cloud-vendor iconography. No glassmorphism, gradients, neon, isometric 3D, mascots, confetti, badges, or gamification chrome. No modal configuration dialogs. No bezier spaghetti. No animation that doesn't correspond to a simulated event. If a design element doesn't help the user read the system, remove it.

Deliverables
Canvas, dot grid, empty state, and palette rail
Component family sheet — all twelve glyphs at rest, side by side, proving silhouette differentiation
States sheet — idle / selected / processing / overloaded / failed for every component
The drag → drop → connect sequence, frame by frame
Traffic particle spec and the six motion sequences: cache hit, cache miss, load balancing, queue buildup, pub/sub broadcast, failover rerouting
Inspector as data plate — Server, Redis, and one of Database or Queue
Region enclosures and cross-region edge treatment
World view
Simulation control bar in idle, running, and paused states
The hero scene as a finished still
Optimize in this order: satisfying to manipulate → easy to understand → meaningful motion → memorable silhouettes → visual simplicity → technical credibility.

The final product should feel like a beautifully engineered instrument made of paper and ink — quiet at rest, unmistakably alive the moment the user presses Run.

