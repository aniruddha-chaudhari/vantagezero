import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { componentObservations, priceBreaks, scrapeRuns, sourceTargets } from "@/db/schema";
import { renderStateForObservation } from "@/domain/freshness";

import { getLatestLifecycleByMpn } from "./queries";

/** Headline counts for the impact strip (master-plan §23 - "quantify everything"). */
export interface PlatformStats {
  collectors: number;
  domains: number;
  regions: number;
  trackedMpns: number;
  observations: number;
  pricePoints: number;
  collectorRuns: number;
  validationPassRate: number | null;
  incidentsCaught: number;
  healsPerformed: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const rows = await db.execute<{
    collectors: string;
    regions: string;
    tracked_mpns: string;
    observations: string;
    price_points: string;
    collector_runs: string;
    successful_runs: string;
    incidents_caught: string;
    heals_performed: string;
  }>(sql`
    select
      (select count(distinct collector_id) from source_targets where collector_id is not null) collectors,
      (select count(distinct region) from source_targets where region is not null) regions,
      (select count(distinct mpn) from source_targets) tracked_mpns,
      (select count(*) from component_observations)
        + (select count(*) from lifecycle_observations) observations,
      (select count(*) from price_breaks) price_points,
      (select count(*) from scrape_runs) collector_runs,
      (select count(*) from scrape_runs where status = 'success') successful_runs,
      (select count(*) from scraper_incidents) incidents_caught,
      (select count(*) from scraper_incidents where heal_prompt is not null) heals_performed
  `);
  const row = rows[0];

  const domains = new Set(
    (await db.select({ url: sourceTargets.sourceUrl }).from(sourceTargets)).map((r) => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return r.url;
      }
    }),
  ).size;

  const collectorRuns = Number(row.collector_runs);
  return {
    collectors: Number(row.collectors),
    domains,
    regions: Number(row.regions),
    trackedMpns: Number(row.tracked_mpns),
    observations: Number(row.observations),
    pricePoints: Number(row.price_points),
    collectorRuns,
    validationPassRate: collectorRuns > 0 ? Number(row.successful_runs) / collectorRuns : null,
    incidentsCaught: Number(row.incidents_caught),
    healsPerformed: Number(row.heals_performed),
  };
}

export interface CatalogEntry {
  mpn: string;
  imageUrl: string | null;
  manufacturer: string | null;
  package: string | null;
  /**
   * Stock is only ever aggregated within a single region (master-plan §5) - a UK figure and
   * an India figure are two separate pools, never one number. Sorted largest-pool first.
   */
  stockByRegion: Array<{ region: string; stock: number; supplierCount: number }>;
  supplierCount: number;
  /** Cheapest observed entry-tier price, with its own currency - never converted. */
  bestPrice: { unitPrice: number; currency: string; supplier: string } | null;
  marketingStatus: string | null;
  lastObservedAt: Date | null;
  freshness: "fresh" | "stale" | null;
}

