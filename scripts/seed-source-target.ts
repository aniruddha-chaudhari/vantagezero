import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";

/**
 * Usage: tsx scripts/seed-source-target.ts <mpn> <sourceName> <sourceType> <sourceUrl> <region> <collectorId>
 */
async function main() {
  const [mpn, sourceName, sourceType, sourceUrl, region, collectorId] = process.argv.slice(2);
  if (!mpn || !sourceName || !sourceType || !sourceUrl) {
    throw new Error(
      "usage: tsx scripts/seed-source-target.ts <mpn> <sourceName> <distributor|manufacturer> <sourceUrl> [region] [collectorId]",
    );
  }
  if (sourceType !== "distributor" && sourceType !== "manufacturer") {
    throw new Error(`sourceType must be "distributor" or "manufacturer", got "${sourceType}"`);
  }

  const [row] = await db
    .insert(sourceTargets)
    .values({
      mpn,
      sourceName,
      sourceType,
      sourceUrl,
      region: region || null,
      collectorId: collectorId || null,
      enabled: true,
      inCatalog: true,
    })
    .returning();

  console.log(row);
  process.exit(0);
}

main();
