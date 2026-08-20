"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface PriceBreakDatum {
  minQty: number;
  unitPrice: number;
}

const config: ChartConfig = { unitPrice: { label: "Unit price", color: "var(--chart-1)" } };

function closestTierFor(sorted: PriceBreakDatum[], qty: number): number {
  let tier = sorted[0].minQty;
  for (const b of sorted) {
    if (b.minQty <= qty) tier = b.minQty;
  }
  return tier;
}

export function PriceBreakCurveChart({
  data,
  currency,
  requiredQty,
}: {
  data: PriceBreakDatum[];
  currency: string;
  requiredQty?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No price break data observed yet.</p>;
  }
  const sorted = [...data].sort((a, b) => a.minQty - b.minQty);
  const markerTier = requiredQty != null ? closestTierFor(sorted, requiredQty) : null;

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px]">
      <LineChart data={sorted} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="minQty" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}+`} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `${currency} ${v}`} />
        {markerTier != null && (
          <ReferenceLine x={markerTier} stroke="var(--primary)" strokeDasharray="4 4" label={{ value: "your qty", fontSize: 10 }} />
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="stepAfter"
          dataKey="unitPrice"
          name={`Unit price (${currency})`}
          stroke="var(--color-unitPrice)"
          strokeWidth={2}
          dot
        />
      </LineChart>
    </ChartContainer>
  );
}
