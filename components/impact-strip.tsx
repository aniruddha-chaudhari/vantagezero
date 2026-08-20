import type { PlatformStats } from "@/db/analytics";

/**
 * Master-plan §23 ("quantify everything") - every number here is a real count from the
 * live database, never a target or a rounded-up claim.
 */
export function ImpactStrip({ stats }: { stats: PlatformStats }) {
  const items: Array<{ value: string; label: string; sub?: string }> = [
    { value: String(stats.collectors), label: "custom collectors", sub: `${stats.domains} domains · ${stats.regions} regions` },
    { value: String(stats.trackedMpns), label: "parts tracked" },
    { value: stats.observations.toLocaleString(), label: "observations stored" },
    { value: stats.pricePoints.toLocaleString(), label: "price points" },
    { value: stats.collectorRuns.toLocaleString(), label: "collector runs", sub: stats.validationPassRate != null ? `${Math.round(stats.validationPassRate * 100)}% validation pass rate` : undefined },
    { value: String(stats.incidentsCaught), label: "incidents caught", sub: `${stats.healsPerformed} heal${stats.healsPerformed === 1 ? "" : "s"} performed` },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Live pipeline
        </p>
        <p className="text-[11px] text-muted-foreground">
          every figure is a real count from observed public data
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label}>
            <dd className="font-display text-3xl leading-none tracking-[-0.04em] tabular-nums">{item.value}</dd>
            <dt className="mt-1.5 text-xs font-medium">{item.label}</dt>
            {item.sub && <p className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">{item.sub}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}
