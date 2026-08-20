import { NextResponse } from "next/server";
import { z } from "zod";

import { createProduct } from "@/db/queries";
import { getOrCreateSessionId } from "@/lib/session";

const partSchema = z.object({
  mpn: z.string().min(1),
  qtyPerUnit: z.number().int().positive(),
  criticality: z.enum(["critical", "important", "optional"]).optional(),
});

const bodySchema = z.object({
  name: z.string().min(1),
  plannedBuildQty: z.number().int().positive(),
  shipDate: z.string().nullable().optional(),
  parts: z.array(partSchema).min(1),
});

/** Creates a build for the caller's (cookie) session. Never resolves MPNs live here - only against the seeded catalog (see db/queries.ts resolveMpnAgainstCatalog). */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const product = await createProduct({
    sessionId,
    name: parsed.data.name,
    plannedBuildQty: parsed.data.plannedBuildQty,
    shipDate: parsed.data.shipDate ?? null,
    parts: parsed.data.parts,
  });

  return NextResponse.json({ product });
}
