"use client";

import { useMemo, useState } from "react";
import type {
  FleetSnapshot,
  RuntimeFamily,
  Worker,
  WorkerStatus,
} from "@/server/contracts";
import { elapsedTime } from "@/server/elapsed";
import { formatElapsed } from "./format";
import { AnchorIcon, Pennant } from "./icons";
import { SectionCap } from "./section-cap";
import { StatusTag, statusLabels } from "./status-tag";
import { WorkerDrawer } from "./worker-drawer";

const order: WorkerStatus[] = [
  "blocked",
  "needs-decision",
  "review",
  "working",
  "paused",
  "done",
  "unknown",
];

function WorkerRow({
  worker,
  now,
  open,
  onOpen,
}: {
  worker: Worker;
  now: number;
  open: boolean;
  onOpen: () => void;
}) {
  const elapsed = elapsedTime(worker.startedAt, worker.endedAt, now);
  return (
    <button
      className={`berth is-${worker.status}`}
      onClick={onOpen}
      aria-expanded={open}
    >
      <span className="b-id">
        <span className="task">{worker.id}</span>
        <span className="proj">
          {worker.project} <span className="kind">{worker.kind}</span>
        </span>
      </span>
      <span className="b-rt">
        <span className="rt-pair">
          <span className="rt-runtime">{worker.runtime}</span>
          <span className="rt-sep">⌁</span>
          <span className="rt-model">{worker.model}</span>
        </span>
        <span className="elapsed">
          {formatElapsed(elapsed.milliseconds)}{" "}
          {elapsed.running ? "elapsed" : "total"} · {worker.effort}
        </span>
      </span>
      <span className="b-phase">
        <span className="phase-label">{worker.phase.label}</span>
        <span
          className="phase-track"
          role="img"
          aria-label={`phase ${worker.phase.current} of ${worker.phase.total}`}
        >
          {Array.from({ length: worker.phase.total }, (_, index) => (
            <span
              className={`phase-seg ${index + 1 < worker.phase.current ? "on" : index + 1 === worker.phase.current ? "now" : ""}`}
              key={index}
            />
          ))}
        </span>
      </span>
      <span className="b-news">
        <span className="last" title={worker.last.text}>
          {worker.last.text}
        </span>
        <span className="next">
          <b>next</b> {worker.next}
        </span>
      </span>
      <span className="b-flags">
        <StatusTag status={worker.status} />
        {(worker.pr || worker.ci) && (
          <span className="prci">
            {worker.pr && (
              <span
                className={`tag ${worker.pr.state === "merged" ? "ok" : ""}`}
              >
                PR #{worker.pr.number} {worker.pr.state}
              </span>
            )}
            {worker.ci && (
              <span
                className={`tag ${worker.ci.state === "pass" ? "ok" : worker.ci.state === "fail" ? "fail" : worker.ci.state === "running" ? "run" : ""}`}
              >
                CI {worker.ci.label}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

export function FleetBoard({
  fleet,
  now,
}: {
  fleet: FleetSnapshot | null;
  now: number;
}) {
  const [statuses, setStatuses] = useState<Set<WorkerStatus>>(new Set());
  const [project, setProject] = useState("all");
  const [runtime, setRuntime] = useState("all");
  const [homeId, setHomeId] = useState("all");
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const workers = useMemo(() => fleet?.workers ?? [], [fleet]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        order.map((status) => [
          status,
          workers.filter((worker) => worker.status === status).length,
        ]),
      ) as Record<WorkerStatus, number>,
    [workers],
  );
  const visible = workers.filter(
    (worker) =>
      (statuses.size === 0 || statuses.has(worker.status)) &&
      (project === "all" || worker.project === project) &&
      (runtime === "all" || worker.runtime === runtime) &&
      (homeId === "all" || worker.homeId === homeId),
  );
  const openWorker =
    workers.find(
      (worker) =>
        worker.id === openWorkerId &&
        worker.homeId ===
          (visible.find((row) => row.id === openWorkerId)?.homeId ??
            worker.homeId),
    ) ?? null;
  const loading = !fleet || fleet.source.status === "loading";
  const toggle = (status: WorkerStatus | null) => {
    if (status === null) return setStatuses(new Set());
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };
  const projects = [...new Set(workers.map((worker) => worker.project))].sort();
  const runtimes = [
    ...new Set(workers.map((worker) => worker.runtime)),
  ].sort() as RuntimeFamily[];
  return (
    <section aria-labelledby="watch-bill-title">
      <SectionCap note="every worker owned by this home and registered second mates">
        <h2 id="watch-bill-title">Watch bill</h2>
      </SectionCap>
      {!loading && (
        <div className="filters" role="group" aria-label="Fleet filters">
          <button
            className="fchip"
            aria-pressed={statuses.size === 0}
            onClick={() => toggle(null)}
          >
            all <span className="n">{workers.length}</span>
          </button>
          {order
            .filter((status) => counts[status] > 0)
            .map((status) => (
              <button
                className="fchip"
                aria-pressed={statuses.has(status)}
                onClick={() => toggle(status)}
                key={status}
              >
                <Pennant status={status} />
                <span>{statusLabels[status]}</span>
                <span className="n">{counts[status]}</span>
              </button>
            ))}
          <span className="spacer" />
          <label>
            <span className="sr-only">Project</span>
            <select
              className="fsel"
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="all">project: all</option>
              {projects.map((value) => (
                <option value={value} key={value}>
                  project: {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Runtime</span>
            <select
              className="fsel"
              value={runtime}
              onChange={(event) => setRuntime(event.target.value)}
            >
              <option value="all">runtime: all</option>
              {runtimes.map((value) => (
                <option value={value} key={value}>
                  runtime: {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Home</span>
            <select
              className="fsel"
              value={homeId}
              onChange={(event) => setHomeId(event.target.value)}
            >
              <option value="all">home: all</option>
              {fleet.homes.map((home) => (
                <option value={home.id} key={home.id}>
                  {home.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {loading ? (
        <div className="berths" aria-label="Loading fleet">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="empty-fleet">
          <AnchorIcon size={28} />
          <span className="mono">All hands ashore</span>
          <p>
            No workers are registered in this Firstmate home. Dispatch one from
            firstmate and it will berth here when its authoritative state record
            lands.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-fleet">
          <span className="mono">Nothing matches these filters</span>
          <p>
            Clear a filter chip or select “all” to see the rest of the fleet.
          </p>
        </div>
      ) : (
        fleet.homes.map((home) => {
          const rows = visible
            .filter((worker) => worker.homeId === home.id)
            .sort(
              (left, right) =>
                order.indexOf(left.status) - order.indexOf(right.status),
            );
          if (!rows.length && home.availability === "live") return null;
          return (
            <section
              className="home-group"
              aria-label={home.label}
              key={home.id}
            >
              <SectionCap
                note={`${rows.length} worker${rows.length === 1 ? "" : "s"} · ${home.availability}`}
              >
                {home.label}
              </SectionCap>
              {home.availability !== "live" && (
                <div className={`home-state ${home.availability}`}>
                  <b>{home.availability}</b> ·{" "}
                  {home.reason ?? "showing retained values"}
                </div>
              )}
              <div className="berths">
                {rows.map((worker) => (
                  <WorkerRow
                    worker={worker}
                    now={now}
                    open={openWorkerId === worker.id}
                    onOpen={() => setOpenWorkerId(worker.id)}
                    key={`${worker.homeId}:${worker.id}`}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
      <WorkerDrawer
        worker={openWorker}
        home={fleet?.homes.find((home) => home.id === openWorker?.homeId)}
        now={now}
        onClose={() => setOpenWorkerId(null)}
      />
    </section>
  );
}