/** The whole tracked catalog in one pass - the portfolio view's data source. */
export async function listCatalog(): Promise<CatalogEntry[]> {
  const targets = await db.select().from(sourceTargets);
  const distributorTargets = targets.filter((t) => t.sourceType === "distributor");
  if (distributorTargets.length === 0) return [];

  const obs = await db
    .select()
    .from(componentObservations)
    .where(
      inArray(
        componentObservations.sourceTargetId,
        distributorTargets.map((t) => t.id),
      ),
    )
    .orderBy(desc(componentObservations.observedAt));

  // Latest observation per source target, so a part on 3 storefronts counts each exactly once.
  const latestByTarget = new Map<string, (typeof obs)[number]>();
  for (const o of obs) if (!latestByTarget.has(o.sourceTargetId)) latestByTarget.set(o.sourceTargetId, o);

  const observationIds = [...latestByTarget.values()].map((o) => o.id);
  const breaks = observationIds.length
    ? await db.select().from(priceBreaks).where(inArray(priceBreaks.observationId, observationIds))
    : [];
  const breaksByObservation = new Map<string, typeof breaks>();
  for (const b of breaks) {
    const list = breaksByObservation.get(b.observationId) ?? [];
    list.push(b);
    breaksByObservation.set(b.observationId, list);
  }

  const lifecycleByMpn = await getLatestLifecycleByMpn([...new Set(targets.map((t) => t.mpn))]);

  const byMpn = new Map<string, CatalogEntry>();
  for (const target of distributorTargets) {
    const latest = latestByTarget.get(target.id);
    if (!latest) continue; // no valid observation here - contributes nothing, never a zero

    const entry: CatalogEntry = byMpn.get(target.mpn) ?? {
      mpn: target.mpn,
      imageUrl: null,
      manufacturer: null,
      package: null,
      stockByRegion: [],
      supplierCount: 0,
      bestPrice: null,
      marketingStatus: lifecycleByMpn.get(target.mpn)?.marketingStatus ?? null,
      lastObservedAt: null,
      freshness: null,
    };

    const raw = latest.rawNormalizedJson as Record<string, unknown> | null;
    entry.supplierCount += 1;

    const regionLabel = target.region ?? "unspecified";
    const pool = entry.stockByRegion.find((r) => r.region === regionLabel);
    if (pool) {
      pool.stock += latest.stock;
      pool.supplierCount += 1;
    } else {
      entry.stockByRegion.push({ region: regionLabel, stock: latest.stock, supplierCount: 1 });
    }

    if (!entry.imageUrl && latest.imageUrl) entry.imageUrl = latest.imageUrl;
    if (!entry.manufacturer && typeof raw?.manufacturer === "string") entry.manufacturer = raw.manufacturer;
    if (!entry.package && typeof raw?.package === "string") entry.package = raw.package;
    if (!entry.lastObservedAt || latest.observedAt > entry.lastObservedAt) {
      entry.lastObservedAt = latest.observedAt;
      entry.freshness = renderStateForObservation(latest.observedAt);
    }

    // Entry tier for this supplier. Only ever compared within a single currency.
    const tiers = (breaksByObservation.get(latest.id) ?? []).slice().sort((a, b) => a.minQty - b.minQty);
    const cheapest = tiers[0];
    if (cheapest) {
      const price = Number(cheapest.unitPrice);
      if (
        entry.bestPrice == null ||
        (entry.bestPrice.currency === cheapest.currency && price < entry.bestPrice.unitPrice)
      ) {
        entry.bestPrice = { unitPrice: price, currency: cheapest.currency, supplier: target.sourceName };
      }
    }

    byMpn.set(target.mpn, entry);
  }

  const entries = [...byMpn.values()];
  for (const entry of entries) entry.stockByRegion.sort((a, b) => b.stock - a.stock);
  return entries.sort((a, b) => a.mpn.localeCompare(b.mpn));
}

export interface SupplierPriceCurve {
  supplier: string;
  region: string | null;
  currency: string;
  stock: number;
  sourceUrl: string;
  tiers: Array<{ minQty: number; unitPrice: number }>;
  /** Unit price at the requested quantity's applicable tier, and the resulting line total. */
  unitPriceAtQty: number | null;
  lineTotalAtQty: number | null;
}

/**
 * Every supplier's full price ladder for one MPN, plus the effective price at a given
 * quantity. Prices stay in their own currency throughout - Vantage never converts, so a
 * GBP ladder and an INR ladder sit side by side, each labelled, never summed.
 */
export async function getSupplierPriceCurves(mpn: string, qty: number): Promise<SupplierPriceCurve[]> {
  const normalized = mpn.trim().toUpperCase();
  const targets = await db
    .select()
    .from(sourceTargets)
    .where(and(sql`upper(${sourceTargets.mpn}) = ${normalized}`, eq(sourceTargets.sourceType, "distributor")));

  const curves: SupplierPriceCurve[] = [];
  for (const target of targets) {
    const [latest] = await db
      .select()
      .from(componentObservations)
      .where(eq(componentObservations.sourceTargetId, target.id))
      .orderBy(desc(componentObservations.observedAt))
      .limit(1);
    if (!latest) continue;

    const tiers = (await db.select().from(priceBreaks).where(eq(priceBreaks.observationId, latest.id)))
      .map((b) => ({ minQty: b.minQty, unitPrice: Number(b.unitPrice) }))
      .sort((a, b) => a.minQty - b.minQty);
    if (tiers.length === 0) continue;

    // Highest tier whose threshold this quantity actually reaches.
    const applicable = tiers.filter((t) => t.minQty <= qty).pop() ?? null;

    curves.push({
      supplier: target.sourceName,
      region: target.region,
      currency: latest.currency,
      stock: latest.stock,
      sourceUrl: target.sourceUrl,
      tiers,
      unitPriceAtQty: applicable?.unitPrice ?? null,
      lineTotalAtQty: applicable ? applicable.unitPrice * qty : null,
    });
  }

  return curves.sort((a, b) => a.supplier.localeCompare(b.supplier));
}

