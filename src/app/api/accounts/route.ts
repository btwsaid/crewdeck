import { jsonResponse, readSmallJson } from "@/server/json";
import { getService } from "@/server/service";
import { isRecord, safeNarrative } from "@/server/safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const service = getService();
  await service.ensureStarted();
  return jsonResponse(service.snapshots().accounts);
}

export async function POST(request: Request): Promise<Response> {
  return mutate(request, "register");
}

export async function PATCH(request: Request): Promise<Response> {
  return mutate(request, "rename");
}

export async function DELETE(request: Request): Promise<Response> {
  return mutate(request, "disconnect");
}

async function mutate(
  request: Request,
  operation: "register" | "rename" | "disconnect",
): Promise<Response> {
  try {
    const value = await readSmallJson(request);
    if (!isRecord(value)) throw new Error("request body must be an object");
    const service = getService();
    await service.ensureStarted();
    if (operation === "register")
      await service.registerAccount(value.alias, value.sourceId);
    if (operation === "rename")
      await service.renameAccount(value.sourceId, value.alias);
    if (operation === "disconnect")
      await service.disconnectAccount(value.sourceId);
    return jsonResponse(service.snapshots().accounts);
  } catch (error) {
    const message =
      error instanceof Error
        ? safeNarrative(error.message, "account request rejected", 140)
        : "account request rejected";
    return jsonResponse({ error: message }, { status: 400 });
  }
}
