"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface BottleneckDatum {
  mpn: string;
  buildableUnits: number | null;
}

const config: ChartConfig = { buildableUnits: { label: "Buildable units", color: "var(--chart-1)" } };

export function BottleneckRankingChart({ data }: { data: BottleneckDatum[] }) {
  const withData = data.filter((d): d is { mpn: string; buildableUnits: number } => d.buildableUnits != null);
  const sorted = [...withData].sort((a, b) => a.buildableUnits - b.buildableUnits).slice(0, 8);
  const minVal = sorted[0]?.buildableUnits;

  return (
    <ChartContainer config={config} className="aspect-auto h-[280px]">
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="mpn"
          width={112}
          tickLine={false}
          axisLine={false}
          tick={{ fontFamily: "monospace", fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="buildableUnits" name="Buildable units" radius={[0, 4, 4, 0]}>
          {sorted.map((d) => (
            <Cell key={d.mpn} fill={d.buildableUnits === minVal ? "var(--destructive)" : "var(--color-buildableUnits)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
