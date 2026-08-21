export interface ElapsedResult {
  milliseconds: number | null;
  running: boolean;
}

export function elapsedTime(
  startedAt: number | null,
  endedAt: number | null,
  now = Date.now(),
): ElapsedResult {
  if (startedAt === null || !Number.isFinite(startedAt) || startedAt < 0) {
    return { milliseconds: null, running: false };
  }
  const effectiveEnd = endedAt ?? now;
  if (!Number.isFinite(effectiveEnd) || effectiveEnd < startedAt) {
    return { milliseconds: 0, running: endedAt === null };
  }
  return {
    milliseconds: Math.floor(effectiveEnd - startedAt),
    running: endedAt === null,
  };
}

export function formatElapsed(milliseconds: number | null): string {
  if (milliseconds === null) return "elapsed unavailable";
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}
