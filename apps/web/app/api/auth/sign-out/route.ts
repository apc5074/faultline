import { createSupabaseAuthAdapter } from "@/lib/auth/auth-adapter";
import { clearAccountLinkIntent } from "@/lib/auth/link-session";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type SignOutResponse =
  | { ok: true }
  | { ok: false; error: string; code: "misconfigured" | "sign_out_failed" };

/**
 * Clears the permanent session. Does not mint a new anonymous identity —
 * the player stays signed out until official play starts again.
 */
export async function POST(): Promise<Response> {
  if (!getSupabasePublicConfig()) {
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies SignOutResponse,
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const adapter = createSupabaseAuthAdapter(supabase);
  const { error } = await adapter.signOut();
  await clearAccountLinkIntent();

  if (error) {
    return Response.json(
      { ok: false, error: error.message, code: "sign_out_failed" } satisfies SignOutResponse,
      { status: 502 },
    );
  }

  return Response.json({ ok: true } satisfies SignOutResponse);
}
