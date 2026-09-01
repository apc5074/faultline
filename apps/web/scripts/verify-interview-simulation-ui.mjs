import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../features/agent-session/InterviewStatusPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

for (const copy of [
  "Changed condition: traffic is doubled (2× workload).",
  "Edit the canvas—your architecture is the answer.",
  "Review my redesign.",
  "No redesign yet",
  "Redesign detected",
  "Review prepared from the current redesign",
  "Interview complete",
  "questions answered",
  "not an official submission",
  "Restart interview",
  "Dismiss and clear",
  "navigator.clipboard.writeText",
]) {
  if (!panel.includes(copy)) throw new Error(`Missing interview UI copy or behavior: ${copy}`);
}

for (const selector of [
  ".interview-status-panel__simulation-note",
  ".interview-status-panel__completion",
  ".interview-status-panel__metrics",
  ".interview-status-panel__actions",
]) {
  if (!css.includes(selector)) throw new Error(`Missing interview UI styling: ${selector}`);
}

if (panel.includes("run_load_test") || panel.includes("submitSimulationCritique(context")) {
  throw new Error("Simulation UI must not invoke standalone experiments or silently submit critique.");
}

console.log("interview simulation UI verified");
