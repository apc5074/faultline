export * from "./registry.js";
export * from "./cdn.js";
export * from "./global-router.js";
export * from "./load-balancer.js";
export * from "./postgres.js";
export * from "./redis.js";
export * from "./service.js";
export * from "./traffic-source.js";
export * from "./object-storage.js";
export * from "./queue.js";
export * from "./worker.js";

import { createComponentRegistry } from "./registry.js";
import { cdnDefinition } from "./cdn.js";
import { globalRouterDefinition } from "./global-router.js";
import { loadBalancerDefinition } from "./load-balancer.js";
import { postgresDefinition } from "./postgres.js";
import { redisDefinition } from "./redis.js";
import { serviceDefinition } from "./service.js";
import { trafficSourceDefinition } from "./traffic-source.js";
import { objectStorageDefinition } from "./object-storage.js";
import { queueDefinition } from "./queue.js";
import { workerDefinition } from "./worker.js";

/** The single registered catalog shared by architecture validation and adapters. */
export const componentRegistry = createComponentRegistry([
  trafficSourceDefinition,
  serviceDefinition,
  postgresDefinition,
  redisDefinition,
  globalRouterDefinition,
  loadBalancerDefinition,
  cdnDefinition,
  objectStorageDefinition,
  queueDefinition,
  workerDefinition,
]);
