import { jsonResponse } from "@/server/json";
import { getService } from "@/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const service = getService();
  await service.ensureStarted();
  return jsonResponse(service.snapshots().fleet);
}
