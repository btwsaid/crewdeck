import { formatLocalDateTime, formatRelativeAge } from "./format";

export function EvidenceTime({
  updatedAt,
  now,
  subject = "Allowance evidence",
  prefix = "updated",
}: {
  updatedAt: number | null;
  now: number;
  subject?: string;
  prefix?: string;
}) {
  if (
    updatedAt === null ||
    !Number.isFinite(updatedAt) ||
    Number.isNaN(new Date(updatedAt).getTime())
  ) {
    return (
      <span
        className="evidence-time missing"
        aria-label={`${subject}: successful update time unavailable; no time was inferred`}
      >
        successful update time unavailable
      </span>
    );
  }

  const age = formatRelativeAge(updatedAt, now);
  const absolute = formatLocalDateTime(updatedAt);
  return (
    <time
      className="evidence-time"
      dateTime={new Date(updatedAt).toISOString()}
      title={`Absolute local time: ${absolute}`}
      aria-label={`${subject} ${prefix} ${age}; absolute local time ${absolute}`}
    >
      <span>
        {prefix} {age}
      </span>
      <span className="evidence-absolute"> · {absolute}</span>
    </time>
  );
}

export function NoEvidenceTime({ detail }: { detail: string }) {
  return (
    <div className="evidence-time missing" role="note">
      no successful allowance update · {detail}; update time unavailable
    </div>
  );
}
