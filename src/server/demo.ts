import type {
  AccountsSnapshot,
  AccountView,
  FleetSnapshot,
  ProviderQuota,
  QuotaSnapshot,
  Worker,
} from "./contracts";
import type { DemoScenario } from "./scenario";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function workers(now: number): Worker[] {
  return [
    {
      id: "harbor-route-guards",
      homeId: "primary",
      project: "harbor",
      taskPart: "Phase 2 of 4 · route guard suite",
      kind: "crewmate",
      runtime: "claude",
      model: "opus-demo",
      effort: "high",
      status: "working",
      startedAt: now - 3 * hour - 12 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: {
        label: "Phase 2 of 4 · route guard suite",
        total: 4,
        current: 2,
      },
      last: {
        at: now - 9 * minute,
        text: "middleware guard passes its synthetic test suite",
      },
      next: "open the synthetic review once route checks are green",
      pr: null,
      ci: null,
      blocker: null,
      decision: null,
      stale: false,
    },
    {
      id: "harbor-read-authority",
      homeId: "primary",
      project: "harbor",
      taskPart: "Phase 4 of 4 · review fixes",
      kind: "crewmate",
      runtime: "pi",
      model: "gpt-demo-codex",
      effort: "xhigh",
      status: "review",
      startedAt: now - 6 * hour - 41 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: { label: "Phase 4 of 4 · review fixes", total: 4, current: 4 },
      last: {
        at: now - 26 * minute,
        text: "synthetic review findings applied; review requested again",
      },
      next: "merge after local review and checks pass",
      pr: { number: 214, state: "open" },
      ci: { state: "running", label: "checks 3 of 5" },
      blocker: null,
      decision: null,
      stale: false,
    },
    {
      id: "tern-name-clearance",
      homeId: "primary",
      project: "tern",
      taskPart: "Report drafted · awaiting call",
      kind: "scout",
      runtime: "claude",
      model: "fable-demo",
      effort: "medium",
      status: "needs-decision",
      startedAt: now - hour - 58 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: { label: "Report drafted · awaiting call", total: 3, current: 3 },
      last: {
        at: now - 44 * minute,
        text: "two synthetic candidates need a risk-posture decision",
      },
      next: "captain picks candidate A or B",
      pr: null,
      ci: null,
      blocker: null,
      decision:
        "Candidate A is conventional; candidate B is distinctive. Pick the preferred risk posture.",
      stale: false,
    },
    {
      id: "tern-hosting-move",
      homeId: "primary",
      project: "tern",
      taskPart: "Phase 1 of 3 · provider bootstrap",
      kind: "crewmate",
      runtime: "codex",
      model: "codex-demo-spark",
      effort: "medium",
      status: "blocked",
      startedAt: now - 5 * hour - 3 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: {
        label: "Phase 1 of 3 · provider bootstrap",
        total: 3,
        current: 1,
      },
      last: {
        at: now - 71 * minute,
        text: "synthetic provisioning scope was refused twice",
      },
      next: "resolve the local permission decision",
      pr: null,
      ci: null,
      blocker:
        "The synthetic provider fixture refuses project creation; choose a different local-only provisioning path.",
      decision: null,
      stale: false,
    },
    {
      id: "harbor-release-notes",
      homeId: "primary",
      project: "harbor",
      taskPart: "Waiting on a synthetic upstream release",
      kind: "scout",
      runtime: "muse",
      model: "muse-demo-r7",
      effort: "high",
      status: "paused",
      startedAt: now - 9 * hour - 20 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: { label: "Waiting on upstream release", total: 2, current: 1 },
      last: {
        at: now - 2 * hour,
        text: "paused until the synthetic release notes publish",
      },
      next: "resume when the declared wait clears",
      pr: null,
      ci: null,
      blocker: null,
      decision: null,
      stale: false,
    },
    {
      id: "reef-import-dedupe",
      homeId: "secondmate:atoll",
      project: "reef",
      taskPart: "Phase 3 of 5 · dedupe pass",
      kind: "crewmate",
      runtime: "opencode",
      model: "grok-demo-code",
      effort: "high",
      status: "working",
      startedAt: now - 2 * hour - 5 * minute,
      endedAt: null,
      elapsedBasis: "task-record",
      phase: { label: "Phase 3 of 5 · dedupe pass", total: 5, current: 3 },
      last: {
        at: now - 4 * minute,
        text: "synthetic content hashes are clean through batch three",
      },
      next: "checkpoint the fourth fixture batch",
      pr: { number: 57, state: "open" },
      ci: { state: "pass", label: "checks 5 of 5" },
      blocker: null,
      decision: null,
      stale: false,
    },
    {
      id: "reef-draft-release",
      homeId: "secondmate:atoll",
      project: "reef",
      taskPart: "Complete · merged",
      kind: "crewmate",
      runtime: "claude",
      model: "sonnet-demo",
      effort: "low",
      status: "done",
      startedAt: now - 4 * hour - 30 * minute,
      endedAt: now - 18 * minute,
      elapsedBasis: "task-record",
      phase: { label: "Complete · merged", total: 2, current: 2 },
      last: {
        at: now - 18 * minute,
        text: "synthetic notes moved into the draft release",
      },
      next: "no further milestone",
      pr: { number: 55, state: "merged" },
      ci: { state: "pass", label: "checks 4 of 4" },
      blocker: null,
      decision: null,
      stale: false,
    },
  ];
}

