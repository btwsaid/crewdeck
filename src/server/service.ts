import { EventEmitter } from "node:events";
import { watch, type FSWatcher } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type {
  AccountView,
  AccountsSnapshot,
  DetectedProfile,
  FleetSnapshot,
  QuotaSnapshot,
  StreamEvent,
} from "./contracts";
import { AccountRegistry, validateRegistration } from "./account-registry";
import { buildAccountsSnapshot } from "./accounts";
import { executeFixedCommand } from "./command";
import { readConfig, type CrewdeckConfig } from "./config";
import {
  demoAccounts,
  demoFleet,
  demoQuota,
  initialDemoAccounts,
} from "./demo";
import {
  fleetExecutionError,
  mapFleetPayload,
  type FleetEnrichment,
} from "./fleet-parser";
import { parseMetaAllowlist } from "./meta-parser";
import { parseQuotaPayload, quotaExecutionError } from "./quota-parser";
import { assertCleanPayload, isRecord, safeIdentifier } from "./safety";
import {
  getDemoScenario,
  setDemoScenario,
  type DemoScenario,
} from "./scenario";

const heartbeatMs = 15_000;
const fleetRefreshMs = 15_000;
const normalQuotaRefreshMs = 60_000;
const criticalQuotaRefreshMs = 30_000;

interface PrivateHome {
  id: string;
  location: string;
  remote: boolean;
}

export class CrewdeckService {
  private readonly emitter = new EventEmitter();
  private readonly config: CrewdeckConfig;
  private readonly registry: AccountRegistry;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private fleet: FleetSnapshot;
  private quota: QuotaSnapshot;
  private accounts: AccountsSnapshot;
  private demoAccountViews: AccountView[];
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private fleetTimer: NodeJS.Timeout | null = null;
  private quotaTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private watchers: FSWatcher[] = [];
  private refreshingFleet = false;
  private refreshingQuota = false;

  constructor(config = readConfig()) {
    this.config = config;
    this.registry = new AccountRegistry(config.accountsFile);
    const loadingFleet = demoFleet("loading");
    const loadingQuota = demoQuota("loading");
    this.fleet = {
      ...loadingFleet,
      workers: [],
      homes: loadingFleet.homes.slice(0, 1),
    };
    this.quota = { ...loadingQuota, providers: [] };
    this.demoAccountViews = initialDemoAccounts();
    this.accounts = {
      generatedAt: Date.now(),
      detection: { status: "ready", reason: null },
      accounts: [],
      detected: [],
    };
  }

  async ensureStarted(): Promise<void> {
    if (this.started) return;
    this.startPromise ??= this.start();
    try {
      await this.startPromise;
    } finally {
      if (!this.started) this.startPromise = null;
    }
  }

  snapshots(): {
    fleet: FleetSnapshot;
    quota: QuotaSnapshot;
    accounts: AccountsSnapshot;
  } {
    assertCleanPayload(this.fleet);
    assertCleanPayload(this.quota);
    assertCleanPayload(this.accounts);
    return { fleet: this.fleet, quota: this.quota, accounts: this.accounts };
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    const guardedListener = (event: StreamEvent) => {
      try {
        listener(event);
      } catch {
        this.emitter.off("event", guardedListener);
      }
    };
    this.emitter.on("event", guardedListener);
    return () => this.emitter.off("event", guardedListener);
  }

  async setScenario(value: unknown): Promise<DemoScenario> {
    if (!this.config.demo)
      throw new Error("scenarios are available only in synthetic demo mode");
    const scenario = setDemoScenario(value);
    this.refreshDemo();
    return scenario;
  }

