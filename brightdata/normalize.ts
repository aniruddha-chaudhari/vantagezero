import { MissingRequiredField, PartIdentityMismatch, SchemaValidationFailed, SourceUnsupported } from "@/domain/errors";
import type { DistributorObservationInput, ManufacturerObservationInput } from "@/domain/schemas";

/**
 * Deliberately narrower than the full Drizzle source_targets row: normalization only ever
 * needs these four fields, and keeping the type this small means the heal loop (which only
 * has this shape from a JSON API response, not a live DB row) can call the same normalizers
 * ingestion.ts uses, with no casting.
 */
export interface NormalizationTarget {
  mpn: string;
  sourceName: string;
  sourceUrl: string;
  region: string | null;
}

/**
 * Maps one collector's raw output shape into the canonical DistributorObservationInput
 * before Zod validation. Each distributor represents stock differently (RS returns an
 * "in_stock_quantity" integer directly; other sources have shown text statuses like
 * "In Stock" elsewhere) - this is the only place that ambiguity is allowed to live.
 */
export function normalizeDistributorRaw(raw: unknown, target: NormalizationTarget): unknown {
  if (target.sourceName === "RS Online") {
    return normalizeRsOnline(raw, target);
  }
  if (target.sourceName === "element14") {
    return normalizeElement14(raw, target);
  }
  if (target.sourceName === "DigiKey") {
    return normalizeDigikey(raw, target);
  }
  if (target.sourceName === "LCSC") {
    return normalizeLcsc(raw, target);
  }
  throw new SourceUnsupported(`No normalizer registered for source "${target.sourceName}"`);
}

/** Maps a manufacturer collector's raw output into the canonical ManufacturerObservationInput. */
export function normalizeManufacturerRaw(raw: unknown, target: NormalizationTarget): unknown {
  if (target.sourceName === "STMicroelectronics") {
    return normalizeSt(raw, target);
  }
  throw new SourceUnsupported(`No normalizer registered for source "${target.sourceName}"`);
}

function firstRow(raw: unknown): Record<string, unknown> {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") {
    throw new SchemaValidationFailed("Collector output was not an object or a non-empty array of objects");
  }
  return row as Record<string, unknown>;
}

/** "1 - 9" -> 1, "10 - 24" -> 10, "250 +" -> 250, "1,000 +" -> 1000 (comma stripped first,
 * since a bare \d+ match would otherwise stop at the comma and return 1). */
function parseMinQtyFromRange(range: string): number {
  const match = range.replace(/,/g, "").match(/\d+/);
  if (!match) throw new SchemaValidationFailed(`Could not parse a minimum quantity from price-break range "${range}"`);
  return Number(match[0]);
}

/**
 * Actual RS Online PDP collector output (c_msy7solmrxow00enh), captured 2026-08-18:
 * { mpn, manufacturer, rs_stock_number, in_stock_quantity, lead_time_text, currency,
 *   unit_price_qty_1: {value, currency, symbol},
 *   bulk_price_breaks: [{ quantity: "1 - 9", unit_price: {value, currency, symbol} }],
 *   package, product_image_url, input }
 * `currency` at the top level is a symbol ("£"); the ISO code lives under unit_price_qty_1.
 * `bulk_price_breaks[].quantity` is a range string, not a bare integer.
 */
