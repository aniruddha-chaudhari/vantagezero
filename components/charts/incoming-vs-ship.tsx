"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  available: { label: "Available now", color: "var(--chart-1)" },
  incoming: { label: "Incoming", color: "var(--chart-2)" },
};

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
      <ChartContainer config={config} className="aspect-auto h-[140px]">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" hide />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="available" stackId="a" fill="var(--color-available)" radius={[4, 0, 0, 4]} name="Available now" />
          <Bar dataKey="incoming" stackId="a" fill="var(--color-incoming)" radius={[0, 4, 4, 0]} name="Incoming" />
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
