import { NextResponse } from "next/server";

import { getComponentDetail } from "@/db/queries";

/** Latest-valid-observation view for one MPN, across every source that carries it. */
export async function GET(_request: Request, context: { params: Promise<{ mpn: string }> }) {
  const { mpn } = await context.params;
  const detail = await getComponentDetail(mpn);
  return NextResponse.json(detail);
}
