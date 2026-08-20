import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveCatalogCandidate } from "@/db/catalog";

/** A real collector run - can take up to ~1-2 minutes. */
export const maxDuration = 120;

const bodySchema = z.object({
  mpn: z.string().min(1),
  sourceName: z.string().min(1),
  url: z.string().url(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await resolveCatalogCandidate(parsed.data);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
