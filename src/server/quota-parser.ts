import type {
  PaceState,
  ProviderQuota,
  QuotaSnapshot,
  QuotaState,
  QuotaWindow,
} from "./contracts";
import {
  isRecord,
  safeBoundedNumber,
  safeDisplayToken,
  safeIdentifier,
  safeNarrative,
  safeTimestamp,
} from "./safety";

type SupportedQuotaSchema = 3 | 5;

const supportedQuotaSchemas: SupportedQuotaSchema[] = [3, 5];
const schemaV5ProviderLabels: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  grok: "Grok",
  kimi: "Kimi",
  zai: "Z.AI",
  agy: "Antigravity",
};

function paceState(value: unknown): PaceState {
  return value === "ahead" || value === "behind" || value === "on_pace"
    ? value
    : "unknown";
}

function quotaState(value: unknown, stale: unknown): QuotaState {
  if (
    stale === true &&
    (value === "fresh" || value === "ok" || value === "available")
  )
    return "stale";
  switch (value) {
    case "fresh":
    case "ok":
    case "available":
      return "fresh";
    case "stale":
      return "stale";
    case "auth_required":
      return "auth_required";
    case "rate_limited":
      return "rate_limited";
    case "unsupported":
      return "unsupported";
    case "unavailable":
      return "unavailable";
    default:
      return "error";
  }
}

function mapWindow(value: unknown): QuotaWindow | null {
  if (!isRecord(value)) return null;
  const id = safeIdentifier(value.id, "");
  if (!id) return null;
  const pace = isRecord(value.pace) ? value.pace : {};
  const percentRemaining =
    value.percentRemaining === null
      ? null
      : safeBoundedNumber(value.percentRemaining, 0, 100);
  return {
    id,
    label: safeDisplayToken(value.label, id, 80),
    kind: safeDisplayToken(value.kind, "unreported", 40),
    percentRemaining,
    resetsAt: safeTimestamp(value.resetsAt),
    windowSeconds: safeBoundedNumber(
      value.windowSeconds,
      1,
      366 * 24 * 60 * 60,
    ),
    elapsedPercent: safeBoundedNumber(pace.elapsedPercent, 0, 100),
    pace: {
      status: paceState(pace.status),
      burnMultiple: safeBoundedNumber(pace.burnMultiple, 0, 1_000),
      projectedExhaustedAt: safeTimestamp(pace.projectedExhaustedAt),
      projectionConfidence:
        pace.projectionConfidence === null
          ? null
          : safeDisplayToken(pace.projectionConfidence, "unknown", 32),
    },
  };
}

interface MappedProvider {
  provider: ProviderQuota;
  malformedWindows: number;
}

function errorReason(
  state: Record<string, unknown>,
  status: QuotaState,
): string | null {
  const sourceError = isRecord(state.error)
    ? (state.error.message ?? state.error.code)
    : state.error;
  const raw = sourceError ?? state.reason;
  const fallbacks: Record<QuotaState, string | null> = {
    fresh: null,
    stale: "last authoritative values are stale",
    unavailable: "authoritative local quota source is unavailable",
    auth_required: "authentication required in the official provider CLI",
    rate_limited: "authoritative local quota source is rate limited",
    error: "authoritative local quota source returned an error",
    unsupported: "quota source is unsupported",
  };
  return raw === undefined || raw === null
    ? fallbacks[status]
    : safeNarrative(raw, fallbacks[status] ?? "quota source error", 180);
}

