import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabasePublicConfig } from "@/lib/supabase/server";

export type AccountLinkOutcome = "started" | "linked" | "conflict" | "failed" | "cancelled";

/** Best-effort audit write; never blocks player-facing auth flows. */
export async function recordAccountLinkAttempt(
  sourceUserId: string,
  outcome: AccountLinkOutcome,
): Promise<void> {
  if (!getSupabasePublicConfig()) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) return;

  try {
    const service = createSupabaseServiceClient();
    await service.from("account_link_attempts").insert({
      source_user_id: sourceUserId,
      outcome,
    });
  } catch {
    // Audit is diagnostic only.
  }
}
