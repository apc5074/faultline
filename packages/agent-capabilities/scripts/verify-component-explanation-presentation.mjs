import assert from "node:assert/strict";

import {
  COMPONENT_EXPLANATION_PRESENTATION_VERSION,
  createComponentExplanationPresentation,
  isMatchingVisualApplicationReceipt,
} from "../dist/index.js";

const command = createComponentExplanationPresentation({
  commandId: "opaque-command-1",
  componentId: "postgres-1",
  evidenceRevision: "architecture-a",
  sessionRevision: 7,
});

assert.equal(command.contractVersion, COMPONENT_EXPLANATION_PRESENTATION_VERSION);
assert.equal(command.kind, "focus_component");
assert.equal(command.component.kind, "component");
assert.equal(command.component.entityId, "postgres-1");
assert.equal(command.component.evidenceRevision, "architecture-a");

const receipt = {
  contractVersion: COMPONENT_EXPLANATION_PRESENTATION_VERSION,
  commandId: "opaque-command-1",
  componentId: "postgres-1",
  evidenceRevision: "architecture-a",
  appliedSessionRevision: 8,
  status: "applied",
};
assert.equal(isMatchingVisualApplicationReceipt(command, receipt), true);
assert.equal(isMatchingVisualApplicationReceipt(command, { ...receipt, commandId: "other" }), false);
assert.equal(isMatchingVisualApplicationReceipt(command, { ...receipt, componentId: "service-1" }), false);
assert.equal(isMatchingVisualApplicationReceipt(command, { ...receipt, evidenceRevision: "architecture-b" }), false);
assert.equal(isMatchingVisualApplicationReceipt(command, { ...receipt, appliedSessionRevision: 6 }), false);
assert.equal(isMatchingVisualApplicationReceipt(command, { ...receipt, status: "rejected" }), false);

console.log("verify-component-explanation-presentation: ok");
