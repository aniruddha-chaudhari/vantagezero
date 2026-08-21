import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

/** Matches db/analytics.ts's CatalogEntry as it actually arrives over JSON (Date -> string). */
export interface ClientCatalogEntry {
  mpn: string;
  imageUrl: string | null;
  manufacturer: string | null;
  package: string | null;
  stockByRegion: Array<{ region: string; stock: number; supplierCount: number }>;
  bestPrice: { unitPrice: number; currency: string; supplier: string } | null;
  marketingStatus: string | null;
}

export function moneyLabel(price: { unitPrice: number; currency: string } | null): string | null {
  if (!price) return null;
  const symbol = price.currency === "GBP" ? "£" : price.currency === "INR" ? "₹" : price.currency === "USD" ? "$" : "";
  return symbol ? `${symbol}${price.unitPrice.toFixed(2)}` : `${price.unitPrice.toFixed(2)} ${price.currency}`;
}

/**
 * One MPN candidate: name, tracked/unverified badge, rationale, and real catalog data if it's
 * tracked. Used both as a selectable option (the guided BOM wizard picking one part per
 * category) and as a plain informational card (the alternative-part finder, which never lets
 * you "select" a substitute - only look at it). `footer` carries whatever call-site-specific
 * content goes under the data strip - a verify-later note, a resolve action, a tradeoff line.
 */
export function CandidateOptionTile({
  mpn,
  rationale,
  entry,
  unverified,
  selectable,
  selected,
  onSelect,
  footer,
}: {
  mpn: string;
  rationale: string;
  entry?: ClientCatalogEntry;
  unverified?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  footer?: ReactNode;
}) {
  const price = entry ? moneyLabel(entry.bestPrice) : null;
  const stock = entry?.stockByRegion[0];

  const className = `w-full rounded-lg border p-3 text-left transition-colors ${
    selectable ? (selected ? "border-primary bg-primary/[0.04]" : "hover:border-foreground/20") : ""
  }`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-semibold">{mpn}</p>
            {unverified ? (
              <Badge variant="secondary" className="text-[9px]">
                not yet tracked
              </Badge>
            ) : (
              <Badge variant="outline" className="border-chart-3/25 bg-chart-3/10 text-[9px] text-chart-3">
                tracked
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{rationale}</p>
        </div>
        {selectable && (
          <span
            aria-hidden="true"
            className={`mt-0.5 size-3.5 shrink-0 rounded-full border ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`}
          />
        )}
      </div>

      {entry && (
        <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t pt-2.5 text-[11px] text-muted-foreground">
          {stock && (
            <span>
              <span className="font-medium text-foreground">{stock.stock.toLocaleString()}</span> in {stock.region}
            </span>
          )}
          {price && <span>{price}/unit</span>}
          {entry.marketingStatus && <span>{entry.marketingStatus}</span>}
        </div>
      )}

      {footer}
    </>
  );

  if (selectable) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
