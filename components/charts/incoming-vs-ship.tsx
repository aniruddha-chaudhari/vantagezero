"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  available: { label: "Available now", color: "var(--chart-1)" },
  incoming: { label: "Incoming", color: "var(--chart-2)" },
};

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export function IncomingVsShipChart({
  stock,
  incoming,
  incomingDate,
  shipDate,
}: {
  stock: number;
  incoming: number | null;
  incomingDate: string | null;
  shipDate?: string;
}) {
  const data = [{ label: "Stock", available: stock, incoming: incoming ?? 0 }];
  const arrivesInTime = incomingDate && shipDate ? incomingDate <= shipDate : null;

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[220px]">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" type="category" tickLine={false} axisLine={false} hide />
          <YAxis type="number" tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {/* Stacked so total height reads as "everything that could be available", with the
              already-on-hand portion visually distinct from what's merely inbound. */}
          <Bar dataKey="available" stackId="a" fill="var(--color-available)" name="Available now" maxBarSize={96} />
          <Bar
            dataKey="incoming"
            stackId="a"
            fill="var(--color-incoming)"
            radius={[4, 4, 0, 0]}
            name="Incoming"
            maxBarSize={96}
          />
        </BarChart>
      </ChartContainer>
      {incoming != null && incoming > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {incomingDate
            ? `${incoming.toLocaleString()} more expected ${incomingDate}`
            : `${incoming.toLocaleString()} more incoming, no date given`}
          {arrivesInTime === false && " — after your ship date"}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No incoming shipment currently observed.</p>
      )}
    </div>
  );
}
