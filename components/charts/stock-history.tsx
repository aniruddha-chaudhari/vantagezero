"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface HistoryPoint {
  observedAt: string;
  stock: number;
}

const config: ChartConfig = { stock: { label: "Observed stock", color: "var(--chart-1)" } };

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Three population states, per plan: a 1-point "chart" is a broken affordance, and 2-4
 * points connected by a line implies a trend that isn't there yet.
 */
export function StockHistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length <= 1) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-4xl font-semibold tabular-nums">{points[0]?.stock.toLocaleString() ?? "—"}</p>
        <p className="text-xs text-muted-foreground">History begins now</p>
      </div>
    );
  }

  const chartData = points.map((p) => ({ time: formatTime(p.observedAt), stock: p.stock }));
  const collecting = points.length < 5;

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[180px]">
        <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {collecting ? (
            <Line dataKey="stock" name="Observed stock" stroke="none" dot={{ r: 4, fill: "var(--color-stock)" }} isAnimationActive={false} />
          ) : (
            <Line dataKey="stock" name="Observed stock" type="monotone" stroke="var(--color-stock)" strokeWidth={2} dot={false} />
          )}
        </LineChart>
      </ChartContainer>
      {collecting && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">Collecting history - not enough points for a trend yet</p>
      )}
    </div>
  );
}
