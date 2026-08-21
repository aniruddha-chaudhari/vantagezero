"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface CoverageBarDatum {
  mpn: string;
  coverageRatio: number | null;
}

const config: ChartConfig = { coveragePct: { label: "Coverage %", color: "var(--chart-1)" } };

export function CoverageBarsChart({ data }: { data: CoverageBarDatum[] }) {
  const chartData = data.map((d) => ({
    mpn: d.mpn,
    // null (no observation yet) stays null - Recharts draws no bar rather than a fabricated
    // 0% one, which would be indistinguishable from a genuinely empty part. Surplus stock is
    // clamped to 100 here purely so one well-stocked part can't blow out the shared Y-axis
    // and flatten every other bar - the real, unclamped ratio is still shown as text elsewhere.
    coveragePct: d.coverageRatio == null ? null : Math.min(100, Math.round(d.coverageRatio * 100)),
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[300px]">
      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 56 }}>
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
        <YAxis type="number" tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
        {/* 100% is the line between "this run is covered" and "it isn't". */}
        <ReferenceLine y={100} stroke="var(--destructive)" strokeDasharray="4 4" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="coveragePct" name="Coverage %" radius={[4, 4, 0, 0]}>
          {chartData.map((d) => (
            <Cell
              key={d.mpn}
              fill={d.coveragePct != null && d.coveragePct < 100 ? "var(--destructive)" : "var(--color-coveragePct)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