function window(
  id: string,
  label: string,
  percentRemaining: number | null,
  resetsAt: number | null,
  pace: "ahead" | "behind" | "on_pace" | "unknown",
  elapsedPercent: number | null,
) {
  return {
    id,
    label,
    kind: id.includes("5") || id === "five_hour" ? "rolling" : "weekly",
    percentRemaining,
    resetsAt,
    windowSeconds:
      id.includes("5") || id === "five_hour" ? 5 * 60 * 60 : 7 * 24 * 60 * 60,
    elapsedPercent,
    pace: {
      status: pace,
      burnMultiple: pace === "unknown" ? null : pace === "behind" ? 1.4 : 0.7,
      projectedExhaustedAt: null,
      projectionConfidence: pace === "unknown" ? null : "high",
    },
  };
}

function providerFixtures(
  now: number,
  scenario: DemoScenario,
): ProviderQuota[] {
  const claudeFive = scenario === "critical" ? 11 : 38;
  const providers: ProviderQuota[] = [
    {
      provider: "claude",
      label: "Claude",
      accountAlias: "flagship",
      plan: "max",
      sourceKind: "oauth",
      state: {
        status: scenario === "stale" ? "stale" : "fresh",
        refreshedAt: now - (scenario === "stale" ? 3 * hour : 40_000),
      },
      windows: [
        window(
          "five_hour",
          "5-hour",
          claudeFive,
          now + hour + 24 * minute,
          "behind",
          72,
        ),
        window("seven_day", "week", 81, now + 5 * day + 9 * hour, "ahead", 34),
        window(
          "model:fable",
          "Fable week",
          64,
          now + 5 * day + 9 * hour,
          "ahead",
          34,
        ),
      ],
      reason:
        scenario === "stale" ? "last authoritative values are stale" : null,
      limitingWindowIds: ["five_hour"],
      relationship: "unknown",
    },
    {
      provider: "codex",
      label: "Codex",
      accountAlias: "reserve",
      plan: "pro",
      sourceKind:
        scenario === "partial" || scenario === "source-failure"
          ? "unavailable"
          : "oauth",
      state: {
        status:
          scenario === "partial" || scenario === "source-failure"
            ? "error"
            : "fresh",
        refreshedAt:
          scenario === "partial" || scenario === "source-failure"
            ? null
            : now - 55_000,
      },
      windows:
        scenario === "partial" || scenario === "source-failure"
          ? []
          : [
              window(
                "weekly",
                "week",
                57,
                now + 3 * day + 14 * hour,
                "ahead",
                39,
              ),
              window(
                "model:spark:5h",
                "Spark 5-hour",
                100,
                now + 5 * hour,
                "unknown",
                null,
              ),
            ],
      reason:
        scenario === "partial" || scenario === "source-failure"
          ? "authoritative local fixture source returned an error"
          : null,
      limitingWindowIds: ["weekly"],
      relationship: "unknown",
    },
  ];
  return providers;
}