function mapProvider(
  value: unknown,
  now: number,
  schemaVersion: SupportedQuotaSchema,
): MappedProvider | null {
  if (
    !isRecord(value) ||
    !isRecord(value.state) ||
    !Array.isArray(value.windows)
  )
    return null;
  const providerId = safeIdentifier(value.provider, "");
  if (!providerId) return null;
  const state = value.state;
  const status = quotaState(state.status, state.stale);
  const mappedWindows = value.windows.map(mapWindow);
  const windows = mappedWindows.filter(
    (window): window is QuotaWindow => window !== null,
  );
  const quotaSemantics = isRecord(value.quotaSemantics)
    ? value.quotaSemantics
    : {};
  const effectiveAvailability = Array.isArray(
    quotaSemantics.effectiveAvailability,
  )
    ? quotaSemantics.effectiveAvailability
    : Array.isArray(value.effective)
      ? value.effective
      : [];
  const reportedWindowIds = new Set(windows.map((window) => window.id));
  const limitingWindowIds = [
    ...new Set(
      effectiveAvailability
        .flatMap((entry) =>
          isRecord(entry) && Array.isArray(entry.limitingWindowIds)
            ? entry.limitingWindowIds
            : [],
        )
        .map((id) => safeIdentifier(id, ""))
        .filter((id) => id && reportedWindowIds.has(id)),
    ),
  ];
  const reason = errorReason(state, status);
  const queryFailed =
    ["rate_limited", "unavailable", "error"].includes(status) ||
    (status === "stale" && state.error !== undefined);
  const labelFallback =
    schemaVersion === 5
      ? (schemaV5ProviderLabels[providerId] ?? providerId)
      : providerId;
  return {
    provider: {
      provider: providerId,
      label: safeDisplayToken(value.label, labelFallback, 50),
      accountAlias: null,
      plan:
        value.plan === null
          ? null
          : safeDisplayToken(value.plan, "not reported", 40),
      // Schema v5 intentionally demotes provenance from default --json. Keep
      // that omission explicit instead of mislabeling a fresh source as down.
      sourceKind: safeDisplayToken(
        value.source,
        schemaVersion === 5 ? "not reported" : "unavailable",
        40,
      ),
      // Schema v5 also demotes provider refreshedAt. The report-level
      // generatedAt must not be substituted for provider evidence time.
      state: { status, refreshedAt: safeTimestamp(state.refreshedAt) },
      windows,
      reason,
      queryError: queryFailed && reason ? { observedAt: now, reason } : null,
      limitingWindowIds,
      relationship: "unknown",
    },
    malformedWindows: mappedWindows.length - windows.length,
  };
}

