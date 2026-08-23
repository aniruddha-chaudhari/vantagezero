import { desc, eq, type InferSelectModel } from "drizzle-orm";

import { runScraper } from "@/brightdata/client";
import { normalizeDistributorRaw, normalizeManufacturerRaw } from "@/brightdata/normalize";
import { db } from "@/db/client";
import { getProductBuildabilitySummary, getProductsMonitoringMpn } from "@/db/queries";
import {
  businessEvents,
  componentObservations,
  lifecycleObservations,
  priceBreaks,
  scrapeRuns,
  scraperIncidents,
  sourceTargets,
} from "@/db/schema";
import type { ChangeEvent } from "@/domain/changes";
import { detectLifecycleChanges, detectStockChanges } from "@/domain/changes";
import { VantageValidationError } from "@/domain/errors";
import { validateDistributorObservation, validateManufacturerObservation } from "@/domain/schemas";
import { sendSlackActivity, sendSlackAlert } from "@/lib/slack";

type SourceTarget = InferSelectModel<typeof sourceTargets>;
export type TriggeredBy = "manual" | "cron" | "judge" | "webhook";

export interface IngestResult {
  sourceTargetId: string;
  mpn: string;
  supplier: string;
  ok: boolean;
  detail: string;
}

async function loadTarget(sourceTargetId: string): Promise<SourceTarget & { collectorId: string }> {
  const [target] = await db.select().from(sourceTargets).where(eq(sourceTargets.id, sourceTargetId));
  if (!target) throw new Error(`source target ${sourceTargetId} not found`);
  if (!target.collectorId) throw new Error(`source target ${sourceTargetId} has no collector_id yet`);
  return target as SourceTarget & { collectorId: string };
}

async function failRun(target: SourceTarget, scrapeRunId: string, code: string, message: string): Promise<IngestResult> {
  await db
    .update(scrapeRuns)
    .set({ status: "failed", validationStatus: "invalid", finishedAt: new Date(), errorSummary: message })
    .where(eq(scrapeRuns.id, scrapeRunId));

  await db.insert(scraperIncidents).values({
    sourceTargetId: target.id,
    collectorId: target.collectorId,
    incidentType: code,
    status: "open",
    notes: message,
  });

  await sendSlackAlert(`⚠️ *Incident* — ${target.sourceName} / ${target.mpn}\n${message}`);
  return { sourceTargetId: target.id, mpn: target.mpn, supplier: target.sourceName, ok: false, detail: message };
}

/**
 * Validates one already-scraped payload and writes exactly one of: a fresh observation row
 * (+ price_breaks for distributors), or a scraper_incidents row. Never both, never neither,
 * never a fabricated zero. Shared by both entry points below so there is one implementation
 * of "is this payload trustworthy," not two - the only thing that differs between a CLI run
 * and a Scraper Studio webhook delivery is where `raw` came from, never what happens to it.
 *
 * Slack gets one line per scrape either way, but at two different tiers. An incident always
 * alerts (sendSlackAlert); a success posts only when the opt-in activity feed is enabled
 * (sendSlackActivity), because that one scales with catalog size and would burst-flood an
 * `--all` cycle. Both are distinct from recordChangeEvents()'s alert, which fires only when
 * a change is actually business-critical.
 */
