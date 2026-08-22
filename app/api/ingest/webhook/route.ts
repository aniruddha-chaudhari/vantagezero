import { NextResponse } from "next/server";

import { ingestWebhookPayload } from "@/brightdata/ingestion";
import { requireIngestToken } from "@/lib/api-auth";

/**
 * Delivery target for a Bright Data Scraper Studio scheduled run - the collector runs on
 * Bright Data's own infra and POSTs the result here, so unlike POST /api/ingest/brightdata
 * this never shells out to the `bdata` CLI. That makes it the one collection path that works
 * unmodified inside a stock Vercel serverless function: no writable filesystem, no npm
 * install at request time, no fighting the platform's execution-time limit.
 *
 * One collector's schedule should point at one source target's URL here, e.g.
 * `.../api/ingest/webhook?sourceTargetId=<id>&webhook_header_Authorization=Bearer+<token>`
 * with `uncompressed_webhook=true` set on the schedule (skips gzip so the body is plain
 * JSON). Auth reuses INGEST_API_TOKEN via the same header check the CLI-driven routes use -
 * Bright Data sends whatever value webhook_header_Authorization is configured with as a real
 * Authorization header, so no separate secret is needed.
 *
 * The delivered payload is the same JSON array a direct API download would return - the
 * normalizer functions already handle that shape identically to a CLI `bdata scraper run`
 * result, so no separate parsing path exists here.
 */
export async function POST(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const sourceTargetId = new URL(request.url).searchParams.get("sourceTargetId");
  if (!sourceTargetId) {
    return NextResponse.json({ error: "Missing sourceTargetId query parameter" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  if (raw == null) {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestWebhookPayload(sourceTargetId, raw);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