function normalizeRsOnline(raw: unknown, target: NormalizationTarget): DistributorObservationInput {
  const row = firstRow(raw);

  // unit_price_qty_1 is only present when RS shows a qty-1 tier - a part whose cheapest
  // bulk tier starts at "2 - 8" (no single-unit price) legitimately omits it. Fall back
  // to the first bulk price break's currency, which is always present when priced at all.
  const unitPriceQty1 = row.unit_price_qty_1 as { value?: number; currency?: string } | undefined;
  const rawPriceBreaks = Array.isArray(row.bulk_price_breaks)
    ? (row.bulk_price_breaks as Array<Record<string, unknown>>)
    : [];
  const firstBreakPrice = rawPriceBreaks[0]?.unit_price as { currency?: string } | undefined;
  const currency = unitPriceQty1?.currency ?? firstBreakPrice?.currency;

  const priceBreaks = rawPriceBreaks.map((pb) => {
    const priceObj = pb.unit_price as { value?: number } | undefined;
    if (priceObj?.value == null) {
      throw new MissingRequiredField("Price break is missing unit_price.value");
    }
    return {
      minQty: parseMinQtyFromRange(String(pb.quantity ?? "")),
      unitPrice: Number(priceObj.value),
    };
  });

  if (row.mpn == null || row.in_stock_quantity == null || currency == null) {
    throw new MissingRequiredField("RS Online output is missing a required field (mpn, in_stock_quantity, or currency)");
  }

  return {
    mpn: String(row.mpn),
    manufacturer: (row.manufacturer as string) ?? null,
    sourceType: "distributor",
    supplier: "RS Online",
    supplierSku: (row.rs_stock_number as string) ?? null,
    sourceUrl: target.sourceUrl,
    region: target.region,
    imageUrl: (row.product_image_url as string) ?? null,
    stock: Number(row.in_stock_quantity),
    incoming: null,
    incomingDate: null,
    availabilityText: null,
    deliveryText: (row.lead_time_text as string) ?? null,
    leadTimeWeeks: null,
    currency,
    minimumOrderQty: 1,
    orderMultiple: 1,
    priceBreaks,
    package: (row.package as string) ?? null,
    technical: undefined,
  };
}

/**
 * Actual element14 PDP collector output (c_msyu5nup1i1bjgowvk), captured 2026-08-18:
 * { manufacturer_part_number, manufacturer, order_code, in_stock_quantity, incoming_quantity,
 *   manufacturer_lead_time: "32 weeks 32 weeks" (duplicated text - extract the leading number),
 *   currency (already ISO here, unlike RS), unit_price_qty_1: {value, currency, symbol},
 *   price_breaks: [{ quantity: "1+", unit_price: {...} }], package, product_image_url, input }
 * `price_breaks[].quantity` uses a "N+" format rather than RS's "N - M" range, but the same
 * "first number in the string" parse works for both.
 */
function normalizeElement14(raw: unknown, target: NormalizationTarget): DistributorObservationInput {
  const row = firstRow(raw);

  const priceBreaks = Array.isArray(row.price_breaks)
    ? (row.price_breaks as Array<Record<string, unknown>>).map((pb) => {
        const priceObj = pb.unit_price as { value?: number } | undefined;
        if (priceObj?.value == null) {
          throw new MissingRequiredField("Price break is missing unit_price.value");
        }
        return {
          minQty: parseMinQtyFromRange(String(pb.quantity ?? "")),
          unitPrice: Number(priceObj.value),
        };
      })
    : [];

  if (row.manufacturer_part_number == null || row.in_stock_quantity == null || row.currency == null) {
    throw new MissingRequiredField(
      "element14 output is missing a required field (manufacturer_part_number, in_stock_quantity, or currency)",
    );
  }

  const leadTimeMatch =
    typeof row.manufacturer_lead_time === "string" ? row.manufacturer_lead_time.match(/\d+/) : null;

  return {
    mpn: String(row.manufacturer_part_number),
    manufacturer: (row.manufacturer as string) ?? null,
    sourceType: "distributor",
    supplier: "element14",
    supplierSku: (row.order_code as string) ?? null,
    sourceUrl: target.sourceUrl,
    region: target.region,
    imageUrl: (row.product_image_url as string) ?? null,
    stock: Number(row.in_stock_quantity),
    incoming: row.incoming_quantity != null ? Number(row.incoming_quantity) : null,
    incomingDate: null,
    availabilityText: null,
    deliveryText: (row.manufacturer_lead_time as string) ?? null,
    leadTimeWeeks: leadTimeMatch ? Number(leadTimeMatch[0]) : null,
    currency: String(row.currency),
    minimumOrderQty: 1,
    orderMultiple: 1,
    priceBreaks,
    package: (row.package as string) ?? null,
    technical: undefined,
  };
}

