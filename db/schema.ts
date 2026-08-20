import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const criticalityEnum = pgEnum("criticality", [
  "critical",
  "important",
  "optional",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "distributor",
  "manufacturer",
]);

export const runStatusEnum = pgEnum("run_status", [
  "running",
  "success",
  "failed",
]);

export const validationStatusEnum = pgEnum("validation_status", [
  "pending",
  "valid",
  "invalid",
]);

export const eventSeverityEnum = pgEnum("event_severity", [
  "low",
  "warning",
  "medium",
  "high",
  "critical",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "healing",
  "awaiting_approval",
  "rejected",
  "resolved",
]);

export const triggeredByEnum = pgEnum("triggered_by", ["manual", "cron", "judge"]);

export const incidentResolutionEnum = pgEnum("incident_resolution", [
  "auto_approved",
  "auto_rejected",
  "human_approved",
  "human_rejected",
]);

/** A judge-created (or seeded) build. Multi-tenant via anonymous session_id. */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull(),
  name: text("name").notNull(),
  plannedBuildQty: integer("planned_build_qty").notNull(),
  shipDate: date("ship_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One BOM line: a part required by a product. */
export const bomItems = pgTable("bom_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  mpn: text("mpn").notNull(),
  manufacturer: text("manufacturer"),
  qtyPerUnit: integer("qty_per_unit").notNull(),
  criticality: criticalityEnum("criticality").notNull().default("important"),
  /** Only monitored parts feed the buildable-units min(). Unmonitored rows render "- not tracked". */
  monitored: boolean("monitored").notNull().default(true),
});

/**
 * Global registry keyed on (mpn, source_url) - not per-product. Two judges tracking the
 * same MPN share one observation stream instead of paying twice per scrape.
 */
export const sourceTargets = pgTable("source_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  mpn: text("mpn").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  region: text("region"),
  collectorId: text("collector_id"),
  enabled: boolean("enabled").notNull().default(true),
  inCatalog: boolean("in_catalog").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One Bright Data collector invocation against one source target. */
export const scrapeRuns = pgTable("scrape_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceTargetId: uuid("source_target_id")
    .notNull()
    .references(() => sourceTargets.id, { onDelete: "cascade" }),
  brightdataJobId: text("brightdata_job_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: runStatusEnum("status").notNull().default("running"),
  validationStatus: validationStatusEnum("validation_status").notNull().default("pending"),
  errorSummary: text("error_summary"),
  triggeredBy: triggeredByEnum("triggered_by").notNull().default("manual"),
});

/**
 * Immutable distributor observation snapshot. Never updated - every run is a new row.
 * A row here only ever exists for an observation that passed structural, identity, and
 * semantic validation; a failed extraction produces a scraper_incidents row instead,
 * never a row with stock = 0.
 */
export const componentObservations = pgTable("component_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  mpn: text("mpn").notNull(),
  sourceTargetId: uuid("source_target_id")
    .notNull()
    .references(() => sourceTargets.id, { onDelete: "cascade" }),
  scrapeRunId: uuid("scrape_run_id").references(() => scrapeRuns.id, { onDelete: "set null" }),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  stock: integer("stock").notNull(),
  incoming: integer("incoming"),
  incomingDate: date("incoming_date"),
  leadTimeWeeks: integer("lead_time_weeks"),
  currency: text("currency").notNull(),
  minimumOrderQty: integer("minimum_order_qty").notNull().default(1),
  orderMultiple: integer("order_multiple").notNull().default(1),
  imageUrl: text("image_url"),
  rawNormalizedJson: jsonb("raw_normalized_json").notNull(),
});

export const priceBreaks = pgTable("price_breaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id")
    .notNull()
    .references(() => componentObservations.id, { onDelete: "cascade" }),
  minQty: integer("min_qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
});

/** Immutable manufacturer lifecycle observation snapshot. Never updated. */
export const lifecycleObservations = pgTable("lifecycle_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  mpn: text("mpn").notNull(),
  sourceTargetId: uuid("source_target_id")
    .notNull()
    .references(() => sourceTargets.id, { onDelete: "cascade" }),
  scrapeRunId: uuid("scrape_run_id").references(() => scrapeRuns.id, { onDelete: "set null" }),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  marketingStatus: text("marketing_status").notNull(),
  productionStatus: text("production_status"),
  longevityYears: integer("longevity_years"),
  longevityStartDate: date("longevity_start_date"),
  package: text("package"),
  grade: text("grade"),
});

/** Semantic supply-chain change events (stock moves, lead time, lifecycle, price). */
export const businessEvents = pgTable("business_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  mpn: text("mpn"),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  severity: eventSeverityEnum("severity").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Structural/reliability incidents - detect, heal, approve/reject, resolve. */
export const scraperIncidents = pgTable("scraper_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceTargetId: uuid("source_target_id")
    .notNull()
    .references(() => sourceTargets.id, { onDelete: "cascade" }),
  collectorId: text("collector_id"),
  incidentType: text("incident_type").notNull(),
  brokenFields: text("broken_fields").array().notNull().default([]),
  status: incidentStatusEnum("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  healStartedAt: timestamp("heal_started_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  previewJson: jsonb("preview_json"),
  rejectedPreviews: jsonb("rejected_previews").notNull().default([]),
  /** Day-5 heal-loop fields - added now to avoid a second migration later. */
  healPrompt: text("heal_prompt"),
  gateResultsJson: jsonb("gate_results_json"),
  resolution: incidentResolutionEnum("resolution"),
  notes: text("notes"),
});
