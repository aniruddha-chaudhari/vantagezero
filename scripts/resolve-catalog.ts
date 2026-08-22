import { and, eq, isNotNull } from "drizzle-orm";

import { searchWeb } from "@/brightdata/client";
import { CATALOG_CANDIDATES } from "@/brightdata/catalog-candidates";
import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";

interface DistributorTarget {
  sourceName: string;
  domain: string;
  pathMustInclude: string[];
  region: string;
}

const DISTRIBUTORS: DistributorTarget[] = [
  { sourceName: "RS Online", domain: "uk.rs-online.com", pathMustInclude: ["/web/p/"], region: "UK" },
  { sourceName: "element14", domain: "uk.farnell.com", pathMustInclude: ["/dp/"], region: "UK" },
  { sourceName: "DigiKey", domain: "www.digikey.in", pathMustInclude: ["/en/products/detail/"], region: "India" },
  { sourceName: "LCSC", domain: "www.lcsc.com", pathMustInclude: ["/product-detail/"], region: "China" },
];

const MANUFACTURER: DistributorTarget = {
  sourceName: "STMicroelectronics",
  domain: "www.st.com",
  pathMustInclude: ["/en/", ".html"],
  region: "UK",
};

interface SearchResult {
  organic?: Array<{ link?: string; href?: string }>;
}

async function findPdpUrl(mpn: string, target: DistributorTarget): Promise<string | null> {
  // No embedded quotes: Windows shell quoting mangles a query containing both a
  // space and a literal `"` when passed through execFile with shell:true.
  const result = (await searchWeb(`${mpn} site:${target.domain}`)) as SearchResult;
  for (const item of result.organic ?? []) {
    const link = item.link ?? item.href;
    if (typeof link === "string" && target.pathMustInclude.every((p) => link.includes(p))) {
      return link;
    }
  }
  return null;
}

async function getCollectorId(sourceName: string): Promise<string | null> {
  const [row] = await db
    .select({ collectorId: sourceTargets.collectorId })
    .from(sourceTargets)
    .where(and(eq(sourceTargets.sourceName, sourceName), isNotNull(sourceTargets.collectorId)))
    .limit(1);
  return row?.collectorId ?? null;
}

async function alreadyInCatalog(mpn: string, sourceName: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sourceTargets.id })
    .from(sourceTargets)
    .where(and(eq(sourceTargets.mpn, mpn), eq(sourceTargets.sourceName, sourceName)))
    .limit(1);
  return Boolean(row);
}

async function resolveOne(mpn: string, target: DistributorTarget, sourceType: "distributor" | "manufacturer") {
  if (await alreadyInCatalog(mpn, target.sourceName)) {
    console.log(`skip (already seeded): ${mpn} / ${target.sourceName}`);
    return;
  }

  const collectorId = await getCollectorId(target.sourceName);
  if (!collectorId) {
    console.log(`skip (no collector yet): ${mpn} / ${target.sourceName}`);
    return;
  }

  const url = await findPdpUrl(mpn, target);
  if (!url) {
    console.log(`unresolved: ${mpn} / ${target.sourceName} (no matching organic result)`);
    return;
  }

  const [row] = await db
    .insert(sourceTargets)
    .values({
      mpn,
      sourceName: target.sourceName,
      sourceType,
      sourceUrl: url,
      region: target.region,
      collectorId,
      enabled: true,
      inCatalog: true,
    })
    .returning();

  const result = await ingestSourceTarget(row.id, { triggeredBy: "manual" });
  console.log(result.ok ? `resolved: ${mpn} / ${target.sourceName} -> ${result.detail}` : `incident: ${mpn} / ${target.sourceName} -> ${result.detail}`);
}

async function main() {
  let resolved = 0;
  let unresolved = 0;

  for (const candidate of CATALOG_CANDIDATES) {
    for (const distributor of DISTRIBUTORS) {
      try {
        await resolveOne(candidate.mpn, distributor, "distributor");
        resolved++;
      } catch (err) {
        unresolved++;
        console.error(`error resolving ${candidate.mpn} / ${distributor.sourceName}:`, err instanceof Error ? err.message : err);
      }
    }

    if (candidate.manufacturerHint === "STMicroelectronics") {
      try {
        await resolveOne(candidate.mpn, MANUFACTURER, "manufacturer");
        resolved++;
      } catch (err) {
        unresolved++;
        console.error(`error resolving ${candidate.mpn} / STMicroelectronics:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`\nDone. attempts=${resolved + unresolved} errors=${unresolved}`);
  process.exit(0);
}

main();
