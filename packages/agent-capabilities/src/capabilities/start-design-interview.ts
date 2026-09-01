import type { AgentCapability, CapabilityExecutionOptions } from "../capability.js";
import type { AgentContext } from "../context.js";
import type { ExperimentDefinition } from "@faultline/core";
import type { InterviewServiceSnapshot } from "../interview-service-port.js";
import { createPresentationCue, type PresentationCue } from "../presentation-cue.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";

export interface BuildStartDesignInterviewInput {
  readonly step: number;
  readonly baselineArchitectureRevision?: string;
}

export type StartDesignInterviewInput = Record<string, never>;

export interface DesignInterviewQuestion {
  readonly kind: "discussion" | "component" | "simulation";
  readonly questionId: string;
  readonly ordinal: number;
  readonly label: string;
  readonly componentIds: readonly string[];
  readonly question: string;
  readonly grouped: boolean;
  readonly phase: "opening" | "component" | "simulation";
  readonly focus?: string;
  readonly contextSignals?: readonly string[];
  readonly scenario?: ExperimentDefinition;
  readonly sourceChallengeId?: string;
  readonly baselineArchitectureRevision?: string;
}

export interface StartDesignInterviewOutput {
  readonly interviewVersion: "design-interview-3";
  readonly phase: "opening" | "component" | "simulation";
  readonly step: number;
  readonly totalQuestions: number;
  readonly questionId: string;
  readonly architectureRevision: string;
  readonly question: string;
  readonly componentIds: readonly string[];
  readonly grouped: boolean;
  readonly focus?: string;
  readonly contextSignals?: readonly string[];
  readonly presentationCue?: PresentationCue;
  readonly suggestedNextTools: readonly { readonly name: string; readonly reason: string }[];
  readonly scenario?: ExperimentDefinition;
  readonly sourceChallengeId?: string;
  readonly baselineArchitectureRevision?: string;
}

export const startDesignInterviewInputSchema: AgentCapability<
  AgentContext,
  StartDesignInterviewInput,
  CapabilityResult<StartDesignInterviewOutput>
>["inputSchema"] = {
  jsonSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  safeParse(input) {
    if (input === undefined || input === null) {
      return { success: true as const, data: {} };
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false as const, errors: ["start_design_interview input must be an object."] };
    }
    const record = input as Record<string, unknown>;
    if (Object.keys(record).length > 0) {
      return { success: false as const, errors: ["start_design_interview input contains unknown properties."] };
    }
    return { success: true as const, data: {} };
  },
};

const openingQuestions: readonly DesignInterviewQuestion[] = [
  {
    kind: "discussion",
    questionId: "opening-1",
    ordinal: 1,
    phase: "opening",
    label: "Request path",
    componentIds: [],
    grouped: false,
    question: "Walk me through the request path from the user to the system and explain the main design decisions.",
  },
  {
    kind: "discussion",
    questionId: "opening-2",
    ordinal: 2,
    phase: "opening",
    label: "Failure investigation",
    componentIds: [],
    grouped: false,
    question: "What are the first components or dependencies you would investigate under a traffic spike or partial failure, and why?",
  },
  {
    kind: "discussion",
    questionId: "opening-3",
    ordinal: 3,
    phase: "opening",
    label: "Design tradeoff",
    componentIds: [],
    grouped: false,
    question: "Which tradeoff did you make between performance, reliability, operational complexity, and cost?",
  },
] as const;

function openingQuestionsFor(context: AgentContext): readonly DesignInterviewQuestion[] {
  const components = context.architecture.components;
  const connections = context.architecture.connections;
  const workload = context.challenge.workload ?? { requestsPerSecond: 0, readRatio: 0 };
  const requirementSignals = (context.challenge.requirements ?? []).map((requirement) => requirement.label).slice(0, 4);
  const workloadSignals = [
    `${workload.requestsPerSecond} requests/sec`,
    `${Math.round(workload.readRatio * 100)}% reads`,
    ...(workload.hotKeyReadFraction !== undefined ? [`${Math.round(workload.hotKeyReadFraction * 100)}% hot-key reads`] : []),
  ];
  return [
    { ...openingQuestions[0]!, focus: "Trace one representative request through the current architecture and probe the highest-impact boundary or dependency.", contextSignals: [`${components.length} components`, `${connections.length} connections`, ...workloadSignals] },
    { ...openingQuestions[1]!, focus: "Probe the most important scaling, failure, or dependency-isolation decision suggested by this workload and architecture.", contextSignals: [...workloadSignals, `${components.filter((component) => component.type === "service").length} services`, `${components.filter((component) => component.type === "postgres").length} databases`] },
    { ...openingQuestions[2]!, focus: "Probe one concrete performance, reliability, operational-complexity, or cost tradeoff that matters for this challenge.", contextSignals: [...requirementSignals, ...(context.challenge.monthlyBudget !== undefined ? [`monthly budget $${context.challenge.monthlyBudget}`] : []), ...workloadSignals] },
  ];
}

function componentLabel(type: string, count: number): string {
  if (type === "service" && count > 1) return String(count) + " stateless services";
  return count > 1 ? String(count) + " " + type + " components" : type;
}

function componentQuestion(type: string, count: number): string {
  if (type === "service" && count > 1) {
    return "You have " + String(count) + " stateless service instances here. What responsibility do they share, how does traffic distribute across them, and how would you scale or isolate them?";
  }
  return "What responsibility does this " + type + " have, what assumptions does it make about its neighbors, and how would you operate it under growth or failure?";
}

