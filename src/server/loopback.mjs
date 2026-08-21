import net from "node:net";

const FORWARDED_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
];

/** @param {string | string[] | undefined} value */
function oneHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Accept only an explicit loopback IP authority. Hostnames are intentionally
 * refused to close DNS-rebinding ambiguity.
 * @param {string | undefined} authority
 */
export function isLoopbackAuthority(authority) {
  if (
    !authority ||
    authority.includes(",") ||
    /[\s/@\\?#]/u.test(authority) ||
    !/^[0-9A-Fa-f.:[\]]+$/u.test(authority)
  )
    return false;
  let host = authority;
  try {
    const parsed = new URL(`http://${authority}`);
    host = parsed.hostname;
    if (parsed.username || parsed.password || parsed.pathname !== "/")
      return false;
  } catch {
    return false;
  }
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return net.isIP(host) !== 0 && (host === "::1" || host.startsWith("127."));
}

/** @param {import('node:http').IncomingHttpHeaders} headers */
export function validateLoopbackHeaders(headers) {
  const host = oneHeader(headers.host);
  if (!isLoopbackAuthority(host))
    return { ok: false, reason: "non-loopback Host refused" };
  for (const name of FORWARDED_HEADERS) {
    if (headers[name] !== undefined)
      return { ok: false, reason: "forwarded request refused" };
  }
  return { ok: true, reason: null };
}

/**
 * Local mutation endpoints accept only same-origin browser requests.
 * @param {string | undefined} origin
 * @param {string | undefined} host
 */
export function isSameLoopbackOrigin(origin, host) {
  if (!origin || !host || !isLoopbackAuthority(host)) return false;
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      parsed.host === host &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}
