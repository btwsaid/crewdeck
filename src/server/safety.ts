const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const ABSOLUTE_PATH =
  /(?:^|[\s"'(])(?:\/(?:Users|home|root|private|tmp|var|opt|mnt)\/|[A-Z]:[\\/]|~\/)/iu;
const CREDENTIAL =
  /\b(?:bearer\s+[A-Z0-9._~+/-]{8,}|(?:token|secret|password|passwd|cookie|api[_ -]?key)\s*[:=]\s*\S+)/iu;
const TOKEN_SHAPE =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[opsu]_[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,})\b/u;
const ANSI_OR_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\u001b\[/u;
const MONEY = /(?:[$€£]\s?\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s?(?:USD|EUR|GBP)\b)/iu;
const PRIVATE_KEYS =
  /^(?:prompt|conversation|terminal|output|username|email|path|worktree|pane|session|token|secret|cookie|credential|cost|credits?|price|amount)$/iu;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value < 10_000_000_000
      ? Math.round(value * 1000)
      : Math.round(value);
  }
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

export function safeIdentifier(value: unknown, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(trimmed)
    ? trimmed
    : fallback;
}

export function safeDisplayToken(
  value: unknown,
  fallback = "unknown",
  maximum = 100,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > maximum ||
    ANSI_OR_CONTROL.test(trimmed) ||
    isSensitiveText(trimmed)
  )
    return fallback;
  if (!/^[\p{L}\p{N} ._:+@/()\[\]-]+$/u.test(trimmed)) return fallback;
  return trimmed;
}

export function isSensitiveText(value: string): boolean {
  return (
    EMAIL.test(value) ||
    ABSOLUTE_PATH.test(value) ||
    CREDENTIAL.test(value) ||
    TOKEN_SHAPE.test(value) ||
    ANSI_OR_CONTROL.test(value) ||
    MONEY.test(value)
  );
}

export function safeNarrative(
  value: unknown,
  fallback: string,
  maximum = 240,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized || isSensitiveText(normalized)) return fallback;
  return normalized.slice(0, maximum);
}

export function assertCleanPayload(value: unknown): void {
  const visit = (candidate: unknown, key = ""): void => {
    if (PRIVATE_KEYS.test(key))
      throw new Error("private field reached the presentation boundary");
    if (typeof candidate === "string" && isSensitiveText(candidate)) {
      throw new Error("private text reached the presentation boundary");
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
    } else if (isRecord(candidate)) {
      for (const [childKey, child] of Object.entries(candidate))
        visit(child, childKey);
    }
  };
  visit(value);
}

export function publicJson(value: unknown): string {
  assertCleanPayload(value);
  return JSON.stringify(value);
}
