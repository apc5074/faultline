import type { CapabilityInputSchema } from "./capability.js";

/** Shared schema for read capabilities that take no tool arguments. */
export const noInputSchema: CapabilityInputSchema<undefined> = {
  safeParse(input: unknown) {
    if (input === undefined || input === null) {
      return { success: true as const, data: undefined };
    }
    if (typeof input === "object" && !Array.isArray(input) && Object.keys(input as object).length === 0) {
      return { success: true as const, data: undefined };
    }
    return { success: false as const, errors: ["This capability accepts no input."] };
  },
};
