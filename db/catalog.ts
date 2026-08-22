import { and, eq, isNotNull } from "drizzle-orm";

import { searchWeb } from "@/brightdata/client";
import { ingestSourceTarget, type IngestResult } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { bomItems, sourceTargets } from "@/db/schema";

/**
 * Live MPN resolution - the "ceiling" above the seeded catalog "floor" (master-plan §7).
 * A genuine Search-type Scraper Studio collector (keyword in, listings out) turned out not
 * to be viable: RS Online's on-site search path (`/*searchTerm=`) is disallowed by their own
 * robots.txt outright, and element14's multi-result listings page redirects to a path
 * (`/search?st=`) that's disallowed too - only an exact single match silently redirects to
 * an allowed PDP URL. Bright Data's Web Search API (already used to seed the catalog in Day 2)
 * is fully robots-compliant and used here instead - a real, distinct Bright Data capability,
 * used live rather than only at catalog-seed time.
 */
export interface DistributorSearchTarget {
  sourceName: string;
  domain: string;
  pathMustInclude: string[];
}

export const SEARCHABLE_DISTRIBUTORS: DistributorSearchTarget[] = [
  { sourceName: "RS Online", domain: "uk.rs-online.com", pathMustInclude: ["/web/p/"] },
  { sourceName: "element14", domain: "uk.farnell.com", pathMustInclude: ["/dp/"] },
];

export interface CatalogCandidate {
  sourceName: string;
  url: string;
  title: string | null;
}

interface SerpResult {
  organic?: Array<{ link?: string; href?: string; title?: string }>;
}

async function getCollectorId(sourceName: string): Promise<string | null> {
  const [row] = await db
    .select({ collectorId: sourceTargets.collectorId })
    .from(sourceTargets)
    .where(and(eq(sourceTargets.sourceName, sourceName), isNotNull(sourceTargets.collectorId)))
    .limit(1);
  return row?.collectorId ?? null;
}

/**
 * One candidate PDP URL per distributor that already has a registered collector.
 *
 * A transient SERP hiccup on one distributor (occasional flakiness we've seen before, e.g.
 * "redirect location was rejected") must not take down the other's results - each search
 * stands alone. But if *every* search errored, that is not "no candidates found": it means
 * search itself is unavailable, and reporting an empty list would present a structural
 * failure as a legitimate negative result. That case throws instead, so the caller surfaces
 * a real error rather than "we looked and there's nothing there."
 *
 * This distinction is load-bearing in production: `searchWeb` shells out to the `bdata` CLI,
 * which cannot run inside a stock serverless function (no writable filesystem, no install
 * step at request time), so on a Vercel deployment every distributor fails together and this
 * throw is the honest answer.
 */
export async function searchCatalogCandidates(mpn: string): Promise<CatalogCandidate[]> {
  const candidates: CatalogCandidate[] = [];
  let attempted = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const distributor of SEARCHABLE_DISTRIBUTORS) {
    const collectorId = await getCollectorId(distributor.sourceName);
    if (!collectorId) continue;
    attempted++;

    let result: SerpResult;
    try {
      result = (await searchWeb(`${mpn} site:${distributor.domain}`)) as SerpResult;
    } catch (err) {
      failed++;
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`Search failed for ${distributor.sourceName}:`, lastError);
      continue;
    }

    for (const item of result.organic ?? []) {
      const link = item.link ?? item.href;
      if (typeof link === "string" && distributor.pathMustInclude.every((p) => link.includes(p))) {
        candidates.push({ sourceName: distributor.sourceName, url: link, title: item.title ?? null });
        break;
      }
    }
  }

  if (attempted > 0 && failed === attempted) {
    throw new Error(
      `Live part search is unavailable in this environment - all ${attempted} distributor searches failed. ` +
        `Last error: ${lastError}`,
    );
  }

  return candidates;
}

export interface ResolveCandidateInput {
  mpn: string;
  sourceName: string;
  url: string;
}

/**
 * Confirms a searched candidate: seeds (or reuses) a source_target, runs the real PDP
 * collector, and - only once real data exists - flips `monitored` on for every BOM line
 * already referencing this MPN, in any build, not just the one that triggered the search.
 * A wrong candidate is caught the same way catalog seeding is: PartIdentityMismatch opens an
 * incident instead of a fabricated observation.
 */
export async function resolveCatalogCandidate(input: ResolveCandidateInput): Promise<IngestResult> {
  const distributor = SEARCHABLE_DISTRIBUTORS.find((d) => d.sourceName === input.sourceName);
  if (!distributor) throw new Error(`Unsupported source "${input.sourceName}"`);
  if (!distributor.pathMustInclude.every((p) => input.url.includes(p))) {
    throw new Error(`URL does not look like a ${input.sourceName} product page`);
  }

  const collectorId = await getCollectorId(input.sourceName);
  if (!collectorId) throw new Error(`No collector registered for "${input.sourceName}"`);

  const [existing] = await db
    .select()
    .from(sourceTargets)
    .where(and(eq(sourceTargets.mpn, input.mpn), eq(sourceTargets.sourceName, input.sourceName)))
    .limit(1);

  let sourceTargetId = existing?.id;
  if (!sourceTargetId) {
    const [created] = await db
      .insert(sourceTargets)
      .values({
        mpn: input.mpn,
        sourceName: input.sourceName,
        sourceType: "distributor",
        sourceUrl: input.url,
        region: "UK",
        collectorId,
        enabled: true,
        inCatalog: false,
      })
      .returning();
    sourceTargetId = created.id;
  }

  const result = await ingestSourceTarget(sourceTargetId, { triggeredBy: "judge" });

  if (result.ok) {
    await db.update(bomItems).set({ monitored: true }).where(eq(bomItems.mpn, input.mpn));
  }

  return result;
}
