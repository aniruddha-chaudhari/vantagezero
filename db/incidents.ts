import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { approveHeal } from "@/brightdata/client";
import type { LastValidDistributorSnapshot, LastValidManufacturerSnapshot } from "@/brightdata/heal";
import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { componentObservations, lifecycleObservations, scrapeRuns, scraperIncidents, sourceTargets } from "@/db/schema";

/** Incident types that mean "the collector's extraction is broken" - healing can fix these.
 * PART_IDENTITY_MISMATCH means the resolved URL is wrong, not the collector; healing the
 * collector wouldn't help. SCRAPER_RUN_FAILED is usually a transient network/timeout blip. */
const HEAL_ELIGIBLE_INCIDENT_TYPES = ["SCHEMA_VALIDATION_FAILED", "MISSING_REQUIRED_FIELD", "SEMANTIC_SANITY_FAILED"];
const MIN_CONSECUTIVE_FAILURES = 2;
const HEAL_COOLDOWN_HOURS = 24;

export interface OpenIncidentSummary {
  id: string;
  sourceTargetId: string;
  collectorId: string | null;
  incidentType: string;
  status: string;
  openedAt: Date;
  notes: string | null;
  sourceTarget: {
    mpn: string;
    sourceName: string;
    sourceType: "distributor" | "manufacturer";
    sourceUrl: string;
    region: string | null;
  };
  consecutiveFailureCount: number;
  healedInLast24h: boolean;
  /** Policy recommendation only - a caller may still override with its own --force. */
  eligibleForAutoHeal: boolean;
  ineligibleReason: string | null;
}

/**
 * Open incidents plus the rate-discipline facts (§12) a caller needs to decide whether to
 * heal. Runs one extra query per incident (recent scrape_runs, for the consecutive-failure
 * count), so pass `sourceTargetIds` whenever the caller only cares about a handful of
 * specific targets - e.g. the refresh route only needs the ones it just touched, not every
 * open incident in the system. Omit it for the full picture (the CI heal loop, the incidents
 * dashboard).
 */
export async function listOpenIncidentsForHealing(sourceTargetIds?: string[]): Promise<OpenIncidentSummary[]> {
  const incidents = await db
    .select({ incident: scraperIncidents, target: sourceTargets })
    .from(scraperIncidents)
    .innerJoin(sourceTargets, eq(scraperIncidents.sourceTargetId, sourceTargets.id))
    .where(
      sourceTargetIds
        ? and(eq(scraperIncidents.status, "open"), inArray(scraperIncidents.sourceTargetId, sourceTargetIds))
        : eq(scraperIncidents.status, "open"),
    );

  const results: OpenIncidentSummary[] = [];

  for (const { incident, target } of incidents) {
    const recentRuns = await db
      .select({ status: scrapeRuns.status })
      .from(scrapeRuns)
      .where(eq(scrapeRuns.sourceTargetId, target.id))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(5);

    let consecutiveFailureCount = 0;
    for (const run of recentRuns) {
      if (run.status !== "failed") break;
      consecutiveFailureCount++;
    }

    const cutoff = new Date(Date.now() - HEAL_COOLDOWN_HOURS * 60 * 60 * 1000);
    const [recentHeal] = target.collectorId
      ? await db
          .select({ id: scraperIncidents.id })
          .from(scraperIncidents)
          .where(
            and(
              eq(scraperIncidents.collectorId, target.collectorId),
              sql`${scraperIncidents.healStartedAt} is not null`,
              gte(scraperIncidents.healStartedAt, cutoff),
            ),
          )
          .limit(1)
      : [];
    const healedInLast24h = Boolean(recentHeal);

    let ineligibleReason: string | null = null;
    if (!HEAL_ELIGIBLE_INCIDENT_TYPES.includes(incident.incidentType)) {
      ineligibleReason = `Incident type "${incident.incidentType}" is not a collector-extraction failure`;
    } else if (healedInLast24h) {
      ineligibleReason = "This collector was already healed in the last 24 hours";
    } else if (consecutiveFailureCount < MIN_CONSECUTIVE_FAILURES) {
      ineligibleReason = `Only ${consecutiveFailureCount} consecutive failure(s) - waiting for a second before healing`;
    }

    results.push({
      id: incident.id,
      sourceTargetId: target.id,
      collectorId: target.collectorId,
      incidentType: incident.incidentType,
      status: incident.status,
      openedAt: incident.openedAt,
      notes: incident.notes,
      sourceTarget: {
        mpn: target.mpn,
        sourceName: target.sourceName,
        sourceType: target.sourceType,
        sourceUrl: target.sourceUrl,
        region: target.region,
      },
      consecutiveFailureCount,
      healedInLast24h,
      eligibleForAutoHeal: ineligibleReason == null,
      ineligibleReason,
    });
  }

  return results;
}

export interface LatestValidSnapshotResult {
  sourceTarget: {
    id: string;
    mpn: string;
    sourceName: string;
    sourceType: "distributor" | "manufacturer";
    sourceUrl: string;
    region: string | null;
    collectorId: string | null;
  };
  distributor: LastValidDistributorSnapshot | null;
  manufacturer: LastValidManufacturerSnapshot | null;
}

