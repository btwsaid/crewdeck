"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AccountsSnapshot,
  FleetSnapshot,
  QuotaSnapshot,
} from "@/server/contracts";
import { AccountsView } from "./accounts-view";
import { FleetBoard } from "./fleet-board";
import { Masthead, type View } from "./masthead";
import { Provisions } from "./provisions";
import { SourceBanners } from "./source-banner";

interface Health {
  ok: boolean;
  mode: "synthetic" | "live";
}

type Scenario =
  | "live"
  | "loading"
  | "empty"
  | "stale"
  | "partial"
  | "critical"
  | "source-failure"
  | "incomparable";
const scenarios: Scenario[] = [
  "live",
  "loading",
  "empty",
  "stale",
  "partial",
  "critical",
  "source-failure",
  "incomparable",
];

async function localJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error("local request failed");
  return (await response.json()) as T;
}

export function Crewdeck() {
  const [view, setView] = useState<View>("deck");
  const [fleet, setFleet] = useState<FleetSnapshot | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AccountsSnapshot | null>(null);
  const [mode, setMode] = useState<Health["mode"]>("live");
  const [connection, setConnection] = useState<
    "connecting" | "live" | "reconnecting" | "stale"
  >("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [now, setNow] = useState(0);
  const [scenario, setScenarioState] = useState<Scenario>("live");

  useEffect(() => {
    let active = true;
    void Promise.all([
      localJson<FleetSnapshot>("/api/fleet"),
      localJson<QuotaSnapshot>("/api/quota"),
      localJson<AccountsSnapshot>("/api/accounts"),
      localJson<Health>("/api/health"),
    ])
      .then(([nextFleet, nextQuota, nextAccounts, health]) => {
        if (!active) return;
        setFleet(nextFleet);
        setQuota(nextQuota);
        setAccounts(nextAccounts);
        setMode(health.mode);
        setNow(Date.now());
      })
      .catch(() => {
        if (active) setConnection("reconnecting");
      });

    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    const receive = <T,>(
      event: MessageEvent<string>,
      setter: (value: T) => void,
    ) => {
      setter(JSON.parse(event.data) as T);
      setConnection("live");
      const receivedAt = Date.now();
      setLastHeartbeat(receivedAt);
      setNow(receivedAt);
    };
    const connect = () => {
      if (!active) return;
      const nextSource = new EventSource("/api/stream");
      source = nextSource;
      nextSource.addEventListener("fleet", (event) =>
        receive(event as MessageEvent<string>, setFleet),
      );
      nextSource.addEventListener("quota", (event) =>
        receive(event as MessageEvent<string>, setQuota),
      );
      nextSource.addEventListener("accounts", (event) =>
        receive(event as MessageEvent<string>, setAccounts),
      );
      nextSource.addEventListener("heartbeat", () => {
        setLastHeartbeat(Date.now());
        setConnection("live");
      });
      nextSource.onerror = () => {
        if (!active || source !== nextSource) return;
        setConnection("reconnecting");
        nextSource.close();
        source = null;
        reconnectTimer ??= window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1_000);
      };
    };
    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const timestamp = Date.now();
      // Time labels are semantic text, not motion; keep them aging even when
      // reduced motion is requested and while the live feed reconnects.
      setNow(timestamp);
      if (timestamp - lastHeartbeat > 35_000) setConnection("stale");
    }, 5_000);
    return () => clearInterval(interval);
  }, [lastHeartbeat]);

  const setScenario = async (next: Scenario) => {
    setScenarioState(next);
    const response = await localJson<{
      fleet: FleetSnapshot;
      quota: QuotaSnapshot;
      accounts: AccountsSnapshot;
    }>("/api/scenario", {
      method: "POST",
      body: JSON.stringify({ scenario: next }),
    });
    setFleet(response.fleet);
    setQuota(response.quota);
    setAccounts(response.accounts);
  };

  const mutateAccounts = useCallback(
    async (
      method: "POST" | "PATCH" | "DELETE",
      body: Record<string, string>,
    ) => {
      const next = await localJson<AccountsSnapshot>("/api/accounts", {
        method,
        body: JSON.stringify(body),
      });
      setAccounts(next);
    },
    [],
  );

  const clock = useMemo(
    () =>
      now === 0
        ? "--:--"
        : new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          }).format(now),
    [now],
  );
  const homeCount =
    fleet?.homes.filter((home) => home.kind === "secondmate").length ?? 0;
  const workerCount = fleet?.workers.length ?? 0;
  const summary = fleet
    ? `primary${homeCount ? ` + ${homeCount} second mate${homeCount === 1 ? "" : "s"}` : ""} · ${workerCount} worker${workerCount === 1 ? "" : "s"}`
    : "loading local sources";
  const feed =
    connection === "live" &&
    (fleet?.source.status === "partial" || quota?.source.status === "partial")
      ? "partial"
      : connection;
  const connectionStale =
    connection === "stale" || connection === "reconnecting";

  return (
    <>
      <Masthead
        view={view}
        onView={setView}
        clock={clock}
        feed={feed}
        summary={summary}
      />
      <main className="main">
        <SourceBanners
          fleet={fleet}
          quota={quota}
          connectionStale={connectionStale}
        />
        <section
          id="view-deck"
          role="tabpanel"
          aria-labelledby="tab-deck"
          hidden={view !== "deck"}
        >
          <Provisions quota={quota} now={now} />
          <FleetBoard fleet={fleet} now={now} />
        </section>
        <section
          id="view-accounts"
          role="tabpanel"
          aria-labelledby="tab-accounts"
          hidden={view !== "accounts"}
        >
          <AccountsView snapshot={accounts} now={now} mutate={mutateAccounts} />
        </section>
      </main>
      {mode === "synthetic" && (
        <div
          className="scenario-bar"
          role="group"
          aria-label="Synthetic scenario switcher"
        >
          <span className="cap">Synthetic</span>
          {scenarios.map((item) => (
            <button
              className="scen"
              aria-pressed={scenario === item}
              onClick={() => void setScenario(item)}
              key={item}
            >
              {item.replace("source-", "source ")}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
