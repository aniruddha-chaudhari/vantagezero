import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  bomItems,
  businessEvents,
  componentObservations,
  lifecycleObservations,
  priceBreaks,
  products,
  scrapeRuns,
  scraperIncidents,
  sourceTargets,
} from "@/db/schema";
import { computePartBuildability, computeProductBuildability, type PartInput } from "@/domain/buildability";
import { formatAge, renderStateForObservation } from "@/domain/freshness";

type BomItemRow = typeof bomItems.$inferSelect;

interface RegionStock {
  region: string;
  stock: number;
  leadTimeWeeks: number | null;
  imageUrl: string | null;
  observedAt: Date | null;
}

/** One distributor source target's newest observation, price ladder included. */
export interface LatestDistributorObservation {
  targetId: string;
  mpn: string;
  sourceName: string;
  region: string | null;
  sourceUrl: string;
  observationId: string;
  stock: number;
  incoming: number | null;
  incomingDate: string | null;
  leadTimeWeeks: number | null;
  currency: string;
  minimumOrderQty: number;
  orderMultiple: number;
  imageUrl: string | null;
  rawNormalizedJson: Record<string, unknown> | null;
  observedAt: Date;
  /**
   * Ordered by minQty. `unitPrice` is the parsed number the pricing math wants; `unitPriceRaw`
   * is Postgres's own numeric(12,4) text, trailing zeros intact, for the callers whose
   * contract is the undecorated string.
   */
  tiers: Array<{ minQty: number; unitPrice: number; unitPriceRaw: string; currency: string }>;
}

/**
 * Every distributor source target's newest observation, price ladder included, in ONE round
 * trip. The lateral joins do the "latest per source target" pick and the price-break rollup
 * inside Postgres.
 *
 * This replaces a shape that pulled the entire observation history over the wire to
 * de-duplicate it in JS, then issued a further query per source target. Row counts here are
 * small, so that was never a query-cost problem - it was a round-trip problem. A Vercel
 * function pays a full network hop to the database region for each one, so four call sites
 * sharing one query beats four call sites each looping.
 *
 * `mpns` omitted means the whole tracked catalog. A source target with no valid observation
 * is absent rather than present-with-zero: the inner join drops it, exactly as the previous
 * `if (!latest) continue` did.
 */
