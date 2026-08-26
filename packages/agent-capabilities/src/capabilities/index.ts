import { createAgentCapabilityRegistry, type AgentCapabilityRegistry } from "../registry.js";

import { getChallengeCapability } from "./get-challenge.js";

export { getChallengeCapability, buildGetChallengeOutput } from "./get-challenge.js";
export type { ChallengeSpecialScenario, GetChallengeOutput } from "./get-challenge.js";

/** Phase 5 MVP capability set. Additional CAP tickets register here. */
export function createDefaultCapabilityRegistry(): AgentCapabilityRegistry {
  return createAgentCapabilityRegistry([getChallengeCapability]);
}
