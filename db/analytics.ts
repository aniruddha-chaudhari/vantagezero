import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { renderStateForObservation } from "@/domain/freshness";

import {
  getLatestLifecycleByMpn,
  latestDistributorObservationsForMpns,
  listLatestDistributorObservations,
  type LatestDistributorObservation,
} from "./queries";

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
    domains: string;
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
      -- hostname of each source_url, counted in Postgres rather than fetching every URL to
      -- de-duplicate them in JS. Strips scheme, path and any port, matching URL.hostname.
      (select count(distinct split_part(split_part(split_part(source_url, '//', 2), '/', 1), ':', 1))
         from source_targets) domains,
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

  const domains = Number(row.domains);
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

/**
 * The whole tracked catalog in one pass - the portfolio view's data source.
 *
 * Two queries, issued together: latest-observation-per-supplier (price ladder included) and
 * latest lifecycle status. It used to be five, chained - targets, observations, price breaks,
 * then two more inside the lifecycle lookup - which on Vercel meant five sequential network
 * hops to the database region before a single card could render.
 */
export async function listCatalog(): Promise<CatalogEntry[]> {
  const [observations, lifecycleByMpn] = await Promise.all([
    listLatestDistributorObservations(),
    getLatestLifecycleByMpn(),
  ]);
  if (observations.length === 0) return [];

  const byMpn = new Map<string, CatalogEntry>();
  for (const latest of observations) {
    const entry: CatalogEntry = byMpn.get(latest.mpn) ?? {
      mpn: latest.mpn,
      imageUrl: null,
      manufacturer: null,
      package: null,
      stockByRegion: [],
      supplierCount: 0,
      bestPrice: null,
      marketingStatus: lifecycleByMpn.get(latest.mpn)?.marketingStatus ?? null,
      lastObservedAt: null,
      freshness: null,
    };

    const raw = latest.rawNormalizedJson;
    entry.supplierCount += 1;

    const regionLabel = latest.region ?? "unspecified";
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

    // Entry tier for this supplier - already ordered by min_qty. Only ever compared within
    // a single currency.
    const cheapest = latest.tiers[0];
    if (cheapest) {
      if (
        entry.bestPrice == null ||
        (entry.bestPrice.currency === cheapest.currency && cheapest.unitPrice < entry.bestPrice.unitPrice)
      ) {
        entry.bestPrice = { unitPrice: cheapest.unitPrice, currency: cheapest.currency, supplier: latest.sourceName };
      }
    }

    byMpn.set(latest.mpn, entry);
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
/** Shape one supplier's already-fetched observation into a price curve at `qty`. */
function curveFromObservation(obs: LatestDistributorObservation, qty: number): SupplierPriceCurve | null {
  const tiers = obs.tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }));
  if (tiers.length === 0) return null;

  // Highest tier whose threshold this quantity actually reaches.
  const applicable = tiers.filter((t) => t.minQty <= qty).pop() ?? null;

  return {
    supplier: obs.sourceName,
    region: obs.region,
    currency: obs.currency,
    stock: obs.stock,
    sourceUrl: obs.sourceUrl,
    tiers,
    unitPriceAtQty: applicable?.unitPrice ?? null,
    lineTotalAtQty: applicable ? applicable.unitPrice * qty : null,
  };
}

export async function getSupplierPriceCurves(mpn: string, qty: number): Promise<SupplierPriceCurve[]> {
  const observations = await latestDistributorObservationsForMpns([mpn]);
  return observations
    .map((obs) => curveFromObservation(obs, qty))
    .filter((c): c is SupplierPriceCurve => c !== null)
    .sort((a, b) => a.supplier.localeCompare(b.supplier));
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

  // Every part's suppliers and price ladders in a single query. This was the app's worst
  // waterfall by a wide margin: one query per part to find its suppliers, then two more per
  // supplier, all sequential - a 5-part BOM across 3 storefronts meant ~35 round trips
  // before the build page could render its cost table.
  const observations = await latestDistributorObservationsForMpns(parts.map((p) => p.mpn));
  const byMpn = new Map<string, LatestDistributorObservation[]>();
  for (const obs of observations) {
    const key = obs.mpn.trim().toUpperCase();
    const list = byMpn.get(key) ?? [];
    list.push(obs);
    byMpn.set(key, list);
  }

  for (const part of parts) {
    const curves = (byMpn.get(part.mpn.trim().toUpperCase()) ?? [])
      .map((obs) => curveFromObservation(obs, part.requiredQty))
      .filter((c): c is SupplierPriceCurve => c !== null);
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