async function latestDistributorObservations(
  mpns?: string[],
  match: "exact" | "case-insensitive" = "case-insensitive",
): Promise<LatestDistributorObservation[]> {
  if (mpns && mpns.length === 0) return [];

  let filter = sql``;
  if (mpns) {
    filter =
      match === "exact"
        ? sql`and st.mpn in ${mpns}`
        : sql`and upper(st.mpn) in ${mpns.map((m) => m.trim().toUpperCase())}`;
  }

  const rows = await db.execute<{
    target_id: string;
    mpn: string;
    source_name: string;
    region: string | null;
    source_url: string;
    observation_id: string;
    stock: number;
    incoming: number | null;
    incoming_date: string | null;
    lead_time_weeks: number | null;
    currency: string;
    minimum_order_qty: number;
    order_multiple: number;
    image_url: string | null;
    raw_normalized_json: Record<string, unknown> | null;
    observed_at: Date;
    tiers: Array<{ minQty: number; unitPrice: string; currency: string }>;
  }>(sql`
    select
      st.id target_id, st.mpn, st.source_name, st.region, st.source_url,
      co.id observation_id, co.stock, co.incoming, co.incoming_date, co.lead_time_weeks,
      co.currency, co.minimum_order_qty, co.order_multiple, co.image_url,
      co.raw_normalized_json, co.observed_at,
      coalesce(pb.tiers, '[]'::json) tiers
    from source_targets st
    join lateral (
      select * from component_observations o
      where o.source_target_id = st.id
      order by o.observed_at desc
      limit 1
    ) co on true
    left join lateral (
      select json_agg(
        json_build_object('minQty', b.min_qty, 'unitPrice', b.unit_price::text, 'currency', b.currency)
        order by b.min_qty
      ) tiers
      from price_breaks b
      where b.observation_id = co.id
    ) pb on true
    where st.source_type = 'distributor' ${filter}
    -- Deterministic, and deliberately registration order rather than alphabetical: callers
    -- roll these rows up with "first non-null value wins" (image, manufacturer, package) and
    -- "first supplier seen sets the price to beat", so the order is load-bearing for what the
    -- UI displays. An unordered scan happened to yield heap order, which for an append-only
    -- table is registration order - this pins that instead of leaving it to the query plan.
    order by st.mpn, st.created_at, st.id
  `);

  return rows.map((r) => ({
    targetId: r.target_id,
    mpn: r.mpn,
    sourceName: r.source_name,
    region: r.region,
    sourceUrl: r.source_url,
    observationId: r.observation_id,
    stock: Number(r.stock),
    incoming: r.incoming == null ? null : Number(r.incoming),
    incomingDate: r.incoming_date,
    leadTimeWeeks: r.lead_time_weeks == null ? null : Number(r.lead_time_weeks),
    currency: r.currency,
    minimumOrderQty: Number(r.minimum_order_qty),
    orderMultiple: Number(r.order_multiple),
    imageUrl: r.image_url,
    rawNormalizedJson: r.raw_normalized_json,
    observedAt: new Date(r.observed_at),
    tiers: (r.tiers ?? []).map((t) => ({
      minQty: Number(t.minQty),
      unitPrice: Number(t.unitPrice),
      unitPriceRaw: t.unitPrice,
      currency: t.currency,
    })),
  }));
}

/** Shared by the catalog and the whole-catalog analytics reads - one query, no MPN filter. */
export function listLatestDistributorObservations(): Promise<LatestDistributorObservation[]> {
  return latestDistributorObservations();
}

export function latestDistributorObservationsForMpns(mpns: string[]): Promise<LatestDistributorObservation[]> {
  return latestDistributorObservations(mpns);
}

/** Roll observations up into the per-region pools the buildability math consumes. */
function poolsFromObservations(observations: LatestDistributorObservation[]): Map<string, RegionStock[]> {
  const result = new Map<string, RegionStock[]>();

  for (const obs of observations) {
    const regionLabel = obs.region ?? "unspecified";
    const pools = result.get(obs.mpn) ?? [];
    const pool = pools.find((p) => p.region === regionLabel);
    if (pool) {
      pool.stock += obs.stock;
      if (obs.leadTimeWeeks != null) {
        pool.leadTimeWeeks = pool.leadTimeWeeks == null ? obs.leadTimeWeeks : Math.max(pool.leadTimeWeeks, obs.leadTimeWeeks);
      }
      if (!pool.imageUrl && obs.imageUrl) pool.imageUrl = obs.imageUrl;
      if (!pool.observedAt || obs.observedAt > pool.observedAt) pool.observedAt = obs.observedAt;
    } else {
      pools.push({
        region: regionLabel,
        stock: obs.stock,
        leadTimeWeeks: obs.leadTimeWeeks,
        imageUrl: obs.imageUrl,
        observedAt: obs.observedAt,
      });
    }
    result.set(obs.mpn, pools);
  }

  for (const pools of result.values()) pools.sort((a, b) => b.stock - a.stock);
  return result;
}

/**
 * Latest-valid stock per MPN, grouped by region - never summed across regions (master-plan
 * §5, same rule `listCatalog` already follows). A UK pool and an India pool for the same MPN
 * stay two separate numbers. Sorted largest pool first per MPN, so index 0 is the pool the
 * rest of the app treats as "primary" when it needs a single figure.
 */