/** Gate 3 (continuity) needs the last valid observation to compare against - this is that read. */
export async function getLatestValidSnapshot(sourceTargetId: string): Promise<LatestValidSnapshotResult | null> {
  const [target] = await db.select().from(sourceTargets).where(eq(sourceTargets.id, sourceTargetId));
  if (!target) return null;

  let distributor: LastValidDistributorSnapshot | null = null;
  let manufacturer: LastValidManufacturerSnapshot | null = null;

  if (target.sourceType === "distributor") {
    const [obs] = await db
      .select()
      .from(componentObservations)
      .where(eq(componentObservations.sourceTargetId, target.id))
      .orderBy(desc(componentObservations.observedAt))
      .limit(1);
    if (obs) {
      const raw = obs.rawNormalizedJson as Record<string, unknown> | null;
      distributor = {
        stock: obs.stock,
        incoming: obs.incoming,
        leadTimeWeeks: obs.leadTimeWeeks,
        currency: obs.currency,
        package: (raw?.package as string) ?? null,
      };
    }
  } else {
    const [obs] = await db
      .select()
      .from(lifecycleObservations)
      .where(eq(lifecycleObservations.sourceTargetId, target.id))
      .orderBy(desc(lifecycleObservations.observedAt))
      .limit(1);
    if (obs) {
      manufacturer = {
        marketingStatus: obs.marketingStatus,
        productionStatus: obs.productionStatus,
        longevityYears: obs.longevityYears,
        package: obs.package,
        grade: obs.grade,
      };
    }
  }

  return {
    sourceTarget: {
      id: target.id,
      mpn: target.mpn,
      sourceName: target.sourceName,
      sourceType: target.sourceType,
      sourceUrl: target.sourceUrl,
      region: target.region,
      collectorId: target.collectorId,
    },
    distributor,
    manufacturer,
  };
}

export interface ResolveIncidentInput {
  gateResultsJson?: unknown;
  healPrompt?: string;
  resolution: "auto_approved" | "auto_rejected" | "human_approved" | "human_rejected";
  status: "resolved" | "rejected" | "awaiting_approval" | "open";
  triggeredBy?: "cron" | "manual";
}

/**
 * The one place gate outcomes get written back. On approval, re-runs the collector via the
 * same ingestSourceTarget every other path uses, so "approved" always means "re-verified,"
 * never just "marked approved and hoped."
 */
export async function resolveIncident(incidentId: string, input: ResolveIncidentInput) {
  const [incident] = await db.select().from(scraperIncidents).where(eq(scraperIncidents.id, incidentId));
  if (!incident) throw new Error(`incident ${incidentId} not found`);

  let reingestResult = null;
  if (input.status === "resolved" && (input.resolution === "auto_approved" || input.resolution === "human_approved")) {
    reingestResult = await ingestSourceTarget(incident.sourceTargetId, {
      triggeredBy: input.triggeredBy === "cron" ? "cron" : "manual",
    });

    // Approval is not resolution. Bright Data may report `save_new_template` before the
    // effective production collector has propagated (or even when promotion silently did
    // not happen). Leave the incident open so the CI caller can wait and retry verification.
    if (!reingestResult.ok) {
      return { incident, reingestResult, verified: false };
    }
  }

  const resolvedAt = input.status === "resolved" ? new Date() : null;
  const [updatedIncident] = await db
    .update(scraperIncidents)
    .set({
      status: input.status,
      resolution: input.resolution,
      gateResultsJson: input.gateResultsJson ?? incident.gateResultsJson,
      healPrompt: input.healPrompt ?? incident.healPrompt,
      healStartedAt: incident.healStartedAt ?? new Date(),
      resolvedAt,
    })
    .where(eq(scraperIncidents.id, incidentId))
    .returning();

  // Failed verification attempts open fresh extraction incidents. Once a later verification
  // succeeds, resolve those duplicates too; do not touch identity/network incidents.
  if (input.status === "resolved" && reingestResult?.ok) {
    await db
      .update(scraperIncidents)
      .set({ status: "resolved", resolution: input.resolution, resolvedAt })
      .where(
        and(
          eq(scraperIncidents.sourceTargetId, incident.sourceTargetId),
          eq(scraperIncidents.status, "open"),
          inArray(scraperIncidents.incidentType, HEAL_ELIGIBLE_INCIDENT_TYPES),
        ),
      );
  }

  return { incident: updatedIncident, reingestResult, verified: reingestResult == null || reingestResult.ok };
}

/**
 * The one exception to "Vantage never manages collectors" (§4): a human approving or
 * rejecting an already-escalated incident from the Scraper Health screen.
 */
export async function approveIncidentHeal(incidentId: string, opts: { reject: boolean }) {
  const [row] = await db
    .select({ incident: scraperIncidents, target: sourceTargets })
    .from(scraperIncidents)
    .innerJoin(sourceTargets, eq(scraperIncidents.sourceTargetId, sourceTargets.id))
    .where(eq(scraperIncidents.id, incidentId));
  if (!row) throw new Error(`incident ${incidentId} not found`);
  if (!row.target.collectorId) throw new Error("source target has no collector_id");

  await approveHeal(row.target.collectorId, row.target.sourceUrl, { reject: opts.reject });

  return resolveIncident(incidentId, {
    status: opts.reject ? "rejected" : "resolved",
    resolution: opts.reject ? "human_rejected" : "human_approved",
    triggeredBy: "manual",
  });
}
