import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { createPresentationCue, type PresentationCue } from "../presentation-cue.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";

export interface StartDesignInterviewInput {
  readonly step: number;
}

export interface DesignInterviewQuestion {
  readonly questionId: string;
  readonly ordinal: number;
  readonly label: string;
  readonly componentIds: readonly string[];
  readonly question: string;
  readonly grouped: boolean;
  readonly phase: "opening" | "component";
}

export interface StartDesignInterviewOutput {
  readonly interviewVersion: "design-interview-2";
  readonly phase: "opening" | "component";
  readonly step: number;
  readonly totalQuestions: number;
  readonly questionId: string;
  readonly architectureRevision: string;
  readonly question: string;
  readonly agenda: readonly DesignInterviewQuestion[];
  readonly componentIds: readonly string[];
  readonly grouped: boolean;
  readonly presentationCue?: PresentationCue;
  readonly suggestedNextTools: readonly { readonly name: string; readonly reason: string }[];
}

export const startDesignInterviewInputSchema: AgentCapability<
  AgentContext,
  StartDesignInterviewInput,
  CapabilityResult<StartDesignInterviewOutput>
>["inputSchema"] = {
  jsonSchema: {
    type: "object",
    properties: { step: { type: "number", minimum: 0, maximum: 100 } },
    additionalProperties: false,
  },
  safeParse(input) {
    if (input === undefined || input === null) {
      return { success: true as const, data: { step: 0 } };
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false as const, errors: ["start_design_interview input must be an object."] };
    }
    const record = input as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "step")) {
      return { success: false as const, errors: ["start_design_interview input contains unknown properties."] };
    }
    if (record.step === undefined) {
      return { success: true as const, data: { step: 0 } };
    }
    if (typeof record.step !== "number" || !Number.isInteger(record.step) || record.step < 0 || record.step > 100) {
      return { success: false as const, errors: ["step must be an integer between 0 and 100."] };
    }
    return { success: true as const, data: { step: record.step } };
  },
};

const openingQuestions: readonly DesignInterviewQuestion[] = [
  {
    questionId: "opening-1",
    ordinal: 1,
    phase: "opening",
    label: "Request path",
    componentIds: [],
    grouped: false,
    question: "Walk me through the request path from the user to the system and explain the main design decisions.",
  },
  {
    questionId: "opening-2",
    ordinal: 2,
    phase: "opening",
    label: "Failure investigation",
    componentIds: [],
    grouped: false,
    question: "What are the first components or dependencies you would investigate under a traffic spike or partial failure, and why?",
  },
  {
    questionId: "opening-3",
    ordinal: 3,
    phase: "opening",
    label: "Design tradeoff",
    componentIds: [],
    grouped: false,
    question: "Which tradeoff did you make between performance, reliability, operational complexity, and cost?",
  },
] as const;

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

export function buildStartDesignInterviewOutput(
  context: AgentContext,
  input: StartDesignInterviewInput,
): CapabilityResult<StartDesignInterviewOutput> {
  const agenda = buildAgenda(context);
  const questions = [...openingQuestions, ...agenda];
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
    interviewVersion: "design-interview-2",
    phase: item.phase,
    step: input.step,
    totalQuestions,
    questionId: item.questionId,
    architectureRevision: evidenceRevision,
    question: item.question,
    agenda,
    componentIds: item.componentIds,
    grouped: item.grouped,
    ...(presentationCue ? { presentationCue } : {}),
    suggestedNextTools:
      input.step < totalQuestions - 1
        ? [{ name: "start_design_interview", reason: "Advance to the next interview question after the player is ready." }]
        : [{ name: "get_metrics", reason: "Ground the closing discussion in current simulator evidence." }],
  });
}

export const startDesignInterviewCapability: AgentCapability<
  AgentContext,
  StartDesignInterviewInput,
  CapabilityResult<StartDesignInterviewOutput>
> = {
  name: "start_design_interview",
  description:
    "Call when the player asks to be interviewed on their design. Returns one stable-ID question at a time: three high-level questions followed by one question per component while visually focusing that component; stateless service instances are grouped.",
  inputSchema: startDesignInterviewInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return buildStartDesignInterviewOutput(context, input);
  },
};
