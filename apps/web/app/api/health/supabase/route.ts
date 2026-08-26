import { getSupabaseAuthHealthUrl, getSupabasePublicConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getSupabasePublicConfig();

  if (!config) {
    return Response.json({ service: "supabase", status: "misconfigured" }, { status: 503 });
  }

  try {
    const response = await fetch(getSupabaseAuthHealthUrl(config), {
      cache: "no-store",
      headers: { apikey: config.publishableKey },
    });

    if (!response.ok) {
      return Response.json({ service: "supabase", status: "unavailable" }, { status: 503 });
    }
  } catch {
    return Response.json({ service: "supabase", status: "unavailable" }, { status: 503 });
  }

  return Response.json({ service: "supabase", status: "online" });
}
