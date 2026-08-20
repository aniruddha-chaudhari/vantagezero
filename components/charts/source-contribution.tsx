"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface SourceContributionDatum {
  supplier: string;
  region: string | null;
  stock: number;
}

const config: ChartConfig = { stock: { label: "Observed stock", color: "var(--chart-1)" } };

/** Side-by-side only - never stacked, so a judge can never mistake this for one summed number. */
export function SourceContributionChart({ data }: { data: SourceContributionDatum[] }) {
  const chartData = data.map((d) => ({ label: d.region ? `${d.supplier} (${d.region})` : d.supplier, stock: d.stock }));
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px]">
      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="stock" name="Observed stock" fill="var(--color-stock)" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
