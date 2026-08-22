import Link from "next/link";
import { TrendingDown } from "lucide-react";

import { SupplierPriceComparisonChart } from "@/components/charts/supplier-price-comparison";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupplierPriceCurves, listComparableMpns } from "@/db/analytics";

const DEFAULT_QTY = 1000;

function symbolFor(currency: string): string {
  return currency === "GBP" ? "£" : currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
}

function money(value: number, currency: string): string {
  const symbol = symbolFor(currency);
  const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency}`;
}

/** Live monitoring surface: never prerendered, never cached. Observations land from the
 * cron between requests, so a build-time snapshot would show a stale buildable number. */
export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ mpn?: string; qty?: string }>;
}) {
  const { mpn: mpnParam, qty: qtyParam } = await searchParams;
  const comparable = await listComparableMpns();

  const selectedMpn = mpnParam ?? comparable[0]?.mpn;
  const qty = qtyParam && Number(qtyParam) > 0 ? Number(qtyParam) : DEFAULT_QTY;
  const curves = selectedMpn ? await getSupplierPriceCurves(selectedMpn, qty) : [];

  // Group by currency - a GBP ladder and an INR ladder are never compared or charted together.
  const byCurrency = new Map<string, typeof curves>();
  for (const c of curves) {
    const list = byCurrency.get(c.currency) ?? [];
    list.push(c);
    byCurrency.set(c.currency, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Price comparison</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Real observed price ladders per supplier, and what each would actually charge at your
          build quantity. Prices are never converted between currencies - each is shown in the
          currency that source reported.
        </p>
      </div>

      {comparable.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No part has price data from more than one supplier yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Parts observed on multiple suppliers</CardTitle>
              <CardDescription>Quantity: {qty.toLocaleString()} units</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {comparable.map((c) => (
                <Link key={c.mpn} href={`/dashboard/pricing?mpn=${encodeURIComponent(c.mpn)}&qty=${qty}`}>
                  <Badge
                    variant={c.mpn === selectedMpn ? "default" : "outline"}
                    className="cursor-pointer font-mono text-[11px]"
                  >
                    {c.mpn} · {c.supplierCount}
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>

          {[...byCurrency.entries()].map(([currency, group]) => {
            const priced = group.filter((c) => c.lineTotalAtQty != null);
            const cheapest = priced.slice().sort((a, b) => a.lineTotalAtQty! - b.lineTotalAtQty!)[0];
            const dearest = priced.slice().sort((a, b) => b.lineTotalAtQty! - a.lineTotalAtQty!)[0];
            const saving = cheapest && dearest ? dearest.lineTotalAtQty! - cheapest.lineTotalAtQty! : 0;

            return (
              <section key={currency} className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      <span className="font-mono">{selectedMpn}</span> price ladders · {currency}
                    </CardTitle>
                    <CardDescription>
                      Unit price by order quantity, stepped exactly as each supplier tiers it.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SupplierPriceComparisonChart
                      curves={group.map((c) => ({ supplier: c.supplier, currency: c.currency, tiers: c.tiers }))}
                      requiredQty={qty}
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {saving > 0 && cheapest && (
                    <Card className="border-chart-3/25 bg-chart-3/[0.06]">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-chart-3">
                          <TrendingDown className="size-4" />
                          <p className="text-xs font-semibold uppercase tracking-wide">Cheapest at this quantity</p>
                        </div>
                        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                          {money(cheapest.lineTotalAtQty!, currency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {cheapest.supplier} · {money(cheapest.unitPriceAtQty!, currency)}/unit ·{" "}
                          {money(saving, currency)} less than the highest observed
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Per-supplier totals</CardTitle>
                      <CardDescription>At {qty.toLocaleString()} units, in {currency}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {group.map((c) => (
                        <div key={c.supplier} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {c.supplier}
                              {c.region ? ` · ${c.region}` : ""}
                            </p>
                            {c.stock >= qty ? (
                              <Badge variant="outline" className="border-chart-3/25 bg-chart-3/10 text-[10px] text-chart-3">
                                covers qty
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                {c.stock.toLocaleString()} in stock
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-3">
                            <p className="text-lg font-semibold tabular-nums">
                              {c.lineTotalAtQty != null ? money(c.lineTotalAtQty, c.currency) : "—"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.unitPriceAtQty != null ? `${money(c.unitPriceAtQty, c.currency)}/unit` : "no tier reached"}
                            </p>
                          </div>
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[11px] text-primary hover:underline"
                          >
                            View source page →
                          </a>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </section>
            );
          })}

          <p className="text-xs leading-5 text-muted-foreground">
            Totals are {"unit price at the applicable tier × quantity"} - they exclude tax, shipping,
            and any minimum-order or order-multiple constraints, which are captured per source and
            shown on the component page.
          </p>
        </>
      )}
    </div>
  );
}
