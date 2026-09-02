# Design interview contract

Faultline’s v2 design interview is a browser-local, exactly five-question
coaching session. The contracts are `design-interview-4` and
`design-interview-orchestration-3`. Faultline owns routing, order, eligibility,
scenario calibration, simulator truth, state transitions, and completion.

The stable slots are `request-path-v2`, `component-justification-v2`,
`live-scale-v2`, `challenge-edge-case-v2`, and `live-failure-v2`. The first,
second, and fourth slots are answered in chat; the third and fifth are editable,
simulator-grounded canvas exercises. Q1, Q2, and Q4 advance atomically after a
valid stored critique. Q3 and Q5 advance only after a passing coaching
objective and a digest-bound critique. There is no readiness turn or hidden
sixth question.

Start performs a bounded preflight against the current architecture, trusted
Level Profile starter snapshot, challenge, registry, and simulator. Missing
player-added candidates or safe live scenarios produce one friendly preparation
action and no half-started session. Active v2 sessions resume; stale versions
require a fresh preflight. An active variable-length v3 agenda is archived or
explicitly restarted, never coerced into v2.

Dynamic selection is restricted to verified candidate cards and approved probe
angles. The model may phrase within a selected card but cannot invent targets,
scenarios, load, success conditions, metrics, rubrics, or future questions.
Invalid or absent selection uses deterministic fallback. Live scenarios are
coaching objectives, ignore official budget and requirements, and must be
proven solvable by hidden calibration. Scaling is limited to the early-career
1.25×–1.5× range; failure targets only simulator-modeled component failures.

Semantic edits refresh the current unanswered question and reject stale answer
submissions; completed slots remain sealed. UI-only state is never interview or
simulator input. Live preview and animation use simulator-issued evidence,
keep the canvas editable, and persist failure marks until a semantic fix.

The production operations are `start_design_interview`,
`get_design_interview`, `select_interview_question`,
`submit_interview_answer`, `follow_up_design_interview`,
`review_live_interview_scenario`, `submit_live_interview_critique`,
`end_design_interview`, and `restart_design_interview`.
`advance_design_interview` and the former simulation-review names are retired.
Targeted component explanations require a matching focus/render acknowledgement
before evidence is released. Agents explain returned evidence; they never edit
architecture, submit official attempts, or decide official pass/fail.
