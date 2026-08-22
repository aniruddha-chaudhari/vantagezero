import { z } from "zod";

import {
  MissingRequiredField,
  PartIdentityMismatch,
  SchemaValidationFailed,
  SemanticSanityFailed,
  UnsupportedCurrency,
} from "./errors";

/** Currencies Vantage knows how to display and compare. Anything else is an incident. */
export const SUPPORTED_CURRENCIES = ["USD", "GBP", "EUR", "INR"] as const;

/**
 * A price jump beyond this multiple from the prior observation is treated as an
 * extraction bug (e.g. a currency-unit or decimal-point misparse), not a real price
 * change - it opens a scraper incident instead of a business event.
 */
export const PRICE_JUMP_SANITY_MULTIPLE = 10_000;

export const priceBreakSchema = z.object({
  minQty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

/** Canonical, normalized shape - independent of how any one collector's raw output is keyed. */
export const distributorObservationSchema = z.object({
  mpn: z.string().min(1),
  manufacturer: z.string().min(1).nullable(),
  sourceType: z.literal("distributor"),
  supplier: z.string().min(1),
  supplierSku: z.string().nullable(),
  sourceUrl: z.string().url(),
  region: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  stock: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative().nullable(),
  incomingDate: z.string().nullable(),
  availabilityText: z.string().nullable(),
  deliveryText: z.string().nullable(),
  leadTimeWeeks: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  minimumOrderQty: z.number().int().positive(),
  orderMultiple: z.number().int().positive(),
  priceBreaks: z.array(priceBreakSchema),
  package: z.string().nullable(),
  technical: z.record(z.string(), z.unknown()).optional(),
});

export type DistributorObservationInput = z.infer<typeof distributorObservationSchema>;

/** Canonical, normalized manufacturer lifecycle shape. */
export const manufacturerObservationSchema = z.object({
  mpn: z.string().min(1),
  sourceType: z.literal("manufacturer"),
  sourceUrl: z.string().url(),
  marketingStatus: z.string().min(1),
  productionStatus: z.string().nullable(),
  longevityYears: z.number().int().nonnegative().nullable(),
  longevityStartDate: z.string().nullable(),
  package: z.string().nullable(),
  grade: z.string().nullable(),
});

export type ManufacturerObservationInput = z.infer<typeof manufacturerObservationSchema>;

function normalizeMpn(mpn: string): string {
  return mpn.trim().toUpperCase();
}

/**
 * Structural -> identity -> semantic-sanity, in that order. Throws a typed
 * VantageValidationError on the first layer that fails; never coerces a bad
 * field into a number. Callers are expected to open a scraper_incidents row
 * on any throw here and skip writing a component_observations row entirely.
 */
export function validateDistributorObservation(params: {
  raw: unknown;
  expectedMpn: string;
  priorUnitPriceByQty?: Map<number, number>;
}): DistributorObservationInput {
  const parsed = distributorObservationSchema.safeParse(params.raw);
  if (!parsed.success) {
    throw new SchemaValidationFailed("Distributor observation failed structural validation", {
      issues: parsed.error.issues,
    });
  }
  const obs = parsed.data;

  if (normalizeMpn(obs.mpn) !== normalizeMpn(params.expectedMpn)) {
    throw new PartIdentityMismatch(
      `Extracted MPN "${obs.mpn}" does not match requested MPN "${params.expectedMpn}"`,
      { extracted: obs.mpn, expected: params.expectedMpn },
    );
  }

  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(obs.currency)) {
    throw new UnsupportedCurrency(`Currency "${obs.currency}" is not supported`, {
      currency: obs.currency,
    });
  }

  // A distributor saying an item is in stock while returning no purchasable price is an
  // extraction gap, not a valid zero-price observation. Public distributor PDPs expose
  // quantity tiers; without them Vantage cannot cost a build even though it can count it.
  if (obs.stock > 0 && obs.priceBreaks.length === 0) {
    throw new MissingRequiredField(
      `${obs.supplier} output has stock but no price breaks`,
      { stock: obs.stock, currency: obs.currency },
    );
  }

  if (params.priorUnitPriceByQty) {
    for (const pb of obs.priceBreaks) {
      const prior = params.priorUnitPriceByQty.get(pb.minQty);
      if (prior && prior > 0 && pb.unitPrice / prior > PRICE_JUMP_SANITY_MULTIPLE) {
        throw new SemanticSanityFailed(
          `Unit price at qty ${pb.minQty} moved more than ${PRICE_JUMP_SANITY_MULTIPLE}x from the prior observation`,
          { minQty: pb.minQty, prior, current: pb.unitPrice },
        );
      }
    }
  }

  return obs;
}

export function validateManufacturerObservation(params: {
  raw: unknown;
  expectedMpn: string;
}): ManufacturerObservationInput {
  const parsed = manufacturerObservationSchema.safeParse(params.raw);
  if (!parsed.success) {
    throw new SchemaValidationFailed("Manufacturer observation failed structural validation", {
      issues: parsed.error.issues,
    });
  }
  const obs = parsed.data;

  if (normalizeMpn(obs.mpn) !== normalizeMpn(params.expectedMpn)) {
    throw new PartIdentityMismatch(
      `Extracted MPN "${obs.mpn}" does not match requested MPN "${params.expectedMpn}"`,
      { extracted: obs.mpn, expected: params.expectedMpn },
    );
  }

  return obs;
}
