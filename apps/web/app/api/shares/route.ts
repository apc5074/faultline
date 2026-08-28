import { NextResponse } from "next/server";

import { createShareFromSubmission, ShareCardError } from "@/lib/share/cards";
import { getCurrentAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { submissionId?: unknown } | null;
  if (!body || typeof body.submissionId !== "string" || body.submissionId.trim() === "") {
    return NextResponse.json({ ok: false, error: "submissionId is required.", code: "invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, share: await createShareFromSubmission(body.submissionId, { userId: user.id }) });
  } catch (error) {
    if (error instanceof ShareCardError) {
      const status = error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "invalid_submission" ? 422 : 500;
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "Unable to create share card.", code: "persist_failed" }, { status: 500 });
  }
}
