import { NextResponse } from "next/server";

import { getShareCard, ShareCardError } from "@/lib/share/cards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ shareId: string }> }) {
  try {
    const { shareId } = await context.params;
    return NextResponse.json({ ok: true, share: await getShareCard(shareId) });
  } catch (error) {
    if (error instanceof ShareCardError && error.code === "not_found") return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 404 });
    return NextResponse.json({ ok: false, error: "Unable to load share card.", code: "persist_failed" }, { status: 500 });
  }
}
