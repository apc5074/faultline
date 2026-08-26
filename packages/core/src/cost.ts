/**
 * A deterministic monthly cost line.
 * Component charges use a real canvas `componentId`.
 * Transfer / replication charges use a stable synthetic id plus `label`.
 */
export interface CostLineItem {
  componentId: string;
  amount: number;
  /** Display label when `componentId` is not a canvas component (e.g. cross-region transfer). */
  label?: string;
}

/** Shared cost output consumed by simulation, UI, and eventual server verification. */
export interface CostResult {
  monthlyTotal: number;
  lineItems: readonly CostLineItem[];
}
