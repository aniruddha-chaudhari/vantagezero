import { eq } from "drizzle-orm";

import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";

/**
 * Usage:
 *   npm run ingest -- <sourceTargetId>   one source target
 *   npm run ingest -- --all              every enabled source target, sequentially
 *
 * Talks to the database directly (unlike scripts/heal-loop.ts, which only ever talks to
 * Vantage's own HTTP API) - collection genuinely needs DB access to run the collector and
 * write the result, so there is no "same code path locally or deployed" constraint to honor
 * here. This is what the Collect GitHub Actions workflow runs in the runner; it is not, and
 * must not be, reachable as an endpoint on the deployed app - the terminal/app boundary in
 * the README applies to `bdata scraper create/heal/approve` config verbs, but running a
 * collector is a data-plane operation this script always drives from a place `npx bdata`
 * actually works, i.e. never a serverless function.
 */
async function main() {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error("usage: npm run ingest -- <sourceTargetId> | --all");
  }

  const targetIds =
    arg === "--all"
      ? (await db.select({ id: sourceTargets.id }).from(sourceTargets).where(eq(sourceTargets.enabled, true))).map(
          (t) => t.id,
        )
      : [arg];

  const triggeredBy = arg === "--all" ? "cron" : "manual";
  let failures = 0;
  for (const sourceTargetId of targetIds) {
    const result = await ingestSourceTarget(sourceTargetId, { triggeredBy });
    if (result.ok) {
      console.log("Observation stored:", result);
    } else {
      console.error("Incident opened:", result);
      failures++;
    }
  }

  if (arg === "--all") {
    console.log(`\nProcessed ${targetIds.length} source target(s), ${failures} incident(s) opened.`);
  }
  // A collector incident is an expected, handled outcome (an incident row is written on
  // purpose) - never a reason to redden the cron. Only an unhandled throw should do that.
}

main().finally(() => process.exit());