async function getLatestDistributorSnapshotsByMpn(mpns: string[]): Promise<Map<string, RegionStock[]>> {
  if (mpns.length === 0) return new Map();
  // Exact match: a BOM line's MPN is stored canonicalised against the catalog already, and
  // widening it here would change buildability numbers, not just their latency.
  return poolsFromObservations(await latestDistributorObservations(mpns, "exact"));
}

/**
 * Newest lifecycle status per MPN, in one round trip. `mpns` omitted means every tracked
 * MPN - which is what the catalog wants, and saves it having to resolve the MPN list first
 * just to filter on it.
 */
export async function getLatestLifecycleByMpn(mpns?: string[]): Promise<Map<string, { marketingStatus: string }>> {
  const result = new Map<string, { marketingStatus: string }>();
  if (mpns && mpns.length === 0) return result;

  const filter = mpns ? sql`and st.mpn in ${mpns}` : sql``;
  const rows = await db.execute<{ mpn: string; marketing_status: string }>(sql`
    select distinct on (st.mpn) st.mpn, lo.marketing_status
    from source_targets st
    join lateral (
      select * from lifecycle_observations o
      where o.source_target_id = st.id
      order by o.observed_at desc
      limit 1
    ) lo on true
    where st.source_type = 'manufacturer' ${filter}
    order by st.mpn, lo.observed_at desc
  `);

  for (const row of rows) result.set(row.mpn, { marketingStatus: row.marketing_status });
  return result;
}

/**
 * Builds one BOM line's buildability against a single "primary" region (the one with the
 * most observed stock) - never a cross-region sum. Any other region this MPN is tracked in
 * is carried alongside as `otherRegions`, visible rather than silently dropped, so a UK-only
 * build never looks worse (or better) than it is because of India stock it can't actually use.
 */
function partFromLookups(
  item: BomItemRow,
  plannedBuildQty: number,
  stockByMpn: Map<string, RegionStock[]>,
  lifecycleByMpn: Map<string, { marketingStatus: string }>,
) {
  const regions = stockByMpn.get(item.mpn) ?? [];
  const [primary, ...rest] = regions;
  const lifecycle = lifecycleByMpn.get(item.mpn);
  const input: PartInput = {
    mpn: item.mpn,
    qtyPerUnit: item.qtyPerUnit,
    monitored: item.monitored,
    criticality: item.criticality,
    observedStock: primary ? primary.stock : null,
    leadTimeWeeks: primary?.leadTimeWeeks ?? null,
    marketingStatus: lifecycle?.marketingStatus ?? null,
  };
  return {
    ...computePartBuildability(plannedBuildQty, input),
    imageUrl: primary?.imageUrl ?? null,
    observedAt: primary?.observedAt ?? null,
    freshnessState: primary?.observedAt ? renderStateForObservation(primary.observedAt) : null,
    region: primary?.region ?? null,
    otherRegions: rest.map((r) => ({ region: r.region, stock: r.stock })),
  };
}

async function buildPartsForBom(bomItemRows: BomItemRow[], plannedBuildQty: number) {
  const mpns = bomItemRows.map((b) => b.mpn);
  const [stockByMpn, lifecycleByMpn] = await Promise.all([
    getLatestDistributorSnapshotsByMpn(mpns),
    getLatestLifecycleByMpn(mpns),
  ]);
  return bomItemRows.map((item) => partFromLookups(item, plannedBuildQty, stockByMpn, lifecycleByMpn));
}

