import type { WorkerStatus } from "@/server/contracts";

export function AnchorIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 3.2a1.4 1.4 0 1 0-.01 0M8 4.6V13M5 7h6M3.2 9.8C3.6 12.2 5.6 13.6 8 13.6s4.4-1.4 4.8-3.8M3.2 9.8l-1.1 1m1.1-1 1.5.3m8.1-.3 1.1 1m-1.1-1-1.5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5 13.5 3.5V8c0 3.4-2.4 5.6-5.5 6.5C4.9 13.6 2.5 11.4 2.5 8V3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m5.6 8 1.7 1.7 3-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Pennant({ status }: { status: WorkerStatus }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4 };
  return (
    <svg className="pennant" viewBox="0 0 16 12" aria-hidden="true">
      {status === "working" && <path d="M1 1 15 6 1 11Z" fill="currentColor" />}
      {status === "paused" && (
        <>
          <rect x="1" y="1" width="14" height="10" {...common} />
          <rect x="5" y="3.5" width="2" height="5" fill="currentColor" />
          <rect x="9" y="3.5" width="2" height="5" fill="currentColor" />
        </>
      )}
      {status === "blocked" && (
        <>
          <rect x="1" y="1" width="14" height="10" {...common} />
          <path
            d="m1 1 14 10M15 1 1 11"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </>
      )}
      {status === "needs-decision" && (
        <>
          <rect x="1" y="1" width="14" height="10" {...common} />
          <rect x="1" y="1" width="7" height="5" fill="currentColor" />
          <rect x="8" y="6" width="7" height="5" fill="currentColor" />
        </>
      )}
      {status === "review" && (
        <>
          <rect x="1" y="1" width="14" height="10" {...common} />
          <rect x="1" y="6" width="14" height="5" fill="currentColor" />
        </>
      )}
      {status === "done" && (
        <path d="M3 1v10m0-9h9L9.5 4.5 12 7H3" {...common} />
      )}
      {status === "unknown" && (
        <path
          d="M1 1h14v10H1Zm5 2.2c.4-.5.9-.8 1.7-.8 1 0 1.8.6 1.8 1.5 0 1.3-1.5 1.4-1.5 2.5m0 1.7v1"
          {...common}
        />
      )}
    </svg>
  );
}
