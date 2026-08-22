import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";
import { requireIngestToken } from "@/lib/api-auth";

/** Runs sequentially and can take minutes for a large catalog - extend the function timeout.
 * Note this exceeds the 60s cap on Vercel's Hobby tier regardless of this declaration. */
export const maxDuration = 300;

/**
 * Internal trigger endpoint for one-off/judge-triggered runs. It only ever runs the same
 * ingestSourceTarget() function the CLI script uses; it can never create, heal, or approve a
 * collector (master-plan v3 terminal/app boundary - Vantage never manages collectors).
 *
 * The recurring cron (.github/workflows/collect.yml) does NOT call this route - it runs
 * `scripts/ingest.ts --all` directly in the GitHub Actions runner instead. ingestSourceTarget()
 * calls runScraper(), which shells out to `npx -y -p @brightdata/cli bdata` - that assumes a
 * writable filesystem and an npm install at request time, neither of which a serverless
 * function on Vercel reliably provides within its execution-time limit. This endpoint is left
 * in place for local/self-hosted use where that assumption holds; do not point the deployed
 * app's own cron at it.
 */
export async function POST(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));

  if (body?.sourceTargetId) {
    const result = await ingestSourceTarget(body.sourceTargetId, { triggeredBy: "judge" });
    return NextResponse.json({ results: [result] });
  }

  if (body?.all) {
    const targets = await db
      .select({ id: sourceTargets.id })
      .from(sourceTargets)
      .where(eq(sourceTargets.enabled, true));

    const results = [];
    for (const target of targets) {
      results.push(await ingestSourceTarget(target.id, { triggeredBy: "cron" }));
    }

    return NextResponse.json({
      results,
      summary: { total: results.length, ok: results.filter((r) => r.ok).length },
    });
  }

  return NextResponse.json({ error: "Body must include either { sourceTargetId } or { all: true }" }, { status: 400 });
}