export async function listProductsForSession(sessionId: string) {
  const rows = await db.select().from(products).where(eq(products.sessionId, sessionId)).orderBy(desc(products.createdAt));
  if (rows.length === 0) return [];

  // One batched lookup for every build in the workspace instead of one round-trip per build.
  const productIds = rows.map((p) => p.id);
  const allItems = await db.select().from(bomItems).where(inArray(bomItems.productId, productIds));
  const itemsByProduct = new Map<string, BomItemRow[]>();
  for (const item of allItems) {
    const list = itemsByProduct.get(item.productId) ?? [];
    list.push(item);
    itemsByProduct.set(item.productId, list);
  }

  const allMpns = [...new Set(allItems.map((i) => i.mpn))];
  const [stockByMpn, lifecycleByMpn] = await Promise.all([
    getLatestDistributorSnapshotsByMpn(allMpns),
    getLatestLifecycleByMpn(allMpns),
  ]);

  return rows.map((product) => {
    const items = itemsByProduct.get(product.id) ?? [];
    const parts = items.map((item) => partFromLookups(item, product.plannedBuildQty, stockByMpn, lifecycleByMpn));
    const buildability = computeProductBuildability(product.plannedBuildQty, parts);
    return { product, buildability };
  });
}

export async function getProductDetail(productId: string, sessionId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sessionId, sessionId)));
  if (!product) return null;

  const items = await db.select().from(bomItems).where(eq(bomItems.productId, product.id));
  const [rawParts, singleSourceMpns] = await Promise.all([
    buildPartsForBom(items, product.plannedBuildQty),
    getSingleSourceMpns(items.filter((i) => i.monitored).map((i) => i.mpn)),
  ]);
  const parts = rawParts.map((p) => ({ ...p, singleSourced: p.monitored && singleSourceMpns.has(p.mpn) }));
  const buildability = computeProductBuildability(product.plannedBuildQty, parts);
  return {
    product,
    parts,
    buildability,
    singleSourcedCount: parts.filter((p) => p.singleSourced).length,
  };
}

export interface NewProductPart {
  mpn: string;
  qtyPerUnit: number;
  criticality?: "critical" | "important" | "optional";
}

async function resolveMpnAgainstCatalog(mpn: string): Promise<{ canonicalMpn: string; monitored: boolean }> {
  const normalized = mpn.trim().toUpperCase();
  const [match] = await db
    .select({ mpn: sourceTargets.mpn })
    .from(sourceTargets)
    .where(
      and(
        eq(sourceTargets.sourceType, "distributor"),
        eq(sourceTargets.inCatalog, true),
        sql`upper(${sourceTargets.mpn}) = ${normalized}`,
      ),
    )
    .limit(1);
  return match ? { canonicalMpn: match.mpn, monitored: true } : { canonicalMpn: mpn.trim(), monitored: false };
}

export async function createProduct(input: {
  sessionId: string;
  name: string;
  plannedBuildQty: number;
  shipDate: string | null;
  parts: NewProductPart[];
}) {
  const [product] = await db
    .insert(products)
    .values({
      sessionId: input.sessionId,
      name: input.name,
      plannedBuildQty: input.plannedBuildQty,
      shipDate: input.shipDate,
    })
    .returning();

  for (const part of input.parts) {
    const { canonicalMpn, monitored } = await resolveMpnAgainstCatalog(part.mpn);
    await db.insert(bomItems).values({
      productId: product.id,
      mpn: canonicalMpn,
      qtyPerUnit: part.qtyPerUnit,
      criticality: part.criticality ?? "important",
      monitored,
    });
  }

  return product;
}

export interface ComponentSourceDetail {
  sourceTargetId: string;
  supplier: string;
  region: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  stock: number;
  incoming: number | null;
  incomingDate: string | null;
  leadTimeWeeks: number | null;
  currency: string;
  minimumOrderQty: number;
  orderMultiple: number;
  priceBreaks: Array<{ minQty: number; unitPrice: string }>;
  observedAt: Date;
  state: "fresh" | "stale";
  age: string;
}

export interface ComponentDetail {
  mpn: string;
  state: "ok" | "failed";
  distributorSources: ComponentSourceDetail[];
  manufacturer: {
    sourceTargetId: string;
    supplier: string;
    sourceUrl: string;
    marketingStatus: string;
    productionStatus: string | null;
    longevityYears: number | null;
    longevityStartDate: string | null;
    package: string | null;
    grade: string | null;
    observedAt: Date;
    state: "fresh" | "stale";
  } | null;
  history: Array<{ observedAt: Date; stock: number; supplier: string }>;
}

