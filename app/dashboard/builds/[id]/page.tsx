import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { BottleneckRankingChart } from "@/components/charts/bottleneck-ranking";
import { CoverageBarsChart } from "@/components/charts/coverage-bars";
import { ComponentImage } from "@/components/component-image";
import { ResolvePart } from "@/components/resolve-part";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBuildCostSummary } from "@/db/analytics";
import { getProductDetail } from "@/db/queries";
import { formatAge } from "@/domain/freshness";
import type { RiskLevel } from "@/domain/risk";
import { readSessionId } from "@/lib/session";

function money(value: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency}`;
}

function RiskBadge({ level }: { level: RiskLevel }) {
  if (level === "unknown") return <Badge variant="secondary">unknown</Badge>;
  if (level === "low") return <Badge variant="outline" className="border-chart-3/25 bg-chart-3/10 text-chart-3">low</Badge>;
  if (level === "medium") return <Badge variant="secondary">medium</Badge>;
  if (level === "high") return <Badge variant="destructive">high</Badge>;
  return <Badge variant="destructive">critical</Badge>;
}

/** Live monitoring surface: never prerendered, never cached. Observations land from the
 * cron between requests, so a build-time snapshot would show a stale buildable number. */
export const dynamic = "force-dynamic";

export default async function BuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = await readSessionId();
  const detail = sessionId ? await getProductDetail(id, sessionId) : null;
  if (!detail) notFound();

  const { product, parts, buildability, singleSourcedCount } = detail;

  const monitoredParts = parts.filter((p) => p.monitored);
  const costSummary =
    monitoredParts.length > 0
      ? await getBuildCostSummary(monitoredParts.map((p) => ({ mpn: p.mpn, requiredQty: p.requiredQty })))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={buildability.partsAwaitingData > 0 ? "secondary" : "outline"}>
            {buildability.monitoredCount} of {buildability.totalCount} parts monitored
            {buildability.partsAwaitingData > 0 && ` · ${buildability.partsAwaitingData} awaiting first observation`}
          </Badge>
          {singleSourcedCount > 0 && (
            <Badge variant="outline" className="border-chart-4/25 bg-chart-4/10 text-chart-4">
              {singleSourcedCount} single-sourced
            </Badge>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">{product.name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Planned run of {product.plannedBuildQty.toLocaleString()} units
          {product.shipDate && ` · shipping ${product.shipDate}`}.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Decision · buildable now
            </CardDescription>
            <CardTitle className="mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {buildability.productBuildableUnits?.toLocaleString() ?? "—"}{" "}
              <span className="text-lg font-medium text-muted-foreground">
                / {product.plannedBuildQty.toLocaleString()} units
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {buildability.score ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Availability coverage", buildability.score.coverage, "60% weight"],
                  ["Lead-time health", buildability.score.leadTime, "20% weight"],
                  ["Lifecycle health", buildability.score.lifecycle, "20% weight"],
                ].map(([label, value, weight]) => (
                  <div key={label as string} className="rounded-lg bg-secondary p-3">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{value == null ? "—" : `${value}`}</p>
                    <Progress value={value == null ? 0 : (value as number)} className="mt-2" />
                    <p className="mt-1 text-[10px] text-muted-foreground">{weight}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No monitored part has a real observation yet - the score appears once the first one lands.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={buildability.bottleneck ? "border-destructive/20" : undefined}>
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-4" />
              <CardDescription className="font-semibold text-destructive">BOTTLENECK</CardDescription>
            </div>
            {buildability.bottleneck ? (
              <>
                <CardTitle className="pt-2 font-mono text-lg">{buildability.bottleneck.mpn}</CardTitle>
                <CardDescription>Qty {buildability.bottleneck.qtyPerUnit} per unit</CardDescription>
              </>
            ) : (
              <CardTitle className="pt-2 text-lg">None identified yet</CardTitle>
            )}
          </CardHeader>
          {buildability.bottleneck && (
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Shortfall</p>
                  <p className="mt-1 text-2xl font-semibold text-destructive">
                    {buildability.bottleneck.shortfall?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Coverage</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {buildability.bottleneck.coverageRatio != null
                      ? `${Math.min(100, Math.round(buildability.bottleneck.coverageRatio * 100))}%`
                      : "—"}
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/components/${encodeURIComponent(buildability.bottleneck.mpn)}?qty=${buildability.bottleneck.requiredQty}${product.shipDate ? `&shipDate=${product.shipDate}` : ""}`}
                className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
              >
                View component evidence →
              </Link>
            </CardContent>
          )}
        </Card>
      </section>

      {costSummary && costSummary.byCurrency.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Estimated run cost
            </CardDescription>
            <CardDescription>
              Cheapest achievable price per part at this run&apos;s required quantity - never
              converted or blended across currencies.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {costSummary.byCurrency.map((group) => {
              const topDrivers = group.lines.slice(0, 3);
              return (
                <div key={group.currency} className="rounded-lg border p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Total in {group.currency}
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                    {money(group.total, group.currency)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    across {group.lines.length} priced part{group.lines.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 space-y-1.5 border-t pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Top cost drivers
                    </p>
                    {topDrivers.map((line) => (
                      <div key={line.mpn} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-mono">{line.mpn}</span>
                        <span className="shrink-0 font-medium tabular-nums">{money(line.lineTotal, line.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {costSummary.unpriced.length > 0 && (
              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {costSummary.unpriced.length} part{costSummary.unpriced.length === 1 ? "" : "s"} without price data
                </p>
                <p className="mt-1.5 font-mono">{costSummary.unpriced.join(", ")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage by part</CardTitle>
            <CardDescription>Observed stock as a percentage of what this run requires.</CardDescription>
          </CardHeader>
          <CardContent>
            <CoverageBarsChart data={parts.map((p) => ({ mpn: p.mpn, coverageRatio: p.coverageRatio }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bottleneck ranking</CardTitle>
            <CardDescription>Parts ranked by buildable units - lowest constrains the run.</CardDescription>
          </CardHeader>
          <CardContent>
            <BottleneckRankingChart data={parts.map((p) => ({ mpn: p.mpn, buildableUnits: p.buildableUnits }))} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">BOM buildability</CardTitle>
          <CardDescription>Every part in this build, sorted by production impact.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Need</TableHead>
                <TableHead>Observed stock</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Last checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part) => {
                const isBottleneck = buildability.bottleneck?.mpn === part.mpn;
                if (!part.monitored) {
                  return (
                    <TableRow key={part.mpn} className="opacity-80">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ComponentImage src={null} alt={part.mpn} className="size-9" />
                          <p className="font-mono text-xs font-semibold">{part.mpn}</p>
                        </div>
                      </TableCell>
                      <TableCell colSpan={6} className="font-mono text-xs text-muted-foreground">
                        — not tracked
                      </TableCell>
                      <TableCell>
                        <ResolvePart mpn={part.mpn} />
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={part.mpn} className={isBottleneck ? "bg-destructive/[0.025]" : undefined}>
                    <TableCell>
                      <Link href={`/dashboard/components/${encodeURIComponent(part.mpn)}?qty=${part.requiredQty}`}>
                        <div className="flex items-center gap-3">
                          <ComponentImage src={part.imageUrl} alt={part.mpn} className="size-9" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-mono text-xs font-semibold hover:underline">
                              {part.mpn}
                              {part.singleSourced && (
                                <span
                                  title="Tracked on exactly one distributor - no fallback if this source degrades"
                                  className="size-1.5 shrink-0 rounded-full bg-chart-4"
                                />
                              )}
                            </p>
                            {part.region && (
                              <p className="text-[10px] text-muted-foreground">
                                {part.region}
                                {part.otherRegions.length > 0 &&
                                  ` · +${part.otherRegions.map((r) => r.stock.toLocaleString()).join("/")} in ${part.otherRegions
                                    .map((r) => r.region)
                                    .join("/")} (not counted)`}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{part.requiredQty.toLocaleString()}</TableCell>
                    {part.observedStock == null ? (
                      <TableCell colSpan={5} className="text-xs text-muted-foreground">
                        Data quality incident - no valid observation yet
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="font-medium tabular-nums">{part.observedStock.toLocaleString()}</TableCell>
                        <TableCell className={isBottleneck ? "font-semibold text-destructive" : "font-medium"}>
                          {part.coverageRatio != null ? `${Math.min(100, Math.round(part.coverageRatio * 100))}%` : "—"}
                        </TableCell>
                        <TableCell>{part.leadTimeWeeks != null ? `${part.leadTimeWeeks} wks` : "—"}</TableCell>
                        <TableCell>{part.marketingStatus ?? "—"}</TableCell>
                        <TableCell>
                          <RiskBadge level={part.leadTimeRisk === "unknown" ? part.lifecycleRiskLevel : part.leadTimeRisk} />
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {part.observedAt ? formatAge(part.observedAt) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
