export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

const LIFECYCLE_RISK: Record<string, RiskLevel> = {
  ACTIVE: "low",
  NRND: "medium",
  LAST_TIME_BUY: "high",
  OBSOLETE: "critical",
};

/**
 * A missing/unrecognized marketing status is a data-quality gap, never a lifecycle
 * verdict - it renders "unknown", not a silently safe-looking "low" or alarming "critical".
 */
export function lifecycleRisk(marketingStatus: string | null): RiskLevel {
  if (!marketingStatus) return "unknown";
  return LIFECYCLE_RISK[marketingStatus.toUpperCase()] ?? "unknown";
}

export function leadTimePressure(weeks: number | null): RiskLevel {
  if (weeks == null) return "unknown";
  if (weeks <= 8) return "low";
  if (weeks <= 16) return "medium";
  if (weeks <= 26) return "high";
  return "critical";
}

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

/** Worst (highest-risk) level among a set of known levels; "unknown" if none are known. */
export function worstRisk(levels: RiskLevel[]): RiskLevel {
  const known = levels.filter((level): level is Exclude<RiskLevel, "unknown"> => level !== "unknown");
  if (known.length === 0) return "unknown";
  return known.reduce((worst, level) => (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(worst) ? level : worst));
}

const RISK_HEALTH_SCORE: Record<RiskLevel, number | null> = {
  low: 100,
  medium: 65,
  high: 30,
  critical: 0,
  unknown: null,
};

export interface BuildabilityScoreBreakdown {
  total: number;
  coverage: number;
  leadTime: number | null;
  lifecycle: number | null;
}

/**
 * 60% availability coverage + 20% lead-time health + 20% lifecycle health. A dimension
 * that's "unknown" (no monitored part has a value for it) drops out of the weighted
 * average entirely rather than being scored as if it were healthy - the breakdown panel
 * still shows it as null/"—" rather than a fabricated number.
 */
export function buildabilityScore(params: {
  coveragePct: number;
  worstLeadTimeRisk: RiskLevel;
  worstLifecycleRisk: RiskLevel;
}): BuildabilityScoreBreakdown {
  const leadTimeHealth = RISK_HEALTH_SCORE[params.worstLeadTimeRisk];
  const lifecycleHealth = RISK_HEALTH_SCORE[params.worstLifecycleRisk];

  const weights: Array<{ value: number | null; weight: number }> = [
    { value: params.coveragePct, weight: 0.6 },
    { value: leadTimeHealth, weight: 0.2 },
    { value: lifecycleHealth, weight: 0.2 },
  ];
  const knownWeight = weights.filter((w) => w.value != null).reduce((sum, w) => sum + w.weight, 0);
  const total =
    knownWeight === 0 ? 0 : weights.reduce((sum, w) => sum + (w.value ?? 0) * w.weight, 0) / knownWeight;

  return {
    total: Math.round(total),
    coverage: Math.round(params.coveragePct),
    leadTime: leadTimeHealth,
    lifecycle: lifecycleHealth,
  };
}
