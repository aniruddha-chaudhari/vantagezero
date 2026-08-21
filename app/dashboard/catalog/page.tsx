import Link from "next/link";
import { Boxes } from "lucide-react";

import { ComponentImage } from "@/components/component-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listCatalog } from "@/db/analytics";
import { formatAge } from "@/domain/freshness";
import { lifecycleRisk } from "@/domain/risk";

function formatPrice(unitPrice: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  const digits = unitPrice < 1 ? 3 : 2;
  return symbol ? `${symbol}${unitPrice.toFixed(digits)}` : `${unitPrice.toFixed(digits)} ${currency}`;
}

/** Same tone a marketing status carries everywhere else - never a flat "looks fine" green. */
function marketingStatusClass(marketingStatus: string): string {
  const risk = lifecycleRisk(marketingStatus);
  if (risk === "low") return "border-chart-3/25 bg-chart-3/10 text-chart-3";
  if (risk === "medium") return "border-chart-4/25 bg-chart-4/10 text-chart-4";
  if (risk === "high" || risk === "critical") return "border-destructive/25 bg-destructive/10 text-destructive";
  return "";
}

export default async function CatalogPage() {
  const catalog = await listCatalog();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Buildability</p>
        <h1 className="mt-2 font-display text-4xl tracking-[-0.04em]">Tracked catalog</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every part Vantage currently observes, with live stock summed only across storefronts
          in the same region and entry-tier pricing shown in each source&apos;s own currency.
        </p>
      </div>

      {catalog.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Boxes className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No parts have a valid observation yet. Run an ingestion cycle to populate the catalog.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {catalog.map((entry) => (
            <Link key={entry.mpn} href={`/dashboard/components/${encodeURIComponent(entry.mpn)}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <ComponentImage src={entry.imageUrl} alt={entry.mpn} className="size-16" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-semibold">{entry.mpn}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {entry.manufacturer ?? "manufacturer not observed"}
                      </p>
                      {entry.package && (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{entry.package}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    {/* One figure per region - never a single cross-region total (§5). */}
                    <div className="space-y-1.5">
                      {entry.stockByRegion.map((pool) => (
                        <div key={pool.region}>
                          <p className="font-display text-2xl leading-none tracking-[-0.03em] tabular-nums">
                            {pool.stock.toLocaleString()}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            units in {pool.region} · {pool.supplierCount} source
                            {pool.supplierCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      ))}
                    </div>
                    {entry.bestPrice && (
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatPrice(entry.bestPrice.unitPrice, entry.bestPrice.currency)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          from {entry.bestPrice.supplier}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.marketingStatus && (
                      <Badge variant="outline" className={`text-[10px] ${marketingStatusClass(entry.marketingStatus)}`}>
                        {entry.marketingStatus}
                      </Badge>
                    )}
                    {entry.freshness === "stale" && (
                      <Badge variant="secondary" className="text-[10px]">
                        stale
                      </Badge>
                    )}
                    {entry.lastObservedAt && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatAge(entry.lastObservedAt)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
