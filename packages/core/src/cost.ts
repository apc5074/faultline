/** A deterministic monthly estimate for one canonical architecture component. */
export interface CostLineItem {
  componentId: string;
  amount: number;
}

/** Shared cost output consumed by simulation, UI, and eventual server verification. */
export interface CostResult {
  monthlyTotal: number;
  lineItems: readonly CostLineItem[];
}
