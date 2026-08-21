import Link from "next/link";
import { Boxes, CalendarClock, TriangleAlert } from "lucide-react";

import { listProductsForSession, listRecentEvents } from "@/db/queries";
import { formatChangeDiff } from "@/domain/changes";
import { readSessionId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { BuildabilityDial } from "@/components/buildability-dial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive",
  warning: "bg-chart-3",
  medium: "bg-chart-3",
  low: "bg-primary",
};

function scoreTone(score: number | null): { badge: "outline" | "secondary" | "destructive"; bar: string } {
  if (score == null) return { badge: "secondary", bar: "bg-muted-foreground" };
  if (score >= 80) return { badge: "outline", bar: "bg-chart-3" };
  if (score >= 50) return { badge: "secondary", bar: "bg-chart-4" };
  return { badge: "destructive", bar: "bg-destructive" };
}

/** Whole days from today to the ship date - negative once the date has passed. */
function daysUntil(shipDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${shipDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function OverviewPage() {
  const sessionId = await readSessionId();
  const [builds, events] = await Promise.all([
    sessionId ? listProductsForSession(sessionId) : Promise.resolve([]),
    sessionId ? listRecentEvents(sessionId) : Promise.resolve([]),
  ]);

  if (builds.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader className="items-center text-center">
            <Boxes className="size-8 text-muted-foreground" />
            <CardTitle className="mt-2 text-lg">No builds yet</CardTitle>
            <CardDescription>
              Add your MPNs and a planned quantity. Vantage resolves them against live,
              publicly observed supplier data and tells you how many complete units you can
              actually build today.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button asChild>
              <Link href="/dashboard/new">Create your first build</Link>
            </Button>
            <Link href="/dashboard/catalog" className="text-xs text-primary hover:underline">
              or browse the parts already tracked →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const atRisk = builds.filter((b) => (b.buildability.score?.total ?? 100) < 80);
  const blockedUnits = builds.reduce(
    (sum, b) => sum + Math.max(0, b.product.plannedBuildQty - (b.buildability.productBuildableUnits ?? 0)),
    0,
  );
  const plannedUnits = builds.reduce((sum, b) => sum + b.product.plannedBuildQty, 0);
  const blockingParts = builds.filter((b) => (b.buildability.bottleneck?.shortfall ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Buildability</p>
          <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Overview</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Which build needs you today. Decisions only - stock, pricing and lead times live on
            the build and component screens.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/new">New build</Link>
        </Button>
      </div>

      <BuildabilityDial
        builds={builds.map(({ product, buildability }) => ({
          id: product.id,
          name: product.name,
          plannedBuildQty: product.plannedBuildQty,
          buildableUnits: buildability.productBuildableUnits,
          score: buildability.score?.total ?? null,
          bottleneckMpn: buildability.bottleneck?.mpn ?? null,
        }))}
      />

      <div className="grid grid-cols-2 divide-x divide-y rounded-xl border lg:grid-cols-4 lg:divide-y-0">
        {[
          { label: "Active builds", value: builds.length.toLocaleString(), sub: `${plannedUnits.toLocaleString()} units planned` },
          {
            label: "Builds at risk",
            value: atRisk.length.toLocaleString(),
            sub: atRisk.length > 0 ? "buildability below 80" : "all builds healthy",
            alarm: atRisk.length > 0,
          },
          {
            label: "Units blocked",
            value: blockedUnits.toLocaleString(),
            sub: plannedUnits > 0 ? `${Math.round((blockedUnits / plannedUnits) * 100)}% of planned volume` : undefined,
            alarm: blockedUnits > 0,
          },
          {
            label: "Blocking parts",
            value: blockingParts.toLocaleString(),
            sub: blockingParts > 0 ? "short of required quantity" : "no shortfalls observed",
            alarm: blockingParts > 0,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{kpi.label}</p>
            <p
              className={`mt-2 font-display text-3xl tracking-[-0.03em] tabular-nums ${kpi.alarm ? "text-destructive" : ""}`}
            >
              {kpi.value}
            </p>
            {kpi.sub && <p className="mt-1 text-[10px] leading-3.5 text-muted-foreground">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {builds.map(({ product, buildability }) => {
          const buildable = buildability.productBuildableUnits;
          const pct = buildable != null ? Math.min(100, (buildable / product.plannedBuildQty) * 100) : 0;
          const tone = scoreTone(buildability.score?.total ?? null);
          const days = product.shipDate ? daysUntil(product.shipDate) : null;

          return (
            <Link key={product.id} href={`/dashboard/builds/${product.id}`}>
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base tracking-[-0.015em]">{product.name}</CardTitle>
                    <Badge variant={tone.badge}>{buildability.score ? buildability.score.total : "—"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="font-display text-3xl leading-none tracking-[-0.035em] tabular-nums">
                      {buildable?.toLocaleString() ?? "—"}
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        / {product.plannedBuildQty.toLocaleString()} units
                      </span>
                    </p>
                    <Progress value={pct} indicatorClassName={tone.bar} className="mt-2.5" />
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {buildability.bottleneck ? (
                      <p className="flex items-center gap-1.5 text-destructive">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        <span className="font-mono">{buildability.bottleneck.mpn}</span>
                        {(buildability.bottleneck.shortfall ?? 0) > 0 && (
                          <span className="text-muted-foreground">
                            short {buildability.bottleneck.shortfall!.toLocaleString()}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">No bottleneck identified yet</p>
                    )}

                    {days != null && (
                      <p
                        className={`flex items-center gap-1.5 ${days < 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        <CalendarClock className="size-3.5 shrink-0" />
                        {days < 0
                          ? `Ship date passed ${Math.abs(days)}d ago`
                          : days === 0
                            ? "Ships today"
                            : `${days}d to ship date`}
                      </p>
                    )}

                    <p className="text-muted-foreground">
                      {buildability.monitoredCount} of {buildability.totalCount} parts monitored
                      {buildability.partsAwaitingData > 0 && ` · ${buildability.partsAwaitingData} awaiting data`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base tracking-[-0.015em]">Decision & evidence timeline</CardTitle>
          <CardDescription>Real supply changes detected across the parts in your builds.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No changes detected yet - events appear here once a tracked part&apos;s stock, lead
              time, or lifecycle actually moves between two observations.
            </p>
          ) : (
            <div className="space-y-0">
              {events.map((event, index) => (
                <div key={event.id} className="grid grid-cols-[100px_18px_1fr] gap-3">
                  <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                  <div className="relative flex justify-center">
                    <span className={`mt-1 size-2.5 rounded-full ${SEVERITY_DOT[event.severity] ?? "bg-primary"}`} />
                    {index < events.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-border" />}
                  </div>
                  <div className="pb-6">
                    <p className="text-sm font-medium">
                      {event.product ? (
                        <Link href={`/dashboard/builds/${event.product.productId}`} className="hover:underline">
                          {event.product.name}
                        </Link>
                      ) : (
                        <span className="font-mono">{event.mpn}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.message}</p>
                    {(() => {
                      const diff = formatChangeDiff(event.beforeJson, event.afterJson);
                      return diff ? (
                        <p className="mt-1 font-mono text-[11px] font-medium text-foreground/70">{diff}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