/** MPNs that have price data from more than one supplier - the comparison view's candidates. */
export async function listComparableMpns(): Promise<Array<{ mpn: string; supplierCount: number }>> {
  const rows = await db.execute<{ mpn: string; suppliers: string }>(sql`
    select co.mpn, count(distinct st.source_name) suppliers
    from component_observations co
    join source_targets st on st.id = co.source_target_id
    join price_breaks pb on pb.observation_id = co.id
    group by co.mpn
    having count(distinct st.source_name) > 1
    order by count(distinct st.source_name) desc, co.mpn
  `);
  return rows.map((r) => ({ mpn: r.mpn, supplierCount: Number(r.suppliers) }));
}

export interface BuildCostLine {
  mpn: string;
  currency: string;
  supplier: string;
  unitPrice: number;
  lineTotal: number;
}

export interface BuildCostSummary {
  /** One subtotal per currency - a GBP total and an INR total are never added together. */
  byCurrency: Array<{ currency: string; total: number; lines: BuildCostLine[] }>;
  /** Parts with no price-break tier reaching the required quantity - listed, never priced as 0. */
  unpriced: string[];
}

/**
 * Cheapest achievable cost for a BOM, one line per part at its required quantity, grouped by
 * currency exactly like the pricing page (never converted, never blended into one total).
 */
export async function getBuildCostSummary(parts: Array<{ mpn: string; requiredQty: number }>): Promise<BuildCostSummary> {
  const lines: BuildCostLine[] = [];
  const unpriced: string[] = [];

  for (const part of parts) {
    const curves = await getSupplierPriceCurves(part.mpn, part.requiredQty);
    const priced = curves.filter((c) => c.lineTotalAtQty != null);
    if (priced.length === 0) {
      unpriced.push(part.mpn);
      continue;
    }
    const cheapest = priced.reduce((best, c) => (c.lineTotalAtQty! < best.lineTotalAtQty! ? c : best));
    lines.push({
      mpn: part.mpn,
      currency: cheapest.currency,
      supplier: cheapest.supplier,
      unitPrice: cheapest.unitPriceAtQty!,
      lineTotal: cheapest.lineTotalAtQty!,
    });
  }

  const byCurrencyMap = new Map<string, BuildCostLine[]>();
  for (const line of lines) {
    const list = byCurrencyMap.get(line.currency) ?? [];
    list.push(line);
    byCurrencyMap.set(line.currency, list);
  }

  const byCurrency = [...byCurrencyMap.entries()]
    .map(([currency, currencyLines]) => ({
      currency,
      total: currencyLines.reduce((sum, l) => sum + l.lineTotal, 0),
      lines: currencyLines.slice().sort((a, b) => b.lineTotal - a.lineTotal),
    }))
    .sort((a, b) => b.total - a.total);

  return { byCurrency, unpriced };
}

/** Daily validation pass rate - the plan's "pass rate over time" chart on Source Health. */
export async function getPassRateHistory(): Promise<
  Array<{ date: string; total: number; ok: number; passRate: number }>
> {
  const rows = await db.execute<{ d: string; total: string; ok: string }>(sql`
    select started_at::date::text d,
           count(*) total,
           count(*) filter (where status = 'success') ok
    from scrape_runs
    group by 1 order by 1
  `);
  return rows.map((r) => ({
    date: r.d,
    total: Number(r.total),
    ok: Number(r.ok),
    passRate: Number(r.total) > 0 ? Number(r.ok) / Number(r.total) : 0,
  }));
}
