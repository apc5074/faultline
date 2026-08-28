import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const simBar = readFileSync(new URL("../features/architecture-canvas/SimBar.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("../features/ai-engineer/AiEngineerPanel.tsx", import.meta.url), "utf8");
const share = readFileSync(new URL("../features/official-attempt/ShareResultActions.tsx", import.meta.url), "utf8");

for (const marker of [":focus-visible", "prefers-reduced-motion: reduce", "animation-duration: 0.01ms", "transition-duration: 0.01ms"]) {
  if (!css.includes(marker)) throw new Error(`Accessibility motion rule is missing ${marker}.`);
}
if (!simBar.includes('aria-live="polite"')) throw new Error("Simulation completion status is not announced.");
if (ai.includes('className="ai-engineer__messages" aria-live') || ai.includes('className="ai-engineer__activity" aria-live')) throw new Error("Streaming AI chatter should not be a live region.");
if (!share.includes('role="status"')) throw new Error("Share success/failure status is not announced.");

console.log("Accessibility and reduced-motion checks passed.");
