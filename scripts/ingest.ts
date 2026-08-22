import { eq } from "drizzle-orm";

import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";

/**
 * Usage:
 *   npm run ingest -- <sourceTargetId>            one source target
 *   npm run ingest -- --all                       every enabled source target
 *   npm run ingest -- --all --concurrency 8       override the default parallelism
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

/**
 * Each ingest is almost entirely spent waiting on Bright Data to finish a collection job
 * (the CLI polls; a single run can take 30-60s), so the work is I/O-bound and a sequential
 * loop leaves the runner idle. A full 77-target cycle measured ~50 minutes serially.
 *
 * Deliberately bounded rather than unbounded: every concurrent slot is a live Bright Data
 * collection job, and hitting an account-level concurrency cap would surface as failed runs
 * that open incidents - polluting a signal that is supposed to mean "this page's data is
 * wrong" with what is really infrastructure backpressure. 5 is conservative on purpose.
 */
const DEFAULT_CONCURRENCY = 5;

function readConcurrency(argv: string[]): number {
  const i = argv.indexOf("--concurrency");
  if (i < 0) return DEFAULT_CONCURRENCY;
  const parsed = Number(argv[i + 1]);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--concurrency must be a positive integer, got "${argv[i + 1]}"`);
  }
  return parsed;
}

/** Fixed-size worker pool: each worker pulls the next index until the queue is drained. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = argv[0];
  if (!arg) {
    throw new Error("usage: npm run ingest -- <sourceTargetId> | --all [--concurrency N]");
  }

  const isAll = arg === "--all";
  const targetIds = isAll
    ? (await db.select({ id: sourceTargets.id }).from(sourceTargets).where(eq(sourceTargets.enabled, true))).map(
        (t) => t.id,
      )
    : [arg];

  const triggeredBy = isAll ? "cron" : "manual";
  const concurrency = isAll ? readConcurrency(argv) : 1;

  let failures = 0;
  let done = 0;

  if (isAll) {
    console.log(`Ingesting ${targetIds.length} source target(s) with concurrency ${concurrency}...`);
  }

  await runPool(targetIds, concurrency, async (sourceTargetId) => {
    // ingestSourceTarget already converts every failure into an incident row and a returned
    // ok:false - it does not throw - so one bad target can never abort the pool.
    const result = await ingestSourceTarget(sourceTargetId, { triggeredBy });
    done++;
    const progress = isAll ? `[${done}/${targetIds.length}] ` : "";
    if (result.ok) {
      console.log(`${progress}Observation stored:`, result);
    } else {
      console.error(`${progress}Incident opened:`, result);
      failures++;
    }
  });

  if (isAll) {
    console.log(`\nProcessed ${targetIds.length} source target(s), ${failures} incident(s) opened.`);
  }
  // A collector incident is an expected, handled outcome (an incident row is written on
  // purpose) - never a reason to redden the cron. Only an unhandled throw should do that.
}

main().finally(() => process.exit());
