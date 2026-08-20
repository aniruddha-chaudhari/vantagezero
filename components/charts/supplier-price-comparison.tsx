"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface SupplierCurve {
  supplier: string;
  currency: string;
  tiers: Array<{ minQty: number; unitPrice: number }>;
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/** Supplier names contain spaces ("RS Online"), which aren't valid in a CSS custom property. */
function seriesKey(supplier: string): string {
  return supplier.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * One line per supplier, plotted only within a single currency (the caller groups by
 * currency first) - Vantage never converts, so a GBP and an INR ladder are never drawn
 * on the same axis where they'd read as directly comparable.
 */
export function SupplierPriceComparisonChart({
  curves,
  requiredQty,
}: {
  curves: SupplierCurve[];
  requiredQty?: number;
}) {
  if (curves.length === 0) {
    return <p className="text-sm text-muted-foreground">No price ladders observed yet.</p>;
  }

  const config: ChartConfig = {};
  curves.forEach((c, i) => {
    config[seriesKey(c.supplier)] = { label: c.supplier, color: SERIES_COLORS[i % SERIES_COLORS.length] };
  });

  // Merge every supplier's tier thresholds onto one x-axis, carrying each supplier's price
  // forward across thresholds it doesn't itself define (that's how tier pricing behaves).
  const allQtys = [...new Set(curves.flatMap((c) => c.tiers.map((t) => t.minQty)))].sort((a, b) => a - b);
  const data = allQtys.map((qty) => {
    const row: Record<string, number | null> = { qty };
    for (const curve of curves) {
      const applicable = curve.tiers.filter((t) => t.minQty <= qty).pop();
      row[seriesKey(curve.supplier)] = applicable ? applicable.unitPrice : null;
    }
    return row;
  });

  const currency = curves[0].currency;
  const markerQty = requiredQty != null ? allQtys.filter((q) => q <= requiredQty).pop() : undefined;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px]">
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="qty" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}+`} />
        <YAxis tickLine={false} axisLine={false} width={60} tickFormatter={(v) => `${currency} ${v}`} />
        {markerQty != null && (
          <ReferenceLine x={markerQty} stroke="var(--primary)" strokeDasharray="4 4" label={{ value: "your qty", fontSize: 10 }} />
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        {curves.map((c) => (
          <Line
            key={c.supplier}
            type="stepAfter"
            dataKey={seriesKey(c.supplier)}
            name={c.supplier}
            stroke={`var(--color-${seriesKey(c.supplier)})`}
            strokeWidth={2}
            dot
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
