export * from "./registry.js";
export * from "./postgres.js";
export * from "./service.js";
export * from "./traffic-source.js";

import { createComponentRegistry } from "./registry.js";
import { postgresDefinition } from "./postgres.js";
import { serviceDefinition } from "./service.js";
import { trafficSourceDefinition } from "./traffic-source.js";

/** The registered catalog grows only as Phase 1 introduces new components. */
export const componentRegistry = createComponentRegistry([trafficSourceDefinition, serviceDefinition, postgresDefinition]);
