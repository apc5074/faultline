import type { AgentCapability } from "./capability.js";
import { noInputSchema } from "./schemas.js";

interface ExampleContext {
  enabled: boolean;
}

// Compile-only contract check; this is not registered or exposed as a tool.
const exampleCapability: AgentCapability<ExampleContext, undefined, { available: boolean }> = {
  name: "example_compile_check",
  description: "Internal compile-only example.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: (context) => context.enabled,
  execute: (context) => ({ available: context.enabled }),
  annotations: { readOnlyHint: true },
};

void exampleCapability;
