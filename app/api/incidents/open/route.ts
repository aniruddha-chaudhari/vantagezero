import { NextResponse } from "next/server";

import { listOpenIncidentsForHealing } from "@/db/incidents";
import { requireIngestToken } from "@/lib/api-auth";

/** Read-only: the heal loop's candidate list, with rate-discipline facts already computed. */
export async function GET(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const incidents = await listOpenIncidentsForHealing();
  return NextResponse.json({ incidents });
}
