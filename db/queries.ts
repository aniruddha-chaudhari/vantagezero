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

/**
 * Latest-valid stock per MPN, grouped by region - never summed across regions (master-plan
 * §5, same rule `listCatalog` already follows). A UK pool and an India pool for the same MPN
 * stay two separate numbers. Sorted largest pool first per MPN, so index 0 is the pool the
 * rest of the app treats as "primary" when it needs a single figure.
 */
async function getLatestDistributorSnapshotsByMpn(mpns: string[]): Promise<Map<string, RegionStock[]>> {
  const result = new Map<string, RegionStock[]>();
  if (mpns.length === 0) return result;

  const targets = await db
    .select()
    .from(sourceTargets)
    .where(and(inArray(sourceTargets.mpn, mpns), eq(sourceTargets.sourceType, "distributor")));
  if (targets.length === 0) return result;

  const targetIds = targets.map((t) => t.id);
  const obs = await db
    .select()
    .from(componentObservations)
    .where(inArray(componentObservations.sourceTargetId, targetIds))
    .orderBy(desc(componentObservations.observedAt));

  const latestBySourceTarget = new Map<string, (typeof obs)[number]>();
  for (const o of obs) {
    if (!latestBySourceTarget.has(o.sourceTargetId)) latestBySourceTarget.set(o.sourceTargetId, o);
  }

  for (const target of targets) {
    const latest = latestBySourceTarget.get(target.id);
    if (!latest) continue; // this source has never produced a valid observation - contributes nothing, not zero

    const regionLabel = target.region ?? "unspecified";
    const pools = result.get(target.mpn) ?? [];
    const pool = pools.find((p) => p.region === regionLabel);
    if (pool) {
      pool.stock += latest.stock;
      if (latest.leadTimeWeeks != null) {
        pool.leadTimeWeeks = pool.leadTimeWeeks == null ? latest.leadTimeWeeks : Math.max(pool.leadTimeWeeks, latest.leadTimeWeeks);
      }
      if (!pool.imageUrl && latest.imageUrl) pool.imageUrl = latest.imageUrl;
      if (!pool.observedAt || latest.observedAt > pool.observedAt) pool.observedAt = latest.observedAt;
    } else {
      pools.push({
        region: regionLabel,
        stock: latest.stock,
        leadTimeWeeks: latest.leadTimeWeeks,
        imageUrl: latest.imageUrl,
        observedAt: latest.observedAt,
      });
    }
    result.set(target.mpn, pools);
  }

  for (const pools of result.values()) pools.sort((a, b) => b.stock - a.stock);
  return result;
}

