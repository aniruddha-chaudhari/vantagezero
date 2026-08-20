"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface BottleneckDatum {
  mpn: string;
  buildableUnits: number | null;
}

const config: ChartConfig = { buildableUnits: { label: "Buildable units", color: "var(--chart-1)" } };

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export function BottleneckRankingChart({ data }: { data: BottleneckDatum[] }) {
  const withData = data.filter((d): d is { mpn: string; buildableUnits: number } => d.buildableUnits != null);
  // Lowest first - the constraining part is the leftmost bar, and the one shown in red.
  const sorted = [...withData].sort((a, b) => a.buildableUnits - b.buildableUnits).slice(0, 8);
  const minVal = sorted[0]?.buildableUnits;

  return (
    <ChartContainer config={config} className="aspect-auto h-[300px]">
      <BarChart data={sorted} margin={{ left: 0, right: 8, top: 8, bottom: 56 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="mpn"
          type="category"
          interval={0}
          angle={-35}
          textAnchor="end"
          height={56}
          tickLine={false}
          axisLine={false}
          tick={{ fontFamily: "monospace", fontSize: 10 }}
        />
        <YAxis type="number" tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="buildableUnits" name="Buildable units" radius={[4, 4, 0, 0]}>
          {sorted.map((d) => (
            <Cell key={d.mpn} fill={d.buildableUnits === minVal ? "var(--destructive)" : "var(--color-buildableUnits)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