/**
 * One component's full picture. Three independent queries in parallel - latest-per-supplier
 * with its price ladder, the stock history for the chart, and the manufacturer's lifecycle -
 * rather than two queries per source target in a serial loop.
 */
export async function getComponentDetail(mpn: string): Promise<ComponentDetail> {
  const normalized = mpn.trim().toUpperCase();

  const [latest, historyRows, manufacturerRows] = await Promise.all([
    latestDistributorObservationsForMpns([normalized]),
    db.execute<{ observed_at: Date; stock: number; supplier: string }>(sql`
      select co.observed_at, co.stock, st.source_name supplier
      from component_observations co
      join source_targets st on st.id = co.source_target_id
      where st.source_type = 'distributor' and upper(st.mpn) = ${normalized}
      order by co.observed_at
    `),
    db.execute<{
      source_target_id: string;
      source_name: string;
      source_url: string;
      marketing_status: string;
      production_status: string | null;
      longevity_years: number | null;
      longevity_start_date: string | null;
      package: string | null;
      grade: string | null;
      observed_at: Date;
    }>(sql`
      select st.id source_target_id, st.source_name, st.source_url,
             lo.marketing_status, lo.production_status, lo.longevity_years,
             lo.longevity_start_date, lo.package, lo.grade, lo.observed_at
      from source_targets st
      join lateral (
        select * from lifecycle_observations o
        where o.source_target_id = st.id
        order by o.observed_at desc
        limit 1
      ) lo on true
      where st.source_type = 'manufacturer' and upper(st.mpn) = ${normalized}
      limit 1
    `),
  ]);

  const distributorSources: ComponentSourceDetail[] = latest.map((obs) => ({
    sourceTargetId: obs.targetId,
    supplier: obs.sourceName,
    region: obs.region,
    sourceUrl: obs.sourceUrl,
    imageUrl: obs.imageUrl,
    stock: obs.stock,
    incoming: obs.incoming,
    incomingDate: obs.incomingDate,
    leadTimeWeeks: obs.leadTimeWeeks,
    currency: obs.currency,
    minimumOrderQty: obs.minimumOrderQty,
    orderMultiple: obs.orderMultiple,
    priceBreaks: obs.tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPriceRaw })),
    observedAt: obs.observedAt,
    state: renderStateForObservation(obs.observedAt),
    age: formatAge(obs.observedAt),
  }));

  const history = historyRows.map((r) => ({
    observedAt: new Date(r.observed_at),
    stock: Number(r.stock),
    supplier: r.supplier,
  }));

  const mfr = manufacturerRows[0];
  const manufacturer: ComponentDetail["manufacturer"] = mfr
    ? {
        sourceTargetId: mfr.source_target_id,
        supplier: mfr.source_name,
        sourceUrl: mfr.source_url,
        marketingStatus: mfr.marketing_status,
        productionStatus: mfr.production_status,
        longevityYears: mfr.longevity_years == null ? null : Number(mfr.longevity_years),
        longevityStartDate: mfr.longevity_start_date,
        package: mfr.package,
        grade: mfr.grade,
        observedAt: new Date(mfr.observed_at),
        state: renderStateForObservation(new Date(mfr.observed_at)),
      }
    : null;

  return {
    mpn,
    state: distributorSources.length > 0 ? "ok" : "failed",
    distributorSources,
    manufacturer,
    history,
  };
}

