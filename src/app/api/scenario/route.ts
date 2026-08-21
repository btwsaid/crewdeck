import { jsonResponse, readSmallJson } from "@/server/json";
import { getService } from "@/server/service";
import { isRecord, safeNarrative } from "@/server/safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readSmallJson(request);
    if (!isRecord(body)) throw new Error("request body must be an object");
    const service = getService();
    await service.ensureStarted();
    const scenario = await service.setScenario(body.scenario);
    return jsonResponse({ scenario, ...service.snapshots() });
  } catch (error) {
    const message =
      error instanceof Error
        ? safeNarrative(error.message, "scenario request rejected", 120)
        : "scenario request rejected";
    return jsonResponse({ error: message }, { status: 400 });
  }
}
