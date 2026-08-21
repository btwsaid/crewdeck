export function resetCountdown(
  resetsAt: number | null,
  now = Date.now(),
): string {
  if (resetsAt === null) return "reset unavailable";
  const totalMinutes = Math.max(0, Math.ceil((resetsAt - now) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}
