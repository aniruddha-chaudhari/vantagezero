"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

function ChartContainer({ config, className, children, ...props }: React.ComponentProps<"div"> & { config: ChartConfig; children: React.ReactElement }) {
  const colorVars = Object.entries(config).reduce<Record<string, string>>((vars, [key, item]) => {
    if (item.color) vars[`--color-${key}`] = item.color;
    return vars;
  }, {});
  return (
    <div className={cn("flex aspect-video w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border", className)} style={colorVars as React.CSSProperties} {...props}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

function ChartTooltipContent({ active, payload, label, className }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>; label?: string | number; className?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={cn("min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md", className)}>
      {label !== undefined && <p className="mb-1.5 font-medium">{label}</p>}
      <div className="grid gap-1.5">
        {payload.map((item) => (
          <div key={`${item.dataKey}-${item.name}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: item.color }} />{item.name}</span>
            <span className="font-mono font-medium tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ChartTooltip = Tooltip;

export { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig };
