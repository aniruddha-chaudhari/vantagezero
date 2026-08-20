import { buildabilityScore, leadTimePressure, lifecycleRisk, worstRisk, type BuildabilityScoreBreakdown, type RiskLevel } from "./risk";

export interface PartInput {
  mpn: string;
  qtyPerUnit: number;
  monitored: boolean;
  criticality: "critical" | "important" | "optional";
  /** null = no valid observation yet (data-quality incident or not-yet-run) - never 0. */
  observedStock: number | null;
  leadTimeWeeks: number | null;
  marketingStatus: string | null;
}

export interface PartBuildability extends PartInput {
  requiredQty: number;
  buildableUnits: number | null;
  coverageRatio: number | null;
  shortfall: number | null;
  leadTimeRisk: RiskLevel;
  lifecycleRiskLevel: RiskLevel;
}

export function computePartBuildability(plannedBuildQty: number, part: PartInput): PartBuildability {
  const requiredQty = plannedBuildQty * part.qtyPerUnit;
  const hasObservation = part.observedStock != null;

  return {
    ...part,
    requiredQty,
    buildableUnits: hasObservation ? Math.floor(part.observedStock! / part.qtyPerUnit) : null,
    coverageRatio: hasObservation ? part.observedStock! / requiredQty : null,
    shortfall: hasObservation ? Math.max(0, requiredQty - part.observedStock!) : null,
    leadTimeRisk: leadTimePressure(part.leadTimeWeeks),
    lifecycleRiskLevel: lifecycleRisk(part.marketingStatus),
  };
}

export interface ProductBuildability {
  plannedBuildQty: number;
  /** min(buildableUnits) over monitored parts that have a real observation. Null if none do yet. */
  productBuildableUnits: number | null;
  monitoredCount: number;
  totalCount: number;
  /** Monitored parts with no observation yet - excluded from min(), surfaced instead of hidden. */
  partsAwaitingData: number;
  bottleneck: PartBuildability | null;
  score: BuildabilityScoreBreakdown | null;
}

export function computeProductBuildability(plannedBuildQty: number, parts: PartBuildability[]): ProductBuildability {
  const monitored = parts.filter((p) => p.monitored);
  const withData = monitored.filter((p) => p.buildableUnits != null);
  const partsAwaitingData = monitored.length - withData.length;

  const bottleneck = withData.reduce<PartBuildability | null>((worst, part) => {
    if (!worst) return part;
    return (part.buildableUnits as number) < (worst.buildableUnits as number) ? part : worst;
  }, null);

  const productBuildableUnits = bottleneck ? bottleneck.buildableUnits : null;

  const score =
    withData.length === 0
      ? null
      : buildabilityScore({
          coveragePct: Math.min(100, ((productBuildableUnits ?? 0) / plannedBuildQty) * 100),
          worstLeadTimeRisk: worstRisk(withData.map((p) => p.leadTimeRisk)),
          worstLifecycleRisk: worstRisk(withData.map((p) => p.lifecycleRiskLevel)),
        });

  return {
    plannedBuildQty,
    productBuildableUnits,
    monitoredCount: monitored.length,
    totalCount: parts.length,
    partsAwaitingData,
    bottleneck,
    score,
  };
}
