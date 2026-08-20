import Link from "next/link";
import { Boxes, Clock3, TriangleAlert } from "lucide-react";

import { listProductsForSession, listRecentEvents } from "@/db/queries";
import { readSessionId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function scoreBadgeVariant(score: number | null) {
  if (score == null) return "secondary" as const;
  if (score >= 80) return "outline" as const;
  if (score >= 50) return "secondary" as const;
  return "destructive" as const;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive",
  warning: "bg-chart-3",
  medium: "bg-chart-3",
  low: "bg-primary",
};

export default async function OverviewPage() {
  const sessionId = await readSessionId();
  const builds = sessionId ? await listProductsForSession(sessionId) : [];
  const events = sessionId ? await listRecentEvents(sessionId) : [];

  const atRiskCount = builds.filter((b) => (b.buildability.score?.total ?? 100) < 80).length;
  const criticalParts = builds.reduce(
    (sum, b) => sum + (b.buildability.bottleneck && (b.buildability.bottleneck.shortfall ?? 0) > 0 ? 1 : 0),
    0,
  );
  const partsMonitored = builds.reduce((sum, b) => sum + b.buildability.monitoredCount, 0);

  if (builds.length === 0) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader className="items-center text-center">
          <Boxes className="size-8 text-muted-foreground" />
          <CardTitle className="mt-2 text-lg">No builds yet</CardTitle>
          <CardDescription>
            Create a build with your own MPNs and quantities - Vantage will resolve them against
            live, publicly observed data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/dashboard/new">Create your first build</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Buildability</p>
          <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Overview</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Which build needs you today - derived only, no stock or pricing on this screen.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/new">New build</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y rounded-xl border lg:grid-cols-4 lg:divide-y-0">
        {[
          ["Active builds", builds.length],
          ["At risk", atRiskCount],
          ["Critical parts", criticalParts],
          ["Parts monitored", partsMonitored],
        ].map(([label, value]) => (
          <div key={label as string} className="p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-3xl tracking-[-0.03em] tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {builds.map(({ product, buildability }) => (
          <Link key={product.id} href={`/dashboard/builds/${product.id}`}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base tracking-[-0.015em]">{product.name}</CardTitle>
                  <Badge variant={scoreBadgeVariant(buildability.score?.total ?? null)}>
                    {buildability.score ? `${buildability.score.total}` : "—"}
                  </Badge>
                </div>
                <CardDescription>
                  {buildability.productBuildableUnits ?? "—"} / {product.plannedBuildQty.toLocaleString()} units
                  buildable
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {buildability.bottleneck ? (
                  <p className="flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5" />
                    Bottleneck: <span className="font-mono">{buildability.bottleneck.mpn}</span>
                  </p>
                ) : (
                  <p>No bottleneck identified yet</p>
                )}
                {product.shipDate && (
                  <p className="flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    Ship {product.shipDate}
                  </p>
                )}
                <p>
                  {buildability.monitoredCount} of {buildability.totalCount} parts monitored
                  {buildability.partsAwaitingData > 0 && ` · ${buildability.partsAwaitingData} awaiting data`}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base tracking-[-0.015em]">Decision & evidence timeline</CardTitle>
          <CardDescription>Real semantic supply changes detected across your tracked parts.</CardDescription>
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
