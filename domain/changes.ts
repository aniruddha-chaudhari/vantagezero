import { canonicalLifecycleStatus } from "./risk";

export type ChangeSeverity = "low" | "warning" | "medium" | "high" | "critical";

/**
 * Every ChangeEvent's before/after carries exactly one matching key (see the detectors
 * below), so a generic "before → after" render works for all of them without the caller
 * needing to know the event's shape. Returns null rather than guessing if the stored JSON
 * doesn't look like that - the UI falls back to the plain message in that case.
 */
export function formatChangeDiff(before: unknown, after: unknown): string | null {
  if (typeof before !== "object" || before === null) return null;
  if (typeof after !== "object" || after === null) return null;
  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const key = Object.keys(afterObj)[0];
  if (!key || !(key in beforeObj)) return null;
  const b = beforeObj[key];
  const a = afterObj[key];
  if (b == null || a == null || typeof b === "object" || typeof a === "object") return null;
  return `${b} → ${a}`;
}

export interface ChangeEvent {
  eventType: string;
  severity: ChangeSeverity;
  message: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface StockSnapshot {
  stock: number;
  incoming: number | null;
  leadTimeWeeks: number | null;
}

/**
 * Structural vs semantic is decided by the caller (a validation failure never reaches
 * here - it opens a scraper_incidents row instead). Everything here compares two
 * already-valid observations, so any event produced is a real supply-chain fact.
 */
export function detectStockChanges(prev: StockSnapshot | null, curr: StockSnapshot): ChangeEvent[] {
  if (!prev) return [];
  const events: ChangeEvent[] = [];

  if (prev.stock > 0) {
    const dropRatio = (prev.stock - curr.stock) / prev.stock;
    if (dropRatio > 0.25) {
      events.push({
        eventType: "stock_drop",
        severity: dropRatio >= 1 ? "critical" : "high",
        message: `Stock dropped from ${prev.stock} to ${curr.stock} (${Math.round(dropRatio * 100)}% down)`,
        before: { stock: prev.stock },
        after: { stock: curr.stock },
      });
    }
  }

  if (prev.incoming != null && prev.incoming > 0 && (curr.incoming ?? 0) === 0) {
    events.push({
      eventType: "incoming_zero",
      severity: "warning",
      message: `Incoming quantity dropped to zero (was ${prev.incoming})`,
      before: { incoming: prev.incoming },
      after: { incoming: curr.incoming },
    });
  }

  if (prev.leadTimeWeeks != null && curr.leadTimeWeeks != null) {
    const delta = curr.leadTimeWeeks - prev.leadTimeWeeks;
    if (delta >= 8) {
      events.push({
        eventType: "lead_time_increase",
        severity: delta >= 16 ? "high" : "warning",
        message: `Lead time increased from ${prev.leadTimeWeeks} to ${curr.leadTimeWeeks} weeks`,
        before: { leadTimeWeeks: prev.leadTimeWeeks },
        after: { leadTimeWeeks: curr.leadTimeWeeks },
      });
    }
  }

  return events;
}

export interface LifecycleSnapshot {
  marketingStatus: string;
}

/**
 * The decline axis only. PREVIEW is scored as a risk (see LIFECYCLE_RISK in risk.ts) but is
 * deliberately not a member here: it precedes ACTIVE, so including it would make the normal
 * Preview -> Active release read as a *worsening* and fire a false alert. Transitions into
 * or out of Preview index as -1 and raise nothing, which is the intended behaviour.
 */
const LIFECYCLE_ORDER = ["ACTIVE", "NRND", "LAST_TIME_BUY", "OBSOLETE"];

export function detectLifecycleChanges(prev: LifecycleSnapshot | null, curr: LifecycleSnapshot): ChangeEvent[] {
  if (!prev) return [];
  // Same token/display-string bridge lifecycleRisk() uses - without it a move into
  // "Last Time Buy" indexes as -1 and never raises a lifecycle_worsened event at all.
  const prevIdx = LIFECYCLE_ORDER.indexOf(canonicalLifecycleStatus(prev.marketingStatus));
  const currIdx = LIFECYCLE_ORDER.indexOf(canonicalLifecycleStatus(curr.marketingStatus));
  if (prevIdx === -1 || currIdx === -1 || currIdx <= prevIdx) return [];

  return [
    {
      eventType: "lifecycle_worsened",
      severity: currIdx >= 3 ? "critical" : "high",
      message: `Lifecycle status moved from ${prev.marketingStatus} to ${curr.marketingStatus}`,
      before: { marketingStatus: prev.marketingStatus },
      after: { marketingStatus: curr.marketingStatus },
    },
  ];
}