export function demoFleet(
  scenario: DemoScenario,
  now = Date.now(),
): FleetSnapshot {
  const allWorkers = scenario === "empty" ? [] : workers(now);
  const stale = scenario === "stale";
  if (stale) for (const worker of allWorkers) worker.stale = true;
  return {
    generatedAt: now,
    source: {
      status: scenario === "loading" ? "loading" : stale ? "stale" : "live",
      refreshedAt:
        scenario === "loading" ? null : now - (stale ? 7 * minute : 1_000),
      reason: stale ? "fleet state has not refreshed for seven minutes" : null,
    },
    homes: [
      {
        id: "primary",
        label: "Primary home",
        kind: "primary",
        availability: stale ? "stale" : "live",
        reason: stale ? "last event seven minutes ago" : null,
        lastSeenAt: now - (stale ? 7 * minute : 1_000),
      },
      {
        id: "secondmate:atoll",
        label: "Second mate · atoll",
        kind: "secondmate",
        availability:
          scenario === "partial" ? "unreachable" : stale ? "stale" : "live",
        reason:
          scenario === "partial" ? "structured home snapshot timed out" : null,
        lastSeenAt: now - (scenario === "partial" ? 6 * minute : 1_000),
      },
    ],
    workers: allWorkers,
  };
}

export function demoQuota(
  scenario: DemoScenario,
  now = Date.now(),
): QuotaSnapshot {
  const providers = providerFixtures(now, scenario);
  const failed = providers.filter(
    (provider) => !["fresh", "stale"].includes(provider.state.status),
  ).length;
  return {
    generatedAt: now,
    schemaVersion: 3,
    source: {
      status:
        scenario === "loading"
          ? "loading"
          : scenario === "source-failure"
            ? "error"
            : failed
              ? "partial"
              : scenario === "stale"
                ? "stale"
                : "live",
      refreshedAt: scenario === "loading" ? null : now - 40_000,
      reason: failed
        ? `${providers.length - failed} of ${providers.length} providers reporting`
        : scenario === "stale"
          ? "authoritative quota values are stale"
          : null,
    },
    providers,
  };
}

function accountViews(now: number, scenario: DemoScenario): AccountView[] {
  const provider = providerFixtures(now, scenario)[0];
  const first: AccountView = {
    alias: "flagship",
    sourceId: "claude:oauth-profile:····a4f2",
    provider: "claude",
    plan: "max",
    state: provider.state,
    windows: provider.windows,
    note: null,
  };
  const secondWindows = [
    window("five_hour", "5-hour", 96, now + 4 * hour + 50 * minute, "ahead", 8),
    window("seven_day", "week", 44, now + 2 * day + 3 * hour, "behind", 68),
    ...(scenario === "incomparable"
      ? []
      : [
          window(
            "model:fable",
            "Fable week",
            72,
            now + 2 * day + 3 * hour,
            "ahead",
            30,
          ),
        ]),
  ];
  return [
    first,
    {
      alias: "night-watch",
      sourceId: "claude:oauth-profile:····c81d",
      provider: "claude",
      plan: "max",
      state: { status: "stale", refreshedAt: now - 3 * hour },
      windows: secondWindows,
      note: "last authoritative values are stale",
    },
    {
      alias: "reserve",
      sourceId: "codex:oauth-profile:····9b30",
      provider: "codex",
      plan: "pro",
      state: { status: "fresh", refreshedAt: now - 55_000 },
      windows: providerFixtures(now, "live")[1].windows,
      note: null,
    },
    {
      alias: "skiff",
      sourceId: "codex:oauth-profile:····e77c",
      provider: "codex",
      plan: null,
      state: { status: "auth_required", refreshedAt: null },
      windows: [],
      note: "credential expired in the official Codex CLI store — run codex login in a terminal, then Detect again",
    },
    {
      alias: "chart-room",
      sourceId: "codex:adapter:····4d11",
      provider: "codex",
      plan: null,
      state: { status: "unsupported", refreshedAt: null },
      windows: [],
      note: "unsupported quota source schema — expected version 3; no values inferred",
    },
  ];
}

export function demoAccounts(
  scenario: DemoScenario,
  now = Date.now(),
  override?: AccountView[],
): AccountsSnapshot {
  return {
    generatedAt: now,
    detection: { status: "ready", reason: null },
    accounts: override ?? accountViews(now, scenario),
    detected: [
      {
        provider: "codex",
        sourceId: "codex:oauth-profile:····f2a9",
        plan: "pro",
        state: "fresh",
      },
    ],
  };
}

export function initialDemoAccounts(now = Date.now()): AccountView[] {
  return accountViews(now, "live");
}