/**
 * Actual DigiKey India PDP collector output (c_mt1cydk063bbxlpux), captured 2026-08-20:
 * { mpn, in_stock_quantity, currency ("INR", already ISO), price_breaks: [{ minQty,
 *   unitPrice: {value, currency, symbol} }], manufacturer_lead_time_weeks, order_multiple?,
 *   minimum_order_quantity?, product_image_url, input }
 * Unlike RS/element14, `price_breaks[].minQty` is already a bare number - no range-string
 * parsing needed. `order_multiple`/`minimum_order_quantity` are only present on parts whose
 * page renders a "Manufacturer Standard Package" row (e.g. reel/tube quantities); DigiKey
 * otherwise sells in any quantity above 1, so both default to 1 - the same convention RS
 * and element14 use, which don't expose either field at all.
 */
function normalizeDigikey(raw: unknown, target: NormalizationTarget): DistributorObservationInput {
  const row = firstRow(raw);

  const priceBreaks = Array.isArray(row.price_breaks)
    ? (row.price_breaks as Array<Record<string, unknown>>).map((pb) => {
        const priceObj = pb.unitPrice as { value?: number } | undefined;
        if (priceObj?.value == null) {
          throw new MissingRequiredField("Price break is missing unitPrice.value");
        }
        if (typeof pb.minQty !== "number") {
          throw new MissingRequiredField("Price break is missing a numeric minQty");
        }
        return { minQty: pb.minQty, unitPrice: Number(priceObj.value) };
      })
    : [];

  if (row.mpn == null || row.in_stock_quantity == null || row.currency == null) {
    throw new MissingRequiredField("DigiKey output is missing a required field (mpn, in_stock_quantity, or currency)");
  }

  return {
    mpn: String(row.mpn),
    manufacturer: null,
    sourceType: "distributor",
    supplier: "DigiKey",
    supplierSku: null,
    sourceUrl: target.sourceUrl,
    region: target.region,
    imageUrl: (row.product_image_url as string) ?? null,
    stock: Number(row.in_stock_quantity),
    incoming: null,
    incomingDate: null,
    availabilityText: null,
    deliveryText: null,
    leadTimeWeeks:
      typeof row.manufacturer_lead_time_weeks === "number" ? row.manufacturer_lead_time_weeks : null,
    currency: String(row.currency),
    minimumOrderQty: typeof row.minimum_order_quantity === "number" ? row.minimum_order_quantity : 1,
    orderMultiple: typeof row.order_multiple === "number" ? row.order_multiple : 1,
    priceBreaks,
    package: null,
    technical: undefined,
  };
}

/**
 * Actual LCSC PDP collector output (c_mt44s8op4nh52dumy), captured 2026-08-22 against
 * https://www.lcsc.com/product-detail/C8734.html: { mpn, manufacturer, lcsc_part_number,
 * in_stock_quantity, package, minimum_order_quantity, order_multiple, currency (already ISO,
 * "USD" - LCSC prices internationally in USD despite being a China-based distributor),
 * price_breaks: [{ min_qty: "1 +" | "1,000 +", unit_price: {value, currency, symbol} }],
 * product_image_url, input }. Cleanest of the four collectors so far: minimum_order_quantity
 * and order_multiple are always present (unlike DigiKey, which only renders them for
 * reel/tube-packaged parts), so no 1-as-default fallback is needed here.
 */
