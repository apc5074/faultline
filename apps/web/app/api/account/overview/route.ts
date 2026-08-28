import { getPlayerAccountOverview } from "@/lib/account/overview";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const overview = await getPlayerAccountOverview();
  return Response.json(overview);
}