async function finalizeIngest(target: SourceTarget, scrapeRunId: string, raw: unknown): Promise<IngestResult> {
  try {
    const detail =
      target.sourceType === "manufacturer"
        ? await ingestManufacturer(target, raw, scrapeRunId)
        : await ingestDistributor(target, raw, scrapeRunId);

    await db
      .update(scrapeRuns)
      .set({ status: "success", validationStatus: "valid", finishedAt: new Date() })
      .where(eq(scrapeRuns.id, scrapeRunId));

    await sendSlackActivity(`✅ Scraped ${target.sourceName} / ${target.mpn} — ${detail}`);
    return { sourceTargetId: target.id, mpn: target.mpn, supplier: target.sourceName, ok: true, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof VantageValidationError ? err.code : "UNKNOWN_INGEST_ERROR";
    return failRun(target, scrapeRunId, code, message);
  }
}

/**
 * Runs one source target's collector via the `bdata` CLI, then finalizes the result.
 * Used by the CLI script, the catalog resolver, and the local/judge-triggered API route -
 * anywhere the process itself is expected to invoke the collector.
 */
export async function ingestSourceTarget(
  sourceTargetId: string,
  opts: { triggeredBy: TriggeredBy } = { triggeredBy: "manual" },
): Promise<IngestResult> {
  const target = await loadTarget(sourceTargetId);

  const [run] = await db
    .insert(scrapeRuns)
    .values({ sourceTargetId: target.id, status: "running", triggeredBy: opts.triggeredBy })
    .returning();

  try {
    const result = await runScraper(target.collectorId, target.sourceUrl);
    return await finalizeIngest(target, run.id, result.raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failRun(target, run.id, "UNKNOWN_INGEST_ERROR", message);
  }
}

/**
 * Ingests a payload Bright Data already scraped and pushed to us - a Scraper Studio
 * scheduled run delivering via webhook. No CLI call: the collector ran on Bright Data's own
 * infra, so this is the one ingestion path that works unmodified inside a stock serverless
 * function (no writable filesystem or npm install needed at request time).
 */
export async function ingestWebhookPayload(sourceTargetId: string, raw: unknown): Promise<IngestResult> {
  const target = await loadTarget(sourceTargetId);

  const [run] = await db
    .insert(scrapeRuns)
    .values({ sourceTargetId: target.id, status: "running", triggeredBy: "webhook" })
    .returning();

  return finalizeIngest(target, run.id, raw);
}

/** Writes business_events for real changes, then checks whether any product that monitors
 * this MPN just became at-risk - reusing the same buildability math the UI shows, so the
 * alert can never say something the dashboard wouldn't. */
async function recordChangeEvents(mpn: string, sourceName: string, events: ChangeEvent[]): Promise<void> {
  if (events.length === 0) return;

  await db.insert(businessEvents).values(
    events.map((e) => ({
      mpn,
      eventType: e.eventType,
      severity: e.severity,
      beforeJson: e.before,
      afterJson: e.after,
      message: `${sourceName}: ${e.message}`,
    })),
  );

  const affectedProducts = await getProductsMonitoringMpn(mpn);
  for (const product of affectedProducts) {
    const summary = await getProductBuildabilitySummary(product.id);
    if (!summary) continue;

    const atRisk = (summary.buildability.score?.total ?? 100) < 80;
    if (!atRisk) continue;

    const bottleneck = summary.buildability.bottleneck;
    await sendSlackAlert(
      `*CRITICAL — ${product.name}*\n` +
        `${mpn} just changed. Buildable: ${summary.buildability.productBuildableUnits?.toLocaleString() ?? "—"} of ${summary.product.plannedBuildQty.toLocaleString()} units.\n` +
        `Bottleneck: ${bottleneck?.mpn ?? "—"}${bottleneck?.shortfall ? ` - short ${bottleneck.shortfall.toLocaleString()}` : ""}.`,
    );
  }
}

async function ingestDistributor(target: SourceTarget, raw: unknown, scrapeRunId: string): Promise<string> {
  const normalized = normalizeDistributorRaw(raw, target);
  const validated = validateDistributorObservation({ raw: normalized, expectedMpn: target.mpn });

  const [prior] = await db
    .select({ stock: componentObservations.stock, incoming: componentObservations.incoming, leadTimeWeeks: componentObservations.leadTimeWeeks })
    .from(componentObservations)
    .where(eq(componentObservations.sourceTargetId, target.id))
    .orderBy(desc(componentObservations.observedAt))
    .limit(1);

  const [observation] = await db
    .insert(componentObservations)
    .values({
      mpn: validated.mpn,
      sourceTargetId: target.id,
      scrapeRunId,
      stock: validated.stock,
      incoming: validated.incoming,
      incomingDate: validated.incomingDate,
      leadTimeWeeks: validated.leadTimeWeeks,
      currency: validated.currency,
      minimumOrderQty: validated.minimumOrderQty,
      orderMultiple: validated.orderMultiple,
      imageUrl: validated.imageUrl,
      rawNormalizedJson: validated,
    })
    .returning();

  if (validated.priceBreaks.length > 0) {
    await db.insert(priceBreaks).values(
      validated.priceBreaks.map((pb) => ({
        observationId: observation.id,
        minQty: pb.minQty,
        unitPrice: pb.unitPrice.toString(),
        currency: validated.currency,
      })),
    );
  }

  const events = detectStockChanges(prior ?? null, {
    stock: validated.stock,
    incoming: validated.incoming,
    leadTimeWeeks: validated.leadTimeWeeks,
  });
  await recordChangeEvents(target.mpn, target.sourceName, events);

  return `stock=${validated.stock} ${validated.currency}`;
}

async function ingestManufacturer(target: SourceTarget, raw: unknown, scrapeRunId: string): Promise<string> {
  const normalized = normalizeManufacturerRaw(raw, target);
  const validated = validateManufacturerObservation({ raw: normalized, expectedMpn: target.mpn });

  const [prior] = await db
    .select({ marketingStatus: lifecycleObservations.marketingStatus })
    .from(lifecycleObservations)
    .where(eq(lifecycleObservations.sourceTargetId, target.id))
    .orderBy(desc(lifecycleObservations.observedAt))
    .limit(1);

  await db.insert(lifecycleObservations).values({
    mpn: validated.mpn,
    sourceTargetId: target.id,
    scrapeRunId,
    marketingStatus: validated.marketingStatus,
    productionStatus: validated.productionStatus,
    longevityYears: validated.longevityYears,
    longevityStartDate: validated.longevityStartDate,
    package: validated.package,
    grade: validated.grade,
  });

  const events = detectLifecycleChanges(prior ?? null, { marketingStatus: validated.marketingStatus });
  await recordChangeEvents(target.mpn, target.sourceName, events);

  return `marketingStatus=${validated.marketingStatus}`;
}
