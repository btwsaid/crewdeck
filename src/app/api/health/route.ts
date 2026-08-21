import { jsonResponse } from "@/server/json";
import { getService } from "@/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  await getService().ensureStarted();
  return jsonResponse({
    ok: true,
    mode: process.env.CREWDECK_DEMO === "1" ? "synthetic" : "live",
  });
}