export async function listRecentEvents(sessionId: string, limit = 20) {
  const events = await db.select().from(businessEvents).orderBy(desc(businessEvents.createdAt)).limit(limit);
  if (events.length === 0) return [];

  const mpns = [...new Set(events.map((e) => e.mpn).filter((m): m is string => m != null))];
  const sessionItems =
    mpns.length > 0
      ? await db
          .select({ mpn: bomItems.mpn, name: products.name, productId: products.id })
          .from(bomItems)
          .innerJoin(products, eq(bomItems.productId, products.id))
          .where(and(eq(products.sessionId, sessionId), inArray(bomItems.mpn, mpns)))
      : [];
  const productByMpn = new Map(sessionItems.map((i) => [i.mpn, { name: i.name, productId: i.productId }]));

  return events.map((e) => ({
    ...e,
    product: e.mpn ? (productByMpn.get(e.mpn) ?? null) : null,
  }));
}

/** System-triggered read (no session scoping) - used by ingestion to check post-observation risk. */
export async function getProductBuildabilitySummary(productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return null;

  const items = await db.select().from(bomItems).where(eq(bomItems.productId, product.id));
  const parts = await buildPartsForBom(items, product.plannedBuildQty);
  const buildability = computeProductBuildability(product.plannedBuildQty, parts);
  return { product, buildability };
}

/** Every product with a monitored BOM line for this MPN - who to check/alert when it changes. */
export async function getProductsMonitoringMpn(mpn: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(bomItems)
    .innerJoin(products, eq(bomItems.productId, products.id))
    .where(and(eq(bomItems.mpn, mpn), eq(bomItems.monitored, true)));

  const seen = new Map<string, { id: string; name: string }>();
  for (const row of rows) seen.set(row.id, row);
  return [...seen.values()];
}

/**
 * Every collector-backed source target for a set of MPNs (both distributor and manufacturer),
 * enabled ones only - what a "Refresh data" action re-ingests. Case-insensitive for the same
 * reason getComponentDetail is.
 */
export async function getSourceTargetIdsForMpns(
  mpns: string[],
): Promise<Array<{ id: string; mpn: string; sourceName: string }>> {
  if (mpns.length === 0) return [];
  const normalized = mpns.map((m) => m.trim().toUpperCase());
  return db
    .select({ id: sourceTargets.id, mpn: sourceTargets.mpn, sourceName: sourceTargets.sourceName })
    .from(sourceTargets)
    .where(
      and(
        inArray(sql`upper(${sourceTargets.mpn})`, normalized),
        isNotNull(sourceTargets.collectorId),
        eq(sourceTargets.enabled, true),
      ),
    );
}

/**
 * Every build with a BOM line for this exact part, monitored or not - used to offer
 * "replace with this alternative" on the component detail page. Case-insensitive, matching
 * getComponentDetail's own lookup, since a BOM line typed by hand may not match a scraped
 * MPN's casing exactly.
 */
export async function getBuildsUsingMpn(mpn: string): Promise<Array<{ id: string; name: string; bomItemId: string }>> {
  const normalized = mpn.trim().toUpperCase();
  const rows = await db
    .select({ id: products.id, name: products.name, bomItemId: bomItems.id })
    .from(bomItems)
    .innerJoin(products, eq(bomItems.productId, products.id))
    .where(sql`upper(${bomItems.mpn}) = ${normalized}`);
  return rows;
}

export interface CollectorHealth {
  collectorId: string;
  sourceName: string;
  sourceType: "distributor" | "manufacturer";
  domain: string;
  sourceTargetCount: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  totalRuns: number;
  successfulRuns: number;
  validationPassRate: number | null;
  openIncidentCount: number;
  lastHealAt: Date | null;
  healCount: number;
}

/**
 * Read-only engineering surface (§4/§15 Screen 4) - grouped by collector_id, not source_target.
 *
 * Three parallel aggregate queries rather than a run query plus an incident query per
 * collector. Postgres does the counting; this only stitches the three keyed results together.
 */
