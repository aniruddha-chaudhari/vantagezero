"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface PassRatePoint {
  date: string;
  total: number;
  ok: number;
  passRate: number;
}

const config: ChartConfig = { passRate: { label: "Validation pass rate %", color: "var(--chart-1)" } };

/**
 * The plan's "validation pass rate over time" chart - a heal shows up here as a dip and a
 * recovery. Same three population states as the stock history chart: a single day isn't a
 * trend, so it renders as a number rather than a misleading one-point line.
 */
export function PassRateHistoryChart({ points }: { points: PassRatePoint[] }) {
  if (points.length <= 1) {
    const only = points[0];
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
        <p className="font-display text-4xl tabular-nums">
          {only ? `${Math.round(only.passRate * 100)}%` : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {only ? `${only.ok}/${only.total} runs valid · history begins now` : "no runs recorded yet"}
        </p>
      </div>
    );
  }

  const data = points.map((p) => ({
    date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    passRate: Math.round(p.passRate * 100),
    runs: p.total,
  }));
  const collecting = points.length < 5;

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[200px]">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey="passRate"
            name="Validation pass rate %"
            type="monotone"
            stroke="var(--color-passRate)"
            fill="var(--color-passRate)"
            fillOpacity={0.16}
            strokeWidth={2}
            dot={collecting}
          />
        </AreaChart>
      </ChartContainer>
      {collecting && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Collecting history - only {points.length} days of runs so far
        </p>
      )}
    </div>
  );
}
