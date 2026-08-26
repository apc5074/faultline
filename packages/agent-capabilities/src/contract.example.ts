import type { AgentCapability } from "./capability.js";

interface ExampleContext {
  enabled: boolean;
}

const noInputSchema = {
  safeParse(input: unknown) {
    return input === undefined
      ? { success: true as const, data: undefined }
      : { success: false as const, errors: ["This capability accepts no input."] };
  },
};

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
