import { publicJson } from "./safety";

export function jsonResponse(
  value: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(publicJson(value), { ...init, headers });
}

export async function readSmallJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    throw new Error("application/json required");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 4096)
    throw new Error("request is too large");
  const text = await request.text();
  if (text.length > 4096) throw new Error("request is too large");
  return JSON.parse(text) as unknown;
}
