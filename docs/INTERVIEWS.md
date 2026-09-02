# Design interview contract

Faultline’s v2 design interview is a browser-local coaching session.
The contracts are `design-interview-4` and
`design-interview-orchestration-4`. Faultline owns routing, order, eligibility,
scenario calibration, simulator truth, state transitions, and completion.

The stable production slots are `request-path-v2`,
`component-justification-v2`, `challenge-edge-case-v2`, and `live-failure-v2`.
`live-scale-v2` is temporarily skipped (`INTERVIEW_V2_SKIP_LIVE_SCALE`) until
viral-workload scale calibration is reliable. Chat slots—including failure—
advance after a valid `submit_interview_answer` evaluation. When live scale is
enabled, that slot advances only after a passing coaching objective and a
digest-bound critique. There is no readiness turn or hidden extra question.

Start performs a bounded preflight against the current architecture, trusted
Level Profile starter snapshot, challenge, registry, and simulator. Missing
player-added candidates or safe live failure scenarios produce one friendly
preparation action and no half-started session. Active v2 sessions resume; stale versions
require a fresh preflight. An active variable-length v3 agenda is archived or
explicitly restarted, never coerced into v2.

Dynamic selection is restricted to verified candidate cards and approved probe
angles. The model may phrase within a selected card but cannot invent targets,
scenarios, load, success conditions, metrics, rubrics, or future questions.
Invalid or absent selection uses deterministic fallback. Returned chat questions
include an `assessment` packet with `requiredTopics`, `evidenceSummary`,
`evidenceBasis`, and `assessGuidance` so the agent evaluates against Faultline
evidence instead of inventing a rubric. Failure questions name the modeled
outage target, spotlight that component, and are graded in chat like the other
discussion slots—players do not edit the canvas to answer. Live scale scenarios
are coaching objectives, ignore official budget and requirements, and must be
proven solvable by hidden calibration. Scaling picks a challenge-relative demand
band where the next safe capacity edit recovers the target; failure targets only
simulator-modeled component failures.

Semantic edits refresh the current unanswered question and reject stale answer
submissions; completed slots remain sealed. UI-only state is never interview or
simulator input. Live preview and animation use simulator-issued evidence,
keep the canvas editable for scale slots, and persist failure marks until a semantic fix.

The v2 production WebMCP operations are `start_design_interview`,
`get_design_interview`, `submit_interview_answer`,
`follow_up_design_interview`, `prepare_interview_simulation_review`,
`submit_interview_simulation_critique`, `end_design_interview`, and
`restart_design_interview`. `advance_design_interview` is absent from the v2
production manifest; the older capability remains only for compatibility
consumers during migration. The desktop host uses the five-slot v2 service
adapter (`createDesignInterviewV2HostService`) with Q1–Q5 preflight; missing
player-added components or live scenarios refuse start with one preparation
action. The Q1–Q5 contracts and live review rules are
shared internally by the adapter and browser service.
Targeted component explanations require a matching focus/render acknowledgement
before evidence is released. Agents explain returned evidence; they never edit
architecture, submit official attempts, or decide official pass/fail.
