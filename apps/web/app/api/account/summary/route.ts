import { getPlayerAccountSummary } from "@/lib/account/summary";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await getPlayerAccountSummary());
}