export async function getLatestLifecycleByMpn(mpns: string[]): Promise<Map<string, { marketingStatus: string }>> {
  const result = new Map<string, { marketingStatus: string }>();
  if (mpns.length === 0) return result;

  const targets = await db
    .select()
    .from(sourceTargets)
    .where(and(inArray(sourceTargets.mpn, mpns), eq(sourceTargets.sourceType, "manufacturer")));
  if (targets.length === 0) return result;

  const targetIds = targets.map((t) => t.id);
  const obs = await db
    .select()
    .from(lifecycleObservations)
    .where(inArray(lifecycleObservations.sourceTargetId, targetIds))
    .orderBy(desc(lifecycleObservations.observedAt));

  const latestBySourceTarget = new Map<string, (typeof obs)[number]>();
  for (const o of obs) {
    if (!latestBySourceTarget.has(o.sourceTargetId)) latestBySourceTarget.set(o.sourceTargetId, o);
  }
  for (const target of targets) {
    const latest = latestBySourceTarget.get(target.id);
    if (!latest || result.has(target.mpn)) continue;
    result.set(target.mpn, { marketingStatus: latest.marketingStatus });
  }
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

export async function getComponentDetail(mpn: string): Promise<ComponentDetail> {
  const normalized = mpn.trim().toUpperCase();
  const targets = await db.select().from(sourceTargets).where(sql`upper(${sourceTargets.mpn}) = ${normalized}`);

  const distributorSources: ComponentSourceDetail[] = [];
  const history: Array<{ observedAt: Date; stock: number; supplier: string }> = [];

  for (const target of targets.filter((t) => t.sourceType === "distributor")) {
    const obsList = await db
      .select()
      .from(componentObservations)
      .where(eq(componentObservations.sourceTargetId, target.id))
      .orderBy(desc(componentObservations.observedAt));
    if (obsList.length === 0) continue;

    for (const o of obsList) history.push({ observedAt: o.observedAt, stock: o.stock, supplier: target.sourceName });

    const latest = obsList[0];
    const pbRows = await db.select().from(priceBreaks).where(eq(priceBreaks.observationId, latest.id));

    distributorSources.push({
      sourceTargetId: target.id,
      supplier: target.sourceName,
      region: target.region,
      sourceUrl: target.sourceUrl,
      imageUrl: latest.imageUrl,
      stock: latest.stock,
      incoming: latest.incoming,
      incomingDate: latest.incomingDate,
      leadTimeWeeks: latest.leadTimeWeeks,
      currency: latest.currency,
      minimumOrderQty: latest.minimumOrderQty,
      orderMultiple: latest.orderMultiple,
      priceBreaks: pbRows.map((pb) => ({ minQty: pb.minQty, unitPrice: pb.unitPrice })),
      observedAt: latest.observedAt,
      state: renderStateForObservation(latest.observedAt),
      age: formatAge(latest.observedAt),
    });
  }

  let manufacturer: ComponentDetail["manufacturer"] = null;
  for (const target of targets.filter((t) => t.sourceType === "manufacturer")) {
    const [latest] = await db
      .select()
      .from(lifecycleObservations)
      .where(eq(lifecycleObservations.sourceTargetId, target.id))
      .orderBy(desc(lifecycleObservations.observedAt))
      .limit(1);
    if (!latest) continue;
    manufacturer = {
      sourceTargetId: target.id,
      supplier: target.sourceName,
      sourceUrl: target.sourceUrl,
      marketingStatus: latest.marketingStatus,
      productionStatus: latest.productionStatus,
      longevityYears: latest.longevityYears,
      longevityStartDate: latest.longevityStartDate,
      package: latest.package,
      grade: latest.grade,
      observedAt: latest.observedAt,
      state: renderStateForObservation(latest.observedAt),
    };
    break;
  }

  history.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

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

/** Read-only engineering surface (§4/§15 Screen 4) - grouped by collector_id, not source_target. */
export async function listSourceHealth(): Promise<CollectorHealth[]> {
  const targets = await db.select().from(sourceTargets).where(isNotNull(sourceTargets.collectorId));

  const byCollector = new Map<string, typeof targets>();
  for (const target of targets) {
    if (!target.collectorId) continue;
    const group = byCollector.get(target.collectorId) ?? [];
    group.push(target);
    byCollector.set(target.collectorId, group);
  }

  const results: CollectorHealth[] = [];
  for (const [collectorId, group] of byCollector) {
    const targetIds = group.map((t) => t.id);

    const runs = await db
      .select()
      .from(scrapeRuns)
      .where(inArray(scrapeRuns.sourceTargetId, targetIds))
      .orderBy(desc(scrapeRuns.startedAt));
    const totalRuns = runs.length;
    const successfulRuns = runs.filter((r) => r.status === "success").length;
    const lastSuccess = runs.find((r) => r.status === "success") ?? null;

    const incidents = await db.select().from(scraperIncidents).where(inArray(scraperIncidents.sourceTargetId, targetIds));
    const openIncidentCount = incidents.filter((i) => i.status === "open" || i.status === "awaiting_approval").length;
    const healed = incidents
      .filter((i) => i.healPrompt != null && i.healStartedAt != null)
      .sort((a, b) => (b.healStartedAt as Date).getTime() - (a.healStartedAt as Date).getTime());

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
      lastRunAt: runs[0]?.startedAt ?? null,
      lastSuccessAt: lastSuccess?.startedAt ?? null,
      totalRuns,
      successfulRuns,
      validationPassRate: totalRuns > 0 ? successfulRuns / totalRuns : null,
      openIncidentCount,
      lastHealAt: healed[0]?.healStartedAt ?? null,
      healCount: healed.length,
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
