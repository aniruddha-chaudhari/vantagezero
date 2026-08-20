import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  componentObservations,
  lifecycleObservations,
  scraperIncidents,
  scrapeRuns,
  sourceTargets,
} from "@/db/schema";

async function count(table: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table);
  return Number(row.n);
}

async function main() {
  const [sourceTargetCount, distributorObsCount, lifecycleObsCount, incidentCount, runCount] = await Promise.all([
    count(sourceTargets),
    count(componentObservations),
    count(lifecycleObservations),
    count(scraperIncidents),
    count(scrapeRuns),
  ]);

  const [{ n: distinctMpns }] = await db
    .select({ n: sql<number>`count(distinct mpn)` })
    .from(sourceTargets);

  const bySource = await db
    .select({ sourceName: sourceTargets.sourceName, n: sql<number>`count(*)` })
    .from(sourceTargets)
    .groupBy(sourceTargets.sourceName);

  console.log({
    distinctMpns: Number(distinctMpns),
    sourceTargetCount,
    distributorObsCount,
    lifecycleObsCount,
    incidentCount,
    runCount,
    bySource,
  });
  process.exit(0);
}

main();
