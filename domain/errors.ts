/**
 * A missing/unparseable field must always surface as one of these, never as a
 * numeric default (stock: 0, price: 0, etc). This is what keeps "the source
 * broke" and "the source says zero" from ever being confused downstream.
 */
export abstract class VantageValidationError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The Bright Data collector run itself failed (timeout, 429 exhausted, network). */
export class ScraperRunFailed extends VantageValidationError {
  readonly code = "SCRAPER_RUN_FAILED";
}

/** The raw output didn't match the expected structural shape (Zod parse failure). */
export class SchemaValidationFailed extends VantageValidationError {
  readonly code = "SCHEMA_VALIDATION_FAILED";
}

/** The extracted MPN doesn't match the MPN the source target was registered for. */
export class PartIdentityMismatch extends VantageValidationError {
  readonly code = "PART_IDENTITY_MISMATCH";
}

/** A field required for a fresh observation was missing from the normalized record. */
export class MissingRequiredField extends VantageValidationError {
  readonly code = "MISSING_REQUIRED_FIELD";
}

/** A numeric field failed semantic sanity (negative stock, absurd price jump, etc). */
export class SemanticSanityFailed extends VantageValidationError {
  readonly code = "SEMANTIC_SANITY_FAILED";
}

/** The source reported a currency Vantage doesn't know how to display/compare. */
export class UnsupportedCurrency extends VantageValidationError {
  readonly code = "UNSUPPORTED_CURRENCY";
}

/** The requested domain isn't one of the collectors Vantage runs today. */
export class SourceUnsupported extends VantageValidationError {
  readonly code = "SOURCE_UNSUPPORTED";
}

/**
 * The current value is older than the freshness window. Not a write-time error -
 * this is raised by read-path code deciding whether to render "stale".
 */
export class StaleObservation extends VantageValidationError {
  readonly code = "STALE_OBSERVATION";
}