function buildAgenda(context: AgentContext): readonly DesignInterviewQuestion[] {
  const components = context.architecture.components;
  const serviceIds = components
    .filter((component) => component.type === "service")
    .map((component) => component.id);
  let emittedServiceGroup = false;
  const agenda: DesignInterviewQuestion[] = [];

  for (const component of components) {
    if (component.type === "service" && serviceIds.length > 1) {
      if (emittedServiceGroup) continue;
      emittedServiceGroup = true;
      agenda.push({
        kind: "component",
        questionId: "component-services",
        ordinal: openingQuestions.length + agenda.length + 1,
        phase: "component",
        label: componentLabel("service", serviceIds.length),
        componentIds: serviceIds,
        question: componentQuestion("service", serviceIds.length),
        grouped: true,
      });
      continue;
    }
    agenda.push({
      kind: "component",
      questionId: "component-" + component.id,
      ordinal: openingQuestions.length + agenda.length + 1,
      phase: "component",
      label: componentLabel(component.type, 1),
      componentIds: [component.id],
      question: componentQuestion(component.type, 1),
      grouped: false,
    });
  }
  return agenda;
}

export function buildSimulationInterviewQuestion(
  context: AgentContext,
  baselineArchitectureRevision = context.evidenceMeta?.architectureRevision ?? "unversioned",
): DesignInterviewQuestion {
  const originalRps = context.challenge.workload?.requestsPerSecond ?? 0;
  const doubledRps = originalRps * 2;
  const requirementLabels = (context.challenge.requirements ?? []).map((requirement) => requirement.label).slice(0, 6);
  const requirementText = requirementLabels.length > 0 ? ` Active requirements: ${requirementLabels.join(", ")}.` : "";
  return {
    kind: "simulation",
    questionId: "simulation-traffic-double-v1",
    ordinal: 0,
    phase: "simulation",
    label: "Doubled demand redesign",
    componentIds: [],
    grouped: false,
    question: `Demand has doubled from ${originalRps} to ${doubledRps} requests/sec while the original latency, reliability, and budget requirements still apply. Change the actual design on the canvas to handle the new condition. You may add, remove, connect, deploy, or reconfigure components. When you are satisfied, tell me: “Review my redesign.”${requirementText}`,
    scenario: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
    sourceChallengeId: context.challenge.slug,
    baselineArchitectureRevision,
  };
}

export function buildStartDesignInterviewOutput(
  context: AgentContext,
  input: BuildStartDesignInterviewInput,
): CapabilityResult<StartDesignInterviewOutput> {
  const agenda = buildAgenda(context);
  const simulationQuestion = buildSimulationInterviewQuestion(context, input.baselineArchitectureRevision);
  const questions = [...openingQuestionsFor(context), ...agenda, { ...simulationQuestion, ordinal: openingQuestions.length + agenda.length + 1 }];
  const totalQuestions = questions.length;
  if (input.step >= totalQuestions) {
    return capabilityError("INVALID_INPUT", "Interview step must be between 0 and " + String(totalQuestions - 1) + ".");
  }

  const item = questions[input.step]!;
  const evidenceRevision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  const presentationCue = item.phase === "component" ? createPresentationCue(
    {
      kind: item.componentIds.length > 1 ? "set" : "spotlight",
      targets: item.componentIds,
      primaryTarget: item.componentIds[0],
      reason: "finding",
      camera: item.componentIds.length > 1 ? "frame-set" : "frame-primary",
    },
    evidenceRevision,
    { component: context.architecture.components.map((component) => component.id) },
  ) : undefined;

  return capabilityOk({
    interviewVersion: "design-interview-3",
    phase: item.phase,
    step: input.step,
    totalQuestions,
    questionId: item.questionId,
    architectureRevision: evidenceRevision,
    question: item.question,
    componentIds: item.componentIds,
    grouped: item.grouped,
    ...(item.focus ? { focus: item.focus } : {}),
    ...(item.contextSignals ? { contextSignals: item.contextSignals } : {}),
    ...(presentationCue ? { presentationCue } : {}),
    suggestedNextTools:
      input.step < totalQuestions - 1
        ? [{ name: "start_design_interview", reason: "Advance to the next interview question after the player is ready." }]
        : [{ name: "get_metrics", reason: "Ground the closing discussion in current simulator evidence." }],
    ...(item.scenario ? { scenario: item.scenario } : {}),
    ...(item.sourceChallengeId ? { sourceChallengeId: item.sourceChallengeId } : {}),
    ...(item.baselineArchitectureRevision ? { baselineArchitectureRevision: item.baselineArchitectureRevision } : {}),
  });
}

export const startDesignInterviewCapability: AgentCapability<
  AgentContext,
  StartDesignInterviewInput,
  CapabilityResult<InterviewServiceSnapshot>
> = {
  name: "start_design_interview",
  description:
    "Call when the player asks to be interviewed on their design. Returns one stable-ID question at a time: three high-level questions followed by one question per component while visually focusing that component; stateless service instances are grouped.",
  inputSchema: startDesignInterviewInputSchema,
  mode: "session",
  availableWhen: () => true,
  annotations: {
    idempotentHint: true,
  },
  async execute(context, _input, options?: CapabilityExecutionOptions) {
    if (!options?.interviewService) return capabilityError("NOT_FOUND", "Interview session is unavailable in this host.");
    const snapshot = await options.interviewService.start(context);
    return capabilityOk(snapshot);
  },
};
