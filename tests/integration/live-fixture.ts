import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CrewdeckConfig } from "@/server/config";

interface FleetState {
  revision: number;
  fail: boolean;
}

export interface QuotaState {
  percentRemaining: number;
  claudeStatus?: "fresh" | "rate_limited" | "auth_required";
}

interface SyntheticLiveFixtureOptions {
  workerHarness?: "pi" | "claude";
  initialQuotaState?: QuotaState;
  quotaSchemaVersion?: 3 | 5;
}

export interface SyntheticLiveFixture {
  config: CrewdeckConfig;
  writeFleetState(state: FleetState): Promise<void>;
  writeQuotaState(state: QuotaState): Promise<void>;
}

export async function createSyntheticLiveFixture(
  options: SyntheticLiveFixtureOptions = {},
): Promise<SyntheticLiveFixture> {
  const directory = await mkdtemp(join(tmpdir(), "crewdeck-live-fixture-"));
  const workerHarness = options.workerHarness ?? "pi";
  const quotaSchemaVersion = options.quotaSchemaVersion ?? 3;
  const home = join(directory, "firstmate-home");
  const stateDirectory = join(home, "state");
  const commandDirectory = join(directory, "commands");
  const fleetState = join(directory, "fleet-state.json");
  const quotaState = join(directory, "quota-state.json");
  const fleetCommand = join(commandDirectory, "fleet.mjs");
  const quotaCommand = join(commandDirectory, "quota.mjs");
  await Promise.all([
    mkdir(stateDirectory, { recursive: true }),
    mkdir(commandDirectory, { recursive: true }),
  ]);

  const writeFleetState = async (state: FleetState) => {
    await writeFile(fleetState, JSON.stringify(state));
  };
  const writeQuotaState = async (state: QuotaState) => {
    await writeFile(quotaState, JSON.stringify(state));
  };
  await Promise.all([
    writeFleetState({ revision: 1, fail: false }),
    writeQuotaState(options.initialQuotaState ?? { percentRemaining: 71 }),
    writeFile(
      join(stateDirectory, "synthetic-live-worker.meta"),
      [
        `project=${["", "private", "synthetic-home", "synthetic-project"].join("/")}`,
        "kind=ship",
        `harness=${workerHarness}`,
        "model=synthetic-model",
        "effort=xhigh",
      ].join("\n"),
    ),
  ]);

  await Promise.all([
    writeFile(
      fleetCommand,
      `#!/usr/bin/env node
import { readFileSync } from "node:fs";
if (process.argv[2] !== "--json") process.exit(64);
const state = JSON.parse(readFileSync(${JSON.stringify(fleetState)}, "utf8"));
if (state.fail) process.exit(1);
const generated = new Date().toISOString();
console.log(JSON.stringify({
  schema: "fm-fleet-snapshot.v1",
  generated,
  tasks: [{
    id: "synthetic-live-worker",
    kind: "ship",
    harness: ${JSON.stringify(workerHarness)},
    project: "synthetic-project",
    current_state: {
      state: "working",
      detail: \`synthetic live update \${state.revision}\`,
      observed_at: generated,
    },
    hints: { open_decisions: [] },
    paths: { status_log: { last_event: {
      state: "working",
      note: \`synthetic fixture revision \${state.revision}\`,
    } } },
  }],
  secondmate_current: { records: [] },
}));
`,
      { mode: 0o755 },
    ),
    writeFile(
      quotaCommand,
      `#!/usr/bin/env node
import { readFileSync } from "node:fs";
if (process.argv[2] !== "--json") process.exit(64);
const state = JSON.parse(readFileSync(${JSON.stringify(quotaState)}, "utf8"));
const generatedAt = new Date().toISOString();
const schemaVersion = ${JSON.stringify(quotaSchemaVersion)};
const claudeStatus = ["fresh", "rate_limited", "auth_required"].includes(state.claudeStatus)
  ? state.claudeStatus
  : "fresh";
const claudeError = claudeStatus === "rate_limited"
  ? "Claude quota endpoint rate limited"
  : claudeStatus === "auth_required"
    ? "Claude sign-in required"
    : undefined;
const claudeWindows = claudeStatus === "fresh" ? [{
  id: "five_hour",
  label: "session",
  kind: "session",
  percentRemaining: state.percentRemaining,
  resetsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  pace: { status: "unknown" },
}, {
  id: "seven_day",
  label: "week",
  kind: "weekly",
  percentRemaining: 64,
  resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  pace: { status: "unknown" },
}, {
  id: "model:fable",
  label: "Fable week",
  kind: "model",
  percentRemaining: 71,
  resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  pace: { status: "unknown" },
}] : [];
const effectivePercentRemaining = Math.min(state.percentRemaining, 64);
const limitingWindowIds = state.percentRemaining < 64
  ? ["five_hour"]
  : state.percentRemaining === 64
    ? ["five_hour", "seven_day"]
    : ["seven_day"];
const claude = {
  provider: "claude",
  plan: "synthetic",
  state: {
    status: claudeStatus,
    stale: false,
    error: claudeError,
  },
  windows: claudeWindows,
  quotaSemantics: claudeStatus === "fresh" ? {
    status: "known",
    effectiveAvailability: [{
      scope: "all_models",
      status: "known",
      effectivePercentRemaining,
      boundedBy: ["five_hour", "seven_day"],
      limitingWindowIds,
    }, {
      scope: "model:fable",
      status: "known",
      effectivePercentRemaining,
      boundedBy: ["five_hour", "seven_day", "model:fable"],
      limitingWindowIds,
    }],
  } : {
    status: "unknown",
    effectiveAvailability: [],
  },
};
const codex = {
  provider: "codex",
  plan: "synthetic",
  state: { status: "fresh", stale: false },
  windows: [{
    id: "weekly",
    label: "week",
    kind: "weekly",
    percentRemaining: 61,
    resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    pace: { status: "unknown" },
  }],
  quotaSemantics: {
    status: "known",
    effectiveAvailability: [{
      scope: "all_models",
      status: "known",
      effectivePercentRemaining: 61,
      boundedBy: ["weekly"],
      limitingWindowIds: ["weekly"],
    }],
  },
};
if (schemaVersion === 3) {
  Object.assign(claude, { label: "Claude", source: "oauth" });
  Object.assign(codex, { label: "Codex", source: "oauth" });
  claude.state.refreshedAt = claudeStatus === "fresh" ? generatedAt : null;
  codex.state.refreshedAt = generatedAt;
  for (const window of [...claude.windows, ...codex.windows]) {
    window.windowSeconds = window.kind === "session" ? 18000 : 604800;
  }
}
console.log(JSON.stringify({
  schemaVersion,
  generatedAt,
  providers: [claude, codex],
}));
`,
      { mode: 0o755 },
    ),
  ]);
  await Promise.all([chmod(fleetCommand, 0o755), chmod(quotaCommand, 0o755)]);

  return {
    config: {
      demo: false,
      fmHome: home,
      fleetCommand,
      quotaCommand,
      accountsFile: join(directory, "accounts.json"),
    },
    writeFleetState,
    writeQuotaState,
  };
}