  async registerAccount(alias: unknown, sourceId: unknown): Promise<void> {
    if (this.config.demo) {
      const registration = validateRegistration({ alias, sourceId });
      const candidate = this.accounts.detected.find(
        (profile) => profile.sourceId === registration.sourceId,
      );
      if (!candidate)
        throw new Error("detected profile is no longer available");
      if (
        this.demoAccountViews.some(
          (account) =>
            account.alias.toLocaleLowerCase() ===
            registration.alias.toLocaleLowerCase(),
        )
      ) {
        throw new Error("alias is already registered");
      }
      const provider = this.quota.providers.find(
        (row) => row.provider === candidate.provider,
      );
      this.demoAccountViews = [
        ...this.demoAccountViews,
        {
          alias: registration.alias,
          sourceId: registration.sourceId,
          provider: candidate.provider,
          plan: candidate.plan,
          state: provider?.state ?? {
            status: candidate.state,
            refreshedAt: null,
          },
          windows: provider?.windows ?? [],
          note: provider?.reason ?? null,
        },
      ];
      this.refreshDemo();
      return;
    }
    const detected = this.detectedProfiles();
    if (
      typeof sourceId !== "string" ||
      !detected.some((profile) => profile.sourceId === sourceId)
    ) {
      throw new Error("profile was not authoritatively detected");
    }
    await this.registry.register({ alias, sourceId });
    await this.refreshAccounts();
  }

  async renameAccount(sourceId: unknown, alias: unknown): Promise<void> {
    if (typeof sourceId !== "string") throw new Error("sourceId is required");
    if (this.config.demo) {
      const registration = validateRegistration({ alias, sourceId });
      if (
        this.demoAccountViews.some(
          (account) =>
            account.sourceId !== sourceId &&
            account.alias.toLocaleLowerCase() ===
              registration.alias.toLocaleLowerCase(),
        )
      ) {
        throw new Error("alias is already registered");
      }
      const found = this.demoAccountViews.find(
        (account) => account.sourceId === sourceId,
      );
      if (!found) throw new Error("account registration not found");
      found.alias = registration.alias;
      this.refreshDemo();
      return;
    }
    await this.registry.renameAlias(sourceId, alias);
    await this.refreshAccounts();
  }

  async disconnectAccount(sourceId: unknown): Promise<void> {
    if (typeof sourceId !== "string") throw new Error("sourceId is required");
    if (this.config.demo) {
      const next = this.demoAccountViews.filter(
        (account) => account.sourceId !== sourceId,
      );
      if (next.length === this.demoAccountViews.length)
        throw new Error("account registration not found");
      this.demoAccountViews = next;
      this.refreshDemo();
      return;
    }
    await this.registry.disconnect(sourceId);
    await this.refreshAccounts();
  }

