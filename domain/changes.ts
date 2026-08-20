export type ChangeSeverity = "low" | "warning" | "medium" | "high" | "critical";

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

const LIFECYCLE_ORDER = ["ACTIVE", "NRND", "LAST_TIME_BUY", "OBSOLETE"];

export function detectLifecycleChanges(prev: LifecycleSnapshot | null, curr: LifecycleSnapshot): ChangeEvent[] {
  if (!prev) return [];
  const prevIdx = LIFECYCLE_ORDER.indexOf(prev.marketingStatus.toUpperCase());
  const currIdx = LIFECYCLE_ORDER.indexOf(curr.marketingStatus.toUpperCase());
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