export async function listSourceHealth(): Promise<CollectorHealth[]> {
  const [targets, runStats, incidentStats] = await Promise.all([
    db.select().from(sourceTargets).where(isNotNull(sourceTargets.collectorId)),
    db.execute<{
      collector_id: string;
      total_runs: string;
      successful_runs: string;
      last_run_at: Date | null;
      last_success_at: Date | null;
    }>(sql`
      select st.collector_id,
             count(*) total_runs,
             count(*) filter (where sr.status = 'success') successful_runs,
             max(sr.started_at) last_run_at,
             max(sr.started_at) filter (where sr.status = 'success') last_success_at
      from scrape_runs sr
      join source_targets st on st.id = sr.source_target_id
      where st.collector_id is not null
      group by st.collector_id
    `),
    db.execute<{
      collector_id: string;
      open_incidents: string;
      heal_count: string;
      last_heal_at: Date | null;
    }>(sql`
      select st.collector_id,
             count(*) filter (where si.status in ('open', 'awaiting_approval')) open_incidents,
             count(*) filter (where si.heal_prompt is not null and si.heal_started_at is not null) heal_count,
             max(si.heal_started_at) filter (where si.heal_prompt is not null) last_heal_at
      from scraper_incidents si
      join source_targets st on st.id = si.source_target_id
      where st.collector_id is not null
      group by st.collector_id
    `),
  ]);

  const runsByCollector = new Map(runStats.map((r) => [r.collector_id, r]));
  const incidentsByCollector = new Map(incidentStats.map((r) => [r.collector_id, r]));

  const byCollector = new Map<string, typeof targets>();
  for (const target of targets) {
    if (!target.collectorId) continue;
    const group = byCollector.get(target.collectorId) ?? [];
    group.push(target);
    byCollector.set(target.collectorId, group);
  }

  const results: CollectorHealth[] = [];
  for (const [collectorId, group] of byCollector) {
    const runs = runsByCollector.get(collectorId);
    const incidents = incidentsByCollector.get(collectorId);
    const totalRuns = Number(runs?.total_runs ?? 0);
    const successfulRuns = Number(runs?.successful_runs ?? 0);

    let domain = group[0].sourceUrl;
    try {
      domain = new URL(group[0].sourceUrl).hostname;
    } catch {
      // keep the raw URL as a fallback label
    }

    results.push({
      collectorId,
      sourceName: group[0].sourceName,
      sourceType: group[0].sourceType,
      domain,
      sourceTargetCount: group.length,
      lastRunAt: runs?.last_run_at ? new Date(runs.last_run_at) : null,
      lastSuccessAt: runs?.last_success_at ? new Date(runs.last_success_at) : null,
      totalRuns,
      successfulRuns,
      validationPassRate: totalRuns > 0 ? successfulRuns / totalRuns : null,
      openIncidentCount: Number(incidents?.open_incidents ?? 0),
      lastHealAt: incidents?.last_heal_at ? new Date(incidents.last_heal_at) : null,
      healCount: Number(incidents?.heal_count ?? 0),
    });
  }

  return results;
}

/** MPNs tracked on exactly one distributor - the top procurement risk a BOM can carry. */
export async function getSingleSourceMpns(mpns: string[]): Promise<Set<string>> {
  if (mpns.length === 0) return new Set();
  const targets = await db
    .select({ mpn: sourceTargets.mpn })
    .from(sourceTargets)
    .where(and(inArray(sourceTargets.mpn, mpns), eq(sourceTargets.sourceType, "distributor")));

  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t.mpn, (counts.get(t.mpn) ?? 0) + 1);

  const single = new Set<string>();
  for (const [mpn, count] of counts) if (count === 1) single.add(mpn);
  return single;
}

export async function listIncidentsForHealthScreen(limit = 50) {
  return db
    .select({ incident: scraperIncidents, target: sourceTargets })
    .from(scraperIncidents)
    .innerJoin(sourceTargets, eq(scraperIncidents.sourceTargetId, sourceTargets.id))
    .orderBy(desc(scraperIncidents.openedAt))
    .limit(limit);
}
