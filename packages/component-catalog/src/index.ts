export * from "./registry.js";
export * from "./cdn.js";
export * from "./global-router.js";
export * from "./load-balancer.js";
export * from "./postgres.js";
export * from "./redis.js";
export * from "./service.js";
export * from "./traffic-source.js";

import { createComponentRegistry } from "./registry.js";
import { cdnDefinition } from "./cdn.js";
import { globalRouterDefinition } from "./global-router.js";
import { loadBalancerDefinition } from "./load-balancer.js";
import { postgresDefinition } from "./postgres.js";
import { redisDefinition } from "./redis.js";
import { serviceDefinition } from "./service.js";
import { trafficSourceDefinition } from "./traffic-source.js";

/** The registered catalog grows only as Level 1 introduces new components. */
export const componentRegistry = createComponentRegistry([
  trafficSourceDefinition,
  serviceDefinition,
  postgresDefinition,
  redisDefinition,
  globalRouterDefinition,
  loadBalancerDefinition,
  cdnDefinition,
]);