  close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.fleetTimer) clearTimeout(this.fleetTimer);
    if (this.quotaTimer) clearTimeout(this.quotaTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.heartbeatTimer = null;
    this.fleetTimer = null;
    this.quotaTimer = null;
    this.debounceTimer = null;
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    this.emitter.removeAllListeners();
    this.started = false;
    this.startPromise = null;
  }

  private async start(): Promise<void> {
    if (this.config.demo) {
      this.refreshDemo();
    } else {
      await Promise.all([this.refreshFleet(), this.refreshQuota()]);
    }
    this.heartbeatTimer = setInterval(() => {
      this.emit({ type: "heartbeat", data: { generatedAt: Date.now() } });
    }, heartbeatMs);
    this.started = true;
  }

  private refreshDemo(): void {
    const scenario = getDemoScenario();
    this.fleet = demoFleet(scenario);
    this.quota = demoQuota(scenario);
    const baseline = initialDemoAccounts();
    this.demoAccountViews = this.demoAccountViews.map((account) => {
      if (account.sourceId !== "claude:oauth-profile:····c81d") return account;
      const original = baseline.find(
        (candidate) => candidate.sourceId === account.sourceId,
      );
      return {
        ...account,
        windows:
          scenario === "incomparable"
            ? account.windows.filter((window) => window.id !== "model:fable")
            : (original?.windows ?? account.windows),
      };
    });
    this.accounts = demoAccounts(scenario, Date.now(), this.demoAccountViews);
    this.accounts.detected = this.accounts.detected.filter(
      (profile) =>
        !this.demoAccountViews.some(
          (account) => account.sourceId === profile.sourceId,
        ),
    );
    this.emit({ type: "fleet", data: this.fleet });
    this.emit({ type: "quota", data: this.quota });
    this.emit({ type: "accounts", data: this.accounts });
  }

  private emit(event: StreamEvent): void {
    assertCleanPayload(event);
    this.emitter.emit("event", event);
  }

  private async refreshFleet(): Promise<void> {
    if (
      this.refreshingFleet ||
      !this.config.fleetCommand ||
      !this.config.fmHome
    )
      return;
    this.refreshingFleet = true;
    try {
      const result = await executeFixedCommand(
        this.config.fleetCommand,
        "--json",
        {
          env: { ...process.env, FM_HOME: this.config.fmHome },
          timeoutMs: 45_000,
        },
      );
      const raw = JSON.parse(result.stdout) as unknown;
      const { enrichment, homes } = await this.readEnrichment(raw);
      const next = this.retainUnreachableWorkers(
        mapFleetPayload(raw, enrichment),
        this.fleet,
      );
      assertCleanPayload(next);
      this.fleet = next;
      this.resetWatchers(homes);
    } catch {
      this.fleet = fleetExecutionError(
        "Firstmate fleet snapshot failed",
        this.fleet.source.status === "loading" ? undefined : this.fleet,
      );
    } finally {
      this.refreshingFleet = false;
      this.emit({ type: "fleet", data: this.fleet });
      this.fleetTimer = setTimeout(
        () => void this.refreshFleet(),
        fleetRefreshMs,
      );
    }
  }

  private async refreshQuota(): Promise<void> {
    if (this.refreshingQuota) return;
    this.refreshingQuota = true;
    try {
      const result = await executeFixedCommand(
        this.config.quotaCommand,
        "--json",
        {
          env: process.env,
          timeoutMs: 20_000,
        },
      );
      const next = parseQuotaPayload(JSON.parse(result.stdout) as unknown);
      assertCleanPayload(next);
      this.quota = next;
    } catch {
      this.quota = quotaExecutionError("quota-axi --json failed");
    } finally {
      this.refreshingQuota = false;
      await this.refreshAccounts();
      this.emit({ type: "quota", data: this.quota });
      const critical = this.quota.providers.some((provider) =>
        provider.windows.some(
          (window) =>
            window.percentRemaining !== null && window.percentRemaining <= 15,
        ),
      );
      this.quotaTimer = setTimeout(
        () => void this.refreshQuota(),
        critical ? criticalQuotaRefreshMs : normalQuotaRefreshMs,
      );
    }
  }

  private detectedProfiles(): DetectedProfile[] {
    // quota-axi schema v3 does not expose a stable per-profile identifier on its
    // safe --json surface. Inventing one would conflate accounts, so live mode
    // reports detection as unsupported until the authoritative source adds it.
    return [];
  }

  private async refreshAccounts(): Promise<void> {
    if (this.config.demo) return;
    try {
      const registrations = await this.registry.list();
      this.accounts = buildAccountsSnapshot(
        registrations,
        this.quota,
        this.detectedProfiles(),
        "quota-axi --json does not report stable per-profile identifiers; no account relationship is inferred",
      );
    } catch {
      this.accounts = {
        generatedAt: Date.now(),
        detection: {
          status: "error",
          reason: "Crewdeck account registry is unavailable",
        },
        accounts: [],
        detected: [],
      };
    }
    this.emit({ type: "accounts", data: this.accounts });
  }

  private async readEnrichment(
    raw: unknown,
  ): Promise<{ enrichment: FleetEnrichment; homes: PrivateHome[] }> {
    const result = new Map<string, ReturnType<typeof parseMetaAllowlist>>();
    const homes: PrivateHome[] = [];
    if (!this.config.fmHome || !isRecord(raw))
      return { enrichment: result, homes };
    homes.push({ id: "primary", location: this.config.fmHome, remote: false });
    const secondmate = isRecord(raw.secondmate_current)
      ? raw.secondmate_current
      : {};
    if (Array.isArray(secondmate.records)) {
      for (const row of secondmate.records) {
        if (!isRecord(row)) continue;
        const id = safeIdentifier(row.id, "");
        if (
          !id ||
          row.remote === true ||
          row.registered !== true ||
          typeof row.home !== "string"
        )
          continue;
        const validHome = await this.validateSecondmateHome(id, row.home);
        if (validHome)
          homes.push({
            id: `secondmate:${id}`,
            location: validHome,
            remote: false,
          });
      }
    }

    const taskIdsByHome = new Map<string, string[]>();
    taskIdsByHome.set(
      "primary",
      Array.isArray(raw.tasks)
        ? raw.tasks
            .filter(isRecord)
            .map((task) => safeIdentifier(task.id, ""))
            .filter(Boolean)
        : [],
    );
    if (Array.isArray(secondmate.records)) {
      for (const row of secondmate.records) {
        if (!isRecord(row)) continue;
        const id = safeIdentifier(row.id, "");
        if (!id || !Array.isArray(row.endpoints)) continue;
        taskIdsByHome.set(
          `secondmate:${id}`,
          row.endpoints
            .filter(isRecord)
            .map((endpoint) => safeIdentifier(endpoint.id, ""))
            .filter(Boolean),
        );
      }
    }

    await Promise.all(
      homes.flatMap((home) =>
        (taskIdsByHome.get(home.id) ?? []).map(async (taskId) => {
          const parsed = await this.readMeta(home.location, taskId);
          if (parsed) result.set(`${home.id}\u0000${taskId}`, parsed);
        }),
      ),
    );
    return { enrichment: result, homes };
  }

  private async readMeta(
    home: string,
    taskId: string,
  ): Promise<ReturnType<typeof parseMetaAllowlist> | null> {
    const stateDirectory = join(home, "state");
    const metaFile = join(stateDirectory, `${taskId}.meta`);
    const statusFile = join(stateDirectory, `${taskId}.status`);
    try {
      const [resolvedState, metaInfo, raw] = await Promise.all([
        realpath(stateDirectory),
        lstat(metaFile),
        readFile(metaFile, { encoding: "utf8", flag: "r" }),
      ]);
      const within = relative(home, resolvedState);
      if (
        within.startsWith("..") ||
        isAbsolute(within) ||
        metaInfo.isSymbolicLink() ||
        !metaInfo.isFile() ||
        metaInfo.size > 64 * 1024
      ) {
        return null;
      }
      let updatedAt = metaInfo.mtimeMs;
      try {
        const statusInfo = await stat(statusFile);
        if (statusInfo.isFile() && statusInfo.size <= 256 * 1024)
          updatedAt = statusInfo.mtimeMs;
      } catch {
        // A missing status log is represented as no meaningful update.
      }
      const birthtime =
        metaInfo.birthtimeMs > 0 ? metaInfo.birthtimeMs : metaInfo.mtimeMs;
      return parseMetaAllowlist(raw, { startedAt: birthtime, updatedAt });
    } catch {
      return null;
    }
  }

  private async validateSecondmateHome(
    id: string,
    value: string,
  ): Promise<string | null> {
    if (!isAbsolute(value) || !this.config.fmHome) return null;
    try {
      const [location, primary] = await Promise.all([
        realpath(value),
        realpath(this.config.fmHome),
      ]);
      if (location === primary) return null;
      const markerFile = join(location, ".fm-secondmate-home");
      const markerInfo = await lstat(markerFile);
      if (
        markerInfo.isSymbolicLink() ||
        !markerInfo.isFile() ||
        markerInfo.size > 256
      )
        return null;
      const marker = (await readFile(markerFile, "utf8")).trim();
      return marker === id ? location : null;
    } catch {
      return null;
    }
  }

  private resetWatchers(homes: PrivateHome[]): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    for (const home of homes) {
      try {
        const watcher = watch(
          join(home.location, "state"),
          { persistent: false },
          () => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(
              () => void this.refreshFleet(),
              300,
            );
          },
        );
        watcher.on("error", () => watcher.close());
        this.watchers.push(watcher);
      } catch {
        // Polling remains active when a local filesystem cannot be watched.
      }
    }
  }

  private retainUnreachableWorkers(
    next: FleetSnapshot,
    previous: FleetSnapshot,
  ): FleetSnapshot {
    const unreachable = new Set(
      next.homes
        .filter((home) => home.availability === "unreachable")
        .map((home) => home.id),
    );
    if (unreachable.size === 0) return next;
    const existing = new Set(
      next.workers.map((worker) => `${worker.homeId}\u0000${worker.id}`),
    );
    const retained = previous.workers
      .filter(
        (worker) =>
          unreachable.has(worker.homeId) &&
          !existing.has(`${worker.homeId}\u0000${worker.id}`),
      )
      .map((worker) => ({ ...worker, stale: true }));
    return { ...next, workers: [...next.workers, ...retained] };
  }
}

declare global {
  var __crewdeckService: CrewdeckService | undefined;
}

export function getService(): CrewdeckService {
  globalThis.__crewdeckService ??= new CrewdeckService();
  return globalThis.__crewdeckService;
}
