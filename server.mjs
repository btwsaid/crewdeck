import { createServer } from "node:http";
import next from "next";
import {
  isSameLoopbackOrigin,
  validateLoopbackHeaders,
} from "./src/server/loopback.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.CREWDECK_HOST ?? "127.0.0.1";
const port = Number(process.env.CREWDECK_PORT ?? "4317");

if (hostname !== "127.0.0.1")
  throw new Error("CREWDECK_HOST must be exactly 127.0.0.1");
if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("CREWDECK_PORT must be an integer from 1024 through 65535");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => {
  const verdict = validateLoopbackHeaders(request.headers);
  if (!verdict.ok) {
    response.writeHead(421, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("Crewdeck accepts direct loopback requests only.\n");
    return;
  }

  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method ?? "")) {
    const origin = Array.isArray(request.headers.origin)
      ? request.headers.origin[0]
      : request.headers.origin;
    const host = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host;
    const fetchSite = request.headers["sec-fetch-site"];
    if (!isSameLoopbackOrigin(origin, host) || fetchSite === "cross-site") {
      response.writeHead(403, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("Same-origin loopback request required.\n");
      return;
    }
  }

  void handle(request, response);
});

server.keepAliveTimeout = 20_000;
server.requestTimeout = 30_000;
server.listen(port, hostname, () => {
  console.log(`Crewdeck ready on http://${hostname}:${port} (local-only)`);
});
