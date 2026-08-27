import type { AgentCapability } from "../capability.js";
import type { CapabilityExecutionOptions } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import {
  createEmptyAgentSessionState,
  prunePendingHelpRequestAgainstArchitecture,
  pruneSessionFocusAgainstArchitecture,
  type AgentPendingHelpRequest,
  type AgentSessionFocus,
  type AgentSessionState,
} from "../session.js";
import { noInputSchema } from "../schemas.js";

/** Human intent surfaced to external agents: canvas focus and pending help. */
export interface GetSessionFocusOutput {
  readonly focus: AgentSessionFocus;
  readonly pendingHelpRequest: AgentPendingHelpRequest | null;
  readonly selectedComponentId?: string;
  readonly revision: number;
}

export function buildGetSessionFocusOutput(
  context: AgentContext,
  session: AgentSessionState,
): GetSessionFocusOutput {
  const focus = pruneSessionFocusAgainstArchitecture(session.focus, context.architecture);
  const pendingHelpRequest = prunePendingHelpRequestAgainstArchitecture(
    session.pendingHelpRequest,
    context.architecture,
  );

  return {
    focus,
    pendingHelpRequest,
    ...(focus.kind === "component" ? { selectedComponentId: focus.componentId } : {}),
    revision: session.revision,
  };
}

function sessionFromOptions(options?: CapabilityExecutionOptions): AgentSessionState {
  return options?.session ?? createEmptyAgentSessionState();
}

/**
 * Read the player's current canvas focus and any pending help request.
 * Does not consume pending help; poll after the player clicks a help chip.
 */
export const getSessionFocusCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetSessionFocusOutput>
> = {
  name: "get_session_focus",
  description:
    "Read human canvas focus and any pending help request from selection or help chips. Poll after the player asks for help; does not clear pending help.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, _input, options) {
    return capabilityOk(buildGetSessionFocusOutput(context, sessionFromOptions(options)));
  },
};
