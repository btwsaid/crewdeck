import type { StreamEvent } from "@/server/contracts";
import { publicJson } from "@/server/safety";
import { getService } from "@/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function encode(event: StreamEvent): Uint8Array {
  return encoder.encode(
    `event: ${event.type}\ndata: ${publicJson(event.data)}\n\n`,
  );
}

export async function GET(request: Request): Promise<Response> {
  const service = getService();
  await service.ensureStarted();
  let unsubscribe: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      const snapshot = service.snapshots();
      controller.enqueue(encode({ type: "fleet", data: snapshot.fleet }));
      controller.enqueue(encode({ type: "quota", data: snapshot.quota }));
      controller.enqueue(encode({ type: "accounts", data: snapshot.accounts }));
      controller.enqueue(
        encode({ type: "heartbeat", data: { generatedAt: Date.now() } }),
      );
      unsubscribe = service.subscribe((event) =>
        controller.enqueue(encode(event)),
      );
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            // The browser may have already closed the stream.
          }
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
