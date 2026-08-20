import { ShieldCheck } from "lucide-react";

import { IncomingVsShipChart } from "@/components/charts/incoming-vs-ship";
import { PriceBreakCurveChart } from "@/components/charts/price-break-curve";
import { SourceContributionChart } from "@/components/charts/source-contribution";
import { StockHistoryChart } from "@/components/charts/stock-history";
import { ComponentImage } from "@/components/component-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getComponentDetail } from "@/db/queries";

function unitPriceAtQty(priceBreaks: Array<{ minQty: number; unitPrice: string }>, qty: number): number | null {
  if (priceBreaks.length === 0) return null;
  const sorted = [...priceBreaks].sort((a, b) => a.minQty - b.minQty);
  let price = Number(sorted[0].unitPrice);
  for (const b of sorted) {
    if (b.minQty <= qty) price = Number(b.unitPrice);
  }
  return price;
}

function FreshnessBadge({ state }: { state: "fresh" | "stale" }) {
  return state === "fresh" ? (
    <Badge variant="outline" className="border-chart-2/25 bg-chart-1/10 text-chart-4">
      fresh
    </Badge>
  ) : (
    <Badge variant="secondary">stale</Badge>
  );
}

export default async function ComponentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mpn: string }>;
  searchParams: Promise<{ qty?: string; shipDate?: string }>;
}) {
  const { mpn: encodedMpn } = await params;
  const { qty, shipDate } = await searchParams;
  const mpn = decodeURIComponent(encodedMpn);
  const detail = await getComponentDetail(mpn);
  const requiredQty = qty ? Number(qty) : undefined;

  const totalStock = detail.distributorSources.reduce((sum, s) => sum + s.stock, 0);
  const primaryImage = detail.distributorSources.find((s) => s.imageUrl)?.imageUrl ?? null;
  const priceSources = detail.distributorSources.filter((s) => s.priceBreaks.length > 0);
  const incomingSource = detail.distributorSources.find((s) => s.incoming != null && s.incoming > 0) ?? detail.distributorSources[0];

  if (detail.state === "failed") {
    return (
      <Card className="mx-auto max-w-lg border-destructive/20">
        <CardHeader>
          <CardTitle className="font-mono">{mpn}</CardTitle>
          <CardDescription>Data quality incident</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No source has produced a valid observation for this part yet. Stock is never shown as
            zero when extraction fails - it stays absent until a real observation succeeds.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <ComponentImage src={primaryImage} alt={mpn} className="size-24" expandable />
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-[-0.02em]">{mpn}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.distributorSources.length} source{detail.distributorSources.length === 1 ? "" : "s"} tracked
            {detail.manufacturer ? ` · lifecycle from ${detail.manufacturer.supplier}` : ""}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.14em]">Decision</CardDescription>
          <CardTitle className="font-display text-5xl tracking-[-0.04em]">{totalStock.toLocaleString()}</CardTitle>
          <CardDescription>units observed public stock across tracked regional sites</CardDescription>
        </CardHeader>
        {requiredQty != null && (
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Need</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{requiredQty.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Shortfall</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-destructive">
                  {Math.max(0, requiredQty - totalStock).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Coverage</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{Math.round((totalStock / requiredQty) * 100)}%</p>
              </div>
            </div>
          </CardContent>
        )}
        <CardContent className={requiredQty != null ? "pt-0" : undefined}>
          <div className="flex items-center gap-2 text-xs font-medium text-chart-4">
            <ShieldCheck className="size-4" />
            Observed public stock across tracked regional sites
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source comparison</CardTitle>
          <CardDescription>Prices and stock are per source, in that source&apos;s own currency - never summed or averaged.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {detail.distributorSources.map((s) => (
            <div key={s.sourceTargetId} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {s.supplier}
                  {s.region ? ` · ${s.region}` : ""}
                </p>
                <FreshnessBadge state={s.state} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Stock</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{s.stock.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Incoming</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{s.incoming?.toLocaleString() ?? "—"}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    Unit price{requiredQty != null ? ` @ ${requiredQty.toLocaleString()}` : ""}
                  </p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {(() => {
                      const price = unitPriceAtQty(s.priceBreaks, requiredQty ?? 1);
                      return price != null ? `${s.currency} ${price.toFixed(2)}` : "—";
                    })()}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Currency</p>
                  <p className="mt-0.5 font-semibold">{s.currency}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Lead time</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{s.leadTimeWeeks != null ? `${s.leadTimeWeeks} wks` : "—"}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">MOQ</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{s.minimumOrderQty}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Order multiple</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{s.orderMultiple}</p>
                </div>
              </div>
              <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-primary hover:underline">
                View source page →
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      {detail.manufacturer && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Manufacturer lifecycle</CardTitle>
              <FreshnessBadge state={detail.manufacturer.state} />
            </div>
            <CardDescription>{detail.manufacturer.supplier}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Marketing status", detail.manufacturer.marketingStatus],
              ["Production status", detail.manufacturer.productionStatus ?? "—"],
              ["Longevity", detail.manufacturer.longevityYears ? `${detail.manufacturer.longevityYears} yrs` : "—"],
              ["Package", detail.manufacturer.package ?? "—"],
              ["Grade", detail.manufacturer.grade ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-secondary p-3">
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {priceSources.length > 0 ? (
          priceSources.map((s) => (
            <Card key={s.sourceTargetId}>
              <CardHeader>
                <CardTitle className="text-base">Price break curve</CardTitle>
                <CardDescription>
                  Unit price by order quantity ({s.supplier}
                  {s.region ? ` · ${s.region}` : ""}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PriceBreakCurveChart
                  data={s.priceBreaks.map((pb) => ({ minQty: pb.minQty, unitPrice: Number(pb.unitPrice) }))}
                  currency={s.currency}
                  requiredQty={requiredQty}
                />
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price break curve</CardTitle>
              <CardDescription>Unit price by order quantity.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No price break data observed yet.</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incoming vs ship date</CardTitle>
            <CardDescription>Stock available now vs arriving before you&apos;d need it.</CardDescription>
          </CardHeader>
          <CardContent>
            {incomingSource ? (
              <IncomingVsShipChart stock={incomingSource.stock} incoming={incomingSource.incoming} incomingDate={incomingSource.incomingDate} shipDate={shipDate} />
            ) : (
              <p className="text-sm text-muted-foreground">No source data yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source contribution</CardTitle>
            <CardDescription>Side-by-side, never stacked into one number.</CardDescription>
          </CardHeader>
          <CardContent>
            <SourceContributionChart data={detail.distributorSources.map((s) => ({ supplier: s.supplier, region: s.region, stock: s.stock }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observed stock over time</CardTitle>
            <CardDescription>Combined across tracked sources.</CardDescription>
          </CardHeader>
          <CardContent>
            <StockHistoryChart points={detail.history.map((h) => ({ observedAt: h.observedAt.toString(), stock: h.stock }))} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
