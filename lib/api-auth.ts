import { NextResponse } from "next/server";

/**
 * Shared bearer-token check for the internal API surface the CI cron and heal loop call.
 * Returns an error response to short-circuit with, or null when the request is authorized.
 */
export function requireIngestToken(request: Request): NextResponse | null {
  const expectedToken = process.env.INGEST_API_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: "INGEST_API_TOKEN is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
