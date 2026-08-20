/** Matches the Day-2 scheduler cadence (every 4-6 hours) plus headroom. */
export const FRESHNESS_WINDOW_MINUTES = 8 * 60;

export type RenderState = "fresh" | "stale" | "failed";

/**
 * "failed" is never decided here - it means no valid observation row exists at
 * all (an open incident with no prior snapshot). This only distinguishes fresh
 * from stale for an observation that does exist.
 */
export function renderStateForObservation(
  observedAt: Date,
  now: Date = new Date(),
  freshnessWindowMinutes: number = FRESHNESS_WINDOW_MINUTES,
): "fresh" | "stale" {
  const ageMinutes = (now.getTime() - observedAt.getTime()) / 60_000;
  return ageMinutes <= freshnessWindowMinutes ? "fresh" : "stale";
}

export function formatAge(observedAt: Date, now: Date = new Date()): string {
  const ms = now.getTime() - observedAt.getTime();
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
