import "server-only";

import type {
  InterviewEvent,
  InterviewState,
  InterviewStatus,
} from "@faultline/agent-capabilities";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type StoredDesignInterview = {
  readonly id: string;
  readonly userId: string;
  readonly state: InterviewState;
  readonly status: InterviewStatus;
  readonly currentQuestionId: string | null;
  readonly questionOrdinal: number;
  readonly totalQuestions: number;
  readonly stateRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateDesignInterviewInput = {
  readonly userId: string;
  readonly state: InterviewState;
};

export type CommitDesignInterviewInput = {
  readonly userId: string;
  readonly interviewId: string;
  readonly expectedRevision: number;
  readonly eventId: string;
  readonly event: InterviewEvent;
  readonly state: InterviewState;
};

export class DesignInterviewPersistError extends Error {
  override name = "DesignInterviewPersistError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "not_found" | "conflict" | "persist_failed",
  ) {
    super(message);
  }
}

type DesignInterviewRow = {
  id: string;
  user_id: string;
  state_json: unknown;
  status: InterviewStatus;
  current_question_id: string | null;
  question_ordinal: number;
  total_questions: number;
  state_revision: number | string;
  created_at: string;
  updated_at: string;
};

function asState(value: unknown): InterviewState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DesignInterviewPersistError("Stored interview state is malformed.", "persist_failed");
  }
  return value as InterviewState;
}

function mapRow(row: DesignInterviewRow): StoredDesignInterview {
  const stateRevision = Number(row.state_revision);
  if (!Number.isSafeInteger(stateRevision) || stateRevision < 0) {
    throw new DesignInterviewPersistError("Stored interview revision is malformed.", "persist_failed");
  }
  return {
    id: row.id,
    userId: row.user_id,
    state: asState(row.state_json),
    status: row.status,
    currentQuestionId: row.current_question_id,
    questionOrdinal: row.question_ordinal,
    totalQuestions: row.total_questions,
    stateRevision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventQuestionId(event: InterviewEvent): string | null {
  return "questionId" in event ? event.questionId : null;
}

function eventType(event: InterviewEvent): InterviewEvent["type"] {
  return event.type;
}

function stateProjection(state: InterviewState) {
  return {
    state_json: state,
    status: state.status,
    current_question_id: state.currentQuestion?.questionId ?? null,
    question_ordinal: state.questionOrdinal,
    total_questions: state.totalQuestions,
    completed_at: state.completedAt ?? null,
    stale_at: state.staleAt ?? null,
  };
}

/** Server-only persistence boundary. Callers must authenticate and authorize userId. */
export function createDesignInterviewRepository() {
  const supabase = createSupabaseServiceClient();

  return {
    async create(input: CreateDesignInterviewInput): Promise<StoredDesignInterview> {
      const state = input.state;
      const result = await supabase
        .from("design_interviews")
        .insert({
          user_id: input.userId,
          architecture_revision: state.architectureRevision,
          challenge_id: state.challengeId ?? null,
          ...stateProjection(state),
          started_at: state.startedAt,
        })
        .select("id, user_id, state_json, status, current_question_id, question_ordinal, total_questions, state_revision, created_at, updated_at")
        .single();

      if (result.error || !result.data) {
        throw new DesignInterviewPersistError(result.error?.message ?? "Could not create design interview.", "persist_failed");
      }
      return mapRow(result.data as DesignInterviewRow);
    },

    async get(userId: string, interviewId: string): Promise<StoredDesignInterview | null> {
      const result = await supabase
        .from("design_interviews")
        .select("id, user_id, state_json, status, current_question_id, question_ordinal, total_questions, state_revision, created_at, updated_at")
        .eq("id", interviewId)
        .eq("user_id", userId)
        .maybeSingle();

      if (result.error) {
        throw new DesignInterviewPersistError(result.error.message, "persist_failed");
      }
      return result.data ? mapRow(result.data as DesignInterviewRow) : null;
    },

    async commit(input: CommitDesignInterviewInput): Promise<number> {
      const state = input.state;
      const result = await supabase.rpc("commit_design_interview_transition", {
        p_interview_id: input.interviewId,
        p_user_id: input.userId,
        p_expected_revision: input.expectedRevision,
        p_event_id: input.eventId,
        p_event_type: eventType(input.event),
        p_question_id: eventQuestionId(input.event),
        p_actor: input.event.type === "answer" || input.event.type === "follow_up" || input.event.type === "advance" ? "user" : "system",
        p_payload: input.event,
        p_state_json: state,
        p_status: state.status,
        p_current_question_id: state.currentQuestion?.questionId ?? null,
        p_question_ordinal: state.questionOrdinal,
        p_total_questions: state.totalQuestions,
        p_completed_at: state.completedAt ?? null,
        p_stale_at: state.staleAt ?? null,
      });

      if (result.error) {
        const code = result.error.message.includes("revision conflict")
          ? "conflict"
          : result.error.message.includes("not found")
            ? "not_found"
            : "persist_failed";
        throw new DesignInterviewPersistError(result.error.message, code);
      }
      const revision = Number(result.data);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new DesignInterviewPersistError("Commit returned an invalid interview revision.", "persist_failed");
      }
      return revision;
    },
  };
}
