import { PartIdentityMismatch } from "@/domain/errors";
import {
  checkCollisionGate,
  checkContinuityGate,
  checkShapeGate,
  evaluateGates,
  type GateEvaluation,
  type GateName,
} from "@/domain/gates";
import { validateDistributorObservation, validateManufacturerObservation } from "@/domain/schemas";

import { normalizeDistributorRaw, normalizeManufacturerRaw, type NormalizationTarget } from "./normalize";

/**
 * Same reasoning as NormalizationTarget: this needs to work from a plain JSON API response
 * (what the heal loop has), not require a live Drizzle row.
 */
export interface HealTarget extends NormalizationTarget {
  sourceType: "distributor" | "manufacturer";
}

export interface LastValidDistributorSnapshot {
  stock: number;
  incoming: number | null;
  leadTimeWeeks: number | null;
  currency: string;
  package: string | null;
}

export interface LastValidManufacturerSnapshot {
  marketingStatus: string;
  productionStatus: string | null;
  longevityYears: number | null;
  package: string | null;
  grade: string | null;
}

export interface HealEvaluation extends GateEvaluation {
  /** Set when normalize/validate itself failed - the preview never reached gate evaluation. */
  structuralError?: string;
}

/** The raw field distributors use for in-stock quantity - both current collectors happen to share this key. */
const DISTRIBUTOR_STOCK_RAW_FIELD = "in_stock_quantity";

function firstRow(raw: unknown): Record<string, unknown> {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
}

/**
 * Runs a healed collector preview through the exact same normalize + validate pipeline as
 * production ingestion (brightdata/ingestion.ts), then the four heal gates (domain/gates.ts).
 * One implementation - the standalone heal-check CLI and the CI heal-loop orchestrator both
 * call this instead of duplicating the logic.
 */
export function evaluateHealPreview(
  rawPreview: unknown,
  target: HealTarget,
  lastValid: LastValidDistributorSnapshot | LastValidManufacturerSnapshot | null,
): HealEvaluation {
  try {
    return target.sourceType === "manufacturer"
      ? evaluateManufacturerHeal(rawPreview, target, lastValid as LastValidManufacturerSnapshot | null)
      : evaluateDistributorHeal(rawPreview, target, lastValid as LastValidDistributorSnapshot | null);
  } catch (err) {
    // A preview that doesn't even pass structural/identity validation never reaches the
    // four-gate nuance at all - it's an unambiguous reject, not an escalation.
    const message = err instanceof Error ? err.message : String(err);
    const gate: GateName = err instanceof PartIdentityMismatch ? "identity" : "shape";
    return {
      results: [{ gate, passed: false, reason: message }],
      decision: "auto_reject",
      structuralError: message,
    };
  }
}

function evaluateDistributorHeal(
  rawPreview: unknown,
  target: HealTarget,
  lastValid: LastValidDistributorSnapshot | null,
): HealEvaluation {
  const normalized = normalizeDistributorRaw(rawPreview, target);
  const validated = validateDistributorObservation({ raw: normalized, expectedMpn: target.mpn });
  const rawRow = firstRow(rawPreview);

  const shape = checkShapeGate(
    {
      stock: validated.stock,
      incoming: validated.incoming,
      leadTimeWeeks: validated.leadTimeWeeks,
      currency: validated.currency,
      package: validated.package,
    },
    lastValid as Record<string, unknown> | null,
  );
  const continuity = checkContinuityGate(validated.stock, lastValid?.stock ?? null);
  const collision = checkCollisionGate(rawRow, DISTRIBUTOR_STOCK_RAW_FIELD);

  return evaluateGates([
    { gate: "identity", passed: true, reason: "MPN already verified during validation" },
    shape,
    continuity,
    collision,
  ]);
}

function evaluateManufacturerHeal(
  rawPreview: unknown,
  target: HealTarget,
  lastValid: LastValidManufacturerSnapshot | null,
): HealEvaluation {
  const normalized = normalizeManufacturerRaw(rawPreview, target);
  const validated = validateManufacturerObservation({ raw: normalized, expectedMpn: target.mpn });

  const shape = checkShapeGate(
    {
      marketingStatus: validated.marketingStatus,
      productionStatus: validated.productionStatus,
      longevityYears: validated.longevityYears,
      package: validated.package,
      grade: validated.grade,
    },
    lastValid as Record<string, unknown> | null,
  );

  // Lifecycle status is categorical, not a magnitude - continuity/collision don't apply.
  return evaluateGates([
    { gate: "identity", passed: true, reason: "MPN already verified during validation" },
    shape,
    { gate: "continuity", passed: true, reason: "Not applicable to categorical lifecycle data" },
    { gate: "collision", passed: true, reason: "Not applicable to categorical lifecycle data" },
  ]);
}