function normalizeLcsc(raw: unknown, target: NormalizationTarget): DistributorObservationInput {
  const row = firstRow(raw);

  if (row.mpn == null || row.in_stock_quantity == null || row.currency == null) {
    throw new MissingRequiredField("LCSC output is missing a required field (mpn, in_stock_quantity, or currency)");
  }

  const priceBreaks = Array.isArray(row.price_breaks)
    ? (row.price_breaks as Array<Record<string, unknown>>).map((pb) => {
        const priceObj = pb.unit_price as { value?: number } | undefined;
        if (priceObj?.value == null) {
          throw new MissingRequiredField("Price break is missing unit_price.value");
        }
        return { minQty: parseMinQtyFromRange(String(pb.min_qty ?? "")), unitPrice: Number(priceObj.value) };
      })
    : [];

  return {
    mpn: String(row.mpn),
    manufacturer: (row.manufacturer as string) ?? null,
    sourceType: "distributor",
    supplier: "LCSC",
    supplierSku: (row.lcsc_part_number as string) ?? null,
    sourceUrl: target.sourceUrl,
    region: target.region,
    imageUrl: (row.product_image_url as string) ?? null,
    stock: Number(row.in_stock_quantity),
    incoming: null,
    incomingDate: null,
    availabilityText: null,
    deliveryText: null,
    leadTimeWeeks: null,
    currency: String(row.currency),
    minimumOrderQty: typeof row.minimum_order_quantity === "number" ? row.minimum_order_quantity : 1,
    orderMultiple: typeof row.order_multiple === "number" ? row.order_multiple : 1,
    priceBreaks,
    package: (row.package as string) ?? null,
    technical: undefined,
  };
}

const KNOWN_LIFECYCLE_STATUSES = ["Active", "NRND", "Obsolete", "Last Time Buy", "Preview"];

/**
 * Actual ST collector output (c_msyu5pk9lpeacevev), captured 2026-08-18: no top-level MPN or
 * clean lifecycle fields. `product_status` is a garbled, repeated string that nonetheless
 * reliably contains a real lifecycle keyword ("Active") and the production-status sentence.
 * A heal was attempted (see brightdata/examples/st-lifecycle-heal.json) and its *preview*
 * cleanly returned marketing_status/production_status/longevity fields - but the approved
 * production run still returns the old garbled shape, so those clean preview-only values are
 * NOT used here (using them would mean displaying a number that was never actually re-observed).
 * Longevity fields stay null until the collector genuinely extracts them on a real run.
 * Identity is verified against `part_numbers[].part_number`, since the page covers a whole
 * family (STM32F407VG) rather than one exact orderable part.
 */
function normalizeSt(raw: unknown, target: NormalizationTarget): ManufacturerObservationInput {
  const row = firstRow(raw);

  const partNumbers = Array.isArray(row.part_numbers)
    ? (row.part_numbers as Array<Record<string, unknown>>)
    : [];
  const matchingPart = partNumbers.find(
    (p) => typeof p.part_number === "string" && p.part_number.toUpperCase() === target.mpn.toUpperCase(),
  );
  if (!matchingPart) {
    throw new PartIdentityMismatch(`ST page part_numbers list does not include "${target.mpn}"`, {
      expected: target.mpn,
      available: partNumbers.map((p) => p.part_number),
    });
  }

  const statusText = String(row.product_status ?? "");
  const marketingStatus = KNOWN_LIFECYCLE_STATUSES.find((status) => statusText.includes(status));
  if (!marketingStatus) {
    throw new MissingRequiredField(
      `Could not find a known lifecycle status in ST product_status text: "${statusText.slice(0, 200)}"`,
    );
  }
  const productionStatusMatch = statusText.match(/Product is in volume production\.?/i);

  return {
    mpn: target.mpn,
    sourceType: "manufacturer",
    sourceUrl: target.sourceUrl,
    marketingStatus,
    productionStatus: productionStatusMatch ? productionStatusMatch[0] : null,
    longevityYears: null,
    longevityStartDate: null,
    package: (matchingPart.package as string) ?? null,
    grade: null,
  };
}
