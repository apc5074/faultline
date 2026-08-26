import type { Node } from "@xyflow/react";

import type { RequirementsEvaluationResult } from "@faultline/simulator";

import type { PlaygroundNodeData } from "@/features/architecture-canvas/PlaygroundNode";

export type PlaygroundFlowNode = Node<PlaygroundNodeData, "playground">;

export type FlowConnectionLike = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

export type SimulationRunState = "idle" | "running" | "complete" | "error";

export type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;