export function parseQuotaPayload(
  raw: unknown,
  now = Date.now(),
): QuotaSnapshot {
  const received =
    isRecord(raw) && typeof raw.schemaVersion === "number"
      ? raw.schemaVersion
      : null;
  if (
    !isRecord(raw) ||
    !supportedQuotaSchemas.includes(received as SupportedQuotaSchema)
  ) {
    return {
      generatedAt: now,
      schemaVersion: received,
      source: {
        status: "unsupported",
        refreshedAt: null,
        reason: `unsupported quota source schema — expected version 3 or 5${received === null ? "" : `, received ${received}`}`,
      },
      providers: [],
    };
  }

  const schemaVersion = received as SupportedQuotaSchema;
  if (!Array.isArray(raw.providers)) {
    return {
      generatedAt: now,
      schemaVersion,
      source: {
        status: "error",
        refreshedAt: safeTimestamp(raw.generatedAt),
        reason: "malformed quota source payload — providers must be an array",
      },
      providers: [],
    };
  }

  const mappedProviders = raw.providers.map((provider) =>
    mapProvider(provider, now, schemaVersion),
  );
  const providers = mappedProviders
    .filter((provider): provider is MappedProvider => provider !== null)
    .map((provider) => provider.provider);
  const malformedProviders = mappedProviders.length - providers.length;
  const malformedWindows = mappedProviders.reduce(
    (total, provider) => total + (provider?.malformedWindows ?? 0),
    0,
  );
  const malformedParts = [
    malformedProviders > 0
      ? `${malformedProviders} malformed provider record${malformedProviders === 1 ? "" : "s"}`
      : null,
    malformedWindows > 0
      ? `${malformedWindows} malformed window record${malformedWindows === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => part !== null);
  const malformedReason =
    malformedParts.length > 0
      ? `quota source payload contained ${malformedParts.join(" and ")}`
      : null;

  // generatedAt is source evidence only when the source actually supplies it;
  // a parser or poll time must never make allowance evidence look refreshed.
  const refreshedAt = safeTimestamp(raw.generatedAt);
  const stale = providers.some((provider) => provider.state.status === "stale");
  const failures = providers.filter(
    (provider) => !["fresh", "stale"].includes(provider.state.status),
  );
  const successful = providers.length - failures.length;
  const sourceStatus =
    providers.length === 0 || successful === 0
      ? "error"
      : failures.length > 0 || malformedReason !== null
        ? "partial"
        : stale
          ? "stale"
          : "live";
  const reportingReason = `${successful} of ${raw.providers.length} providers reporting`;
  return {
    generatedAt: now,
    schemaVersion,
    source: {
      status: sourceStatus,
      refreshedAt,
      reason:
        sourceStatus === "partial"
          ? [
              reportingReason,
              stale ? "authoritative quota values are stale" : null,
              malformedReason,
            ]
              .filter((part): part is string => part !== null)
              .join("; ")
          : sourceStatus === "error"
            ? ["no authoritative quota provider is reporting", malformedReason]
                .filter((part): part is string => part !== null)
                .join("; ")
            : stale
              ? "authoritative quota values are stale"
              : null,
    },
    providers,
  };
}

const fiveHoursMs = 5 * 60 * 60 * 1_000;
const sevenDaysMs = 7 * 24 * 60 * 60 * 1_000;
const transientClaudeStates: QuotaState[] = [
  "rate_limited",
  "unavailable",
  "error",
];

function retainableClaudeWindows(
  provider: ProviderQuota,
  now: number,
): QuotaWindow[] {
  const refreshedAt = provider.state.refreshedAt;
  if (
    !["fresh", "stale"].includes(provider.state.status) ||
    refreshedAt === null ||
    refreshedAt > now ||
    now - refreshedAt >= sevenDaysMs
  ) {
    return [];
  }
  const age = now - refreshedAt;
  return provider.windows
    .filter((window) => {
      if (window.resetsAt !== null) return window.resetsAt > now;
      if (window.kind === "weekly" || window.kind === "model")
        return age < sevenDaysMs;
      if (window.kind === "session") return age < fiveHoursMs;
      return false;
    })
    .map((window) => ({
      ...window,
      elapsedPercent: null,
      pace: {
        status: "unknown" as const,
        burnMultiple: null,
        projectedExhaustedAt: null,
        projectionConfidence: null,
      },
    }));
}

function summarizeReconciledSource(snapshot: QuotaSnapshot): QuotaSnapshot {
  if (snapshot.source.status === "unsupported") return snapshot;
  const reporting = snapshot.providers.filter((provider) =>
    ["fresh", "stale"].includes(provider.state.status),
  );
  const stale = reporting.filter(
    (provider) => provider.state.status === "stale",
  ).length;
  const failures = snapshot.providers.length - reporting.length;
  const status =
    reporting.length === 0
      ? "error"
      : failures > 0
        ? "partial"
        : stale > 0
          ? "stale"
          : "live";
  return {
    ...snapshot,
    source: {
      ...snapshot.source,
      status,
      reason:
        status === "partial"
          ? `${reporting.length} of ${snapshot.providers.length} providers reporting${stale > 0 ? `; ${stale} retained stale` : ""}`
          : status === "stale"
            ? "authoritative quota values are stale"
            : status === "live"
              ? null
              : snapshot.source.reason,
    },
  };
}

export function retainLastGoodClaude(
  next: QuotaSnapshot,
  previous: QuotaSnapshot,
  now = Date.now(),
): QuotaSnapshot {
  if (next.source.status === "unsupported") return next;
  const currentIndex = next.providers.findIndex(
    (provider) => provider.provider === "claude",
  );
  const current = next.providers[currentIndex];
  const transientFailure = current
    ? transientClaudeStates.includes(current.state.status) &&
      current.windows.length === 0
    : next.source.status === "error";
  if (!transientFailure) return next;

  const lastGood = previous.providers.find(
    (provider) => provider.provider === "claude",
  );
  if (!lastGood) return next;
  const windows = retainableClaudeWindows(lastGood, now);
  if (windows.length === 0) return next;

  const queryReason =
    current?.queryError?.reason ??
    current?.reason ??
    next.source.reason ??
    "latest quota source query failed";
  const retained: ProviderQuota = {
    ...lastGood,
    state: { status: "stale", refreshedAt: lastGood.state.refreshedAt },
    windows,
    reason:
      "Last authoritative Claude allowance is retained while the latest source query is unavailable.",
    queryError: { observedAt: now, reason: queryReason },
    limitingWindowIds: [],
    relationship: "unknown",
  };
  const providers = [...next.providers];
  if (currentIndex >= 0) providers[currentIndex] = retained;
  else providers.push(retained);
  return summarizeReconciledSource({ ...next, providers });
}

export function quotaExecutionError(
  reason: string,
  now = Date.now(),
): QuotaSnapshot {
  return {
    generatedAt: now,
    schemaVersion: null,
    source: {
      status: "error",
      refreshedAt: null,
      reason: safeNarrative(reason, "quota source failed", 180),
    },
    providers: [],
  };
}
