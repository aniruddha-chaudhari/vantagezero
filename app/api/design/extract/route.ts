import { NextResponse } from "next/server";
import { z } from "zod";

import { listCatalog } from "@/db/analytics";
import { designExtractionSchema, reconcileWithCatalog } from "@/domain/design";
import { extractBuildRequirements } from "@/lib/groq";

const bodySchema = z.object({
  description: z.string().min(1).max(2000),
  plannedBuildQty: z.number().int().positive(),
  targetUnitCost: z.string().max(100).nullable().optional(),
});

/** Turns a free-text product description into categorized, catalog-aware BOM candidates. */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "AI-assisted part selection isn't configured on this deployment (missing GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const catalog = await listCatalog();

    const raw = await extractBuildRequirements({
      description: parsed.data.description,
      plannedBuildQty: parsed.data.plannedBuildQty,
      targetUnitCost: parsed.data.targetUnitCost ?? null,
      trackedCatalog: catalog.map((c) => ({
        mpn: c.mpn,
        manufacturer: c.manufacturer,
        package: c.package,
        marketingStatus: c.marketingStatus,
      })),
    });

    const extraction = designExtractionSchema.safeParse(raw);
    if (!extraction.success) {
      return NextResponse.json(
        { error: "Could not make sense of that description - try rephrasing or being more specific." },
        { status: 502 },
      );
    }

    const trackedMpns = new Set(catalog.map((c) => c.mpn));
    const reconciled = reconcileWithCatalog(extraction.data, trackedMpns);

    // Full catalog entries so the client can render real stock/price/lifecycle for any
    // trackedMatch without a second round-trip - never re-derived from the model's output.
    return NextResponse.json({ extraction: reconciled, catalog });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
