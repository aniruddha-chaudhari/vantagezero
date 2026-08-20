"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface CoverageBarDatum {
  mpn: string;
  coverageRatio: number | null;
}

const config: ChartConfig = { coveragePct: { label: "Coverage %", color: "var(--chart-1)" } };

export function CoverageBarsChart({ data }: { data: CoverageBarDatum[] }) {
  const chartData = data.map((d) => ({
    mpn: d.mpn,
    coveragePct: d.coverageRatio == null ? 0 : Math.round(d.coverageRatio * 100),
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[280px]">
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 0 }}>
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
        <ReferenceLine x={100} stroke="var(--destructive)" strokeDasharray="4 4" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="coveragePct" name="Coverage %" fill="var(--color-coveragePct)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
