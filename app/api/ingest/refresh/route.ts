import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestSourceTarget } from "@/brightdata/ingestion";
import { getSourceTargetIdsForMpns } from "@/db/queries";

/** Runs a handful of real collector calls sequentially-in-bounded-parallel - can take a while. */
export const maxDuration = 120;

const bodySchema = z.object({ mpns: z.array(z.string().min(1)).min(1).max(20) });

/**
 * "Refresh data" on a component or build page - a same-origin UI action a person triggers
 * when they want current numbers now rather than waiting for the next 6-hourly cron tick.
 * Re-runs the real collector for every enabled source target behind the given MPNs, through
 * the exact same ingestSourceTarget() the cron and webhook paths use - one implementation of
 * "is this payload trustworthy," not a fourth one.
 *
 * Bounded concurrency for the same reason scripts/ingest.ts is: every concurrent slot is a
 * live Bright Data job, and this list is short (one component's sources, or one build's BOM)
 * so 3 is plenty without risking the account's concurrency cap.
 */
const CONCURRENCY = 3;

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "mpns must be a non-empty array of strings (max 20)" }, { status: 400 });
  }

  const targets = await getSourceTargetIdsForMpns(parsed.data.mpns);
  if (targets.length === 0) {
    return NextResponse.json({ error: "No trackable sources found for the given parts" }, { status: 404 });
  }

  const results: Array<{ mpn: string; sourceName: string; ok: boolean; detail: string }> = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
      while (cursor < targets.length) {
        const target = targets[cursor++];
        const result = await ingestSourceTarget(target.id, { triggeredBy: "manual" });
        results.push({ mpn: target.mpn, sourceName: target.sourceName, ok: result.ok, detail: result.detail });
      }
    }),
  );

  return NextResponse.json({
    summary: { total: results.length, ok: results.filter((r) => r.ok).length },
    results,
  });
}
