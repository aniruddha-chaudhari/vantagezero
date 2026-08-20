# Vantage

Buildability intelligence for hardware teams: Vantage watches public distributor and
manufacturer pages for component stock, incoming quantity, lead time, price breaks and
lifecycle status, and tells a team how many complete units of their planned build are still
covered. When a supplier page changes shape, the collector heals in place. When supply
actually changes, the number moves — Vantage knows the difference.

## Stack

- Next.js + TypeScript, Tailwind CSS, shadcn/ui
- PostgreSQL (Neon) via Drizzle ORM
- Zod for structural/domain validation
- [Bright Data](https://brightdata.com) Scraper Studio (custom PDP collectors, driven via the
  `bdata` CLI) for all data collection

## Why not a pre-built scraper?

Bright Data ships 800+ pre-built scrapers, but component-distributor product pages (RS
Online, element14/Farnell, STMicroelectronics) are B2B catalogs, not consumer e-commerce —
they aren't in the prebuilt library. The fields this project needs are domain-specific and
wouldn't be covered by a generic product scraper anyway: incoming quantity (vs. in-stock),
manufacturer standard lead time, price breaks at a specific BOM quantity, and manufacturer
lifecycle status (marketing status, production status, longevity commitment). Each of the
three custom collectors in this repo was built with `bdata scraper create` against one exact
product-detail-page URL, verified live on Bright Data's Web Unlocker before any collector was
created (see "Day-1 hard gate" below).

We also considered TME, a similar distributor, but ruled it out deliberately: TME has an
official public API, so "why not just use that?" would have an obvious answer — it wouldn't
demonstrate anything Scraper Studio is for.

## Terminal / app boundary

Vantage's own UI never creates, prompts, or heals a Bright Data collector — that happens from
this terminal (`bdata scraper create` / `heal` / `approve`), the same way a developer would
manage any piece of infrastructure. The app only ever *triggers a run* of an existing
collector (`POST /api/ingest/brightdata`) and *reads* the resulting data. This keeps
"Bright Data collector" and "business data" as two clearly separate concerns.

## Data pipeline

```
bdata scraper create   (this terminal, one-time per source)
        ↓
source_targets row     (mpn, source, url, region, collector_id)
        ↓
POST /api/ingest/brightdata   or   npm run ingest -- <sourceTargetId>
        ↓
runScraper()  →  normalize (per-source field mapping)  →  Zod validation
        ↓                                                        ↓
  structural / identity / semantic-sanity pass          any layer fails
        ↓                                                        ↓
component_observations / lifecycle_observations row     scraper_incidents row opened
   (immutable, insert-only)                              (no observation written - never
                                                            a fabricated zero)
```

A `.github/workflows/collect.yml` cron calls the same endpoint every 6 hours so history
accumulates unattended.

## Sources (region: UK + India, each chosen by a live Day-1 probe, not preference)

| Role | Source | Collector |
|---|---|---|
| Distributor A | RS Online (`uk.rs-online.com`) | `c_msy7solmrxow00enh` |
| Distributor B | element14 / Farnell (`uk.farnell.com`) | `c_msyu5nup1i1bjgowvk` |
| Distributor C | DigiKey India (`www.digikey.in`) | `c_mt1cydk063bbxlpux` |
| Manufacturer | STMicroelectronics (`www.st.com`) | `c_msyu5pk9lpeacevev` |

Stock is never summed across regions or across element14/Newark (both Avnet/Farnell) into one
number — every aggregate is labelled "observed public stock across tracked regional sites."

DigiKey India was added after probing three Indian-distributor candidates live: Mouser India
was blocked outright (`captcha or protection page found` on the Web Unlocker); Robu.in only
renders with a full JS browser session and even then exposes stock as a boolean
"In Stock"/"Out of Stock", never an exact quantity — a hard fail against this project's
`component_observations.stock` being a required exact count, not an availability flag.
DigiKey India cleared the bar: exact stock counts, INR price breaks, and manufacturer lead
time, all via the plain Web Unlocker (no JS rendering needed), and `/en/products/detail/*`
is not robots-disallowed.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the three values below
npm run db:push              # create/update tables on your Postgres instance
npm run dev
```

Required environment variables (`.env.local`, never committed):

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon/Supabase) |
| `BRIGHTDATA_API_KEY` | Passed explicitly to every `bdata` CLI call |
| `INGEST_API_TOKEN` | Bearer token required by `POST /api/ingest/brightdata` and the incidents/observations API (set the same value as a GitHub Actions secret, plus `APP_BASE_URL` pointing at your deployed URL, to enable the cron) |
| `SLACK_WEBHOOK_URL` | Optional. A Slack Incoming Webhook URL - alerting no-ops entirely when unset |

## Current status (Day 2)

Real numbers from the live database, not placeholders:

- 3 custom Scraper Studio collectors (RS Online, element14, STMicroelectronics), all PDP scrapers
- 1 region (UK), chosen by a live Day-1 probe across RS/element14/Newark
- 17 MPNs seeded into the catalog, 9 with at least one live, validated observation across
  MCU, regulator, PHY, memory, transceiver, and connector categories
- 17 distributor observations, 2 manufacturer lifecycle observations stored
- 26 scraper incidents opened automatically during catalog scaling - wrong-variant MPNs
  (e.g. a search matching `LM2596S-ADJ/NOPB` when `LM2596S-ADJ` was requested), a genuinely
  wrong search result, and one real bug in this repo's own RS normalizer (fixed; see
  `brightdata/normalize.ts`) - never a fabricated zero
- 45 collector runs executed
- 1 heal performed on the STMicroelectronics collector (see `brightdata/examples/st-lifecycle-heal.json`):
  the preview came back clean, but the approved production run did not pick up the fix, so the
  ST normalizer works around the original garbled field defensively rather than trusting the
  unused preview

The remaining unresolved catalog MPNs (PMIC, sensor, protection categories, a couple of
MCU/transceiver variants) failed for legitimate reasons already listed above and are left
unresolved rather than forced - re-running `scripts/resolve-catalog.ts` after adding more
candidate URLs will grow the catalog toward the 20-30 target without touching what's already
verified.

## Live MPN resolution: the catalog "floor" and the search "ceiling"

The seeded catalog (17 MPNs) is the floor - it resolves instantly because it's pre-verified.
For anything else, a build's untracked rows ("— not tracked") get a **Search for this part**
action. We planned this as a fourth custom Scraper Studio collector (a "Search" type -
keyword in, listings out), but probing both distributors' actual multi-result search pages
found they're robots-disallowed: RS Online's search path (`/*searchTerm=`) is blocked outright,
and element14's listings page redirects to a path (`/search?st=`) that's also blocked - only
an exact single match silently redirects to an allowed product page. Rather than build a
collector against a disallowed path, live resolution uses Bright Data's Web Search API
instead (`db/catalog.ts`) - the same mechanism already proven at Day 2's catalog-seeding time,
now used live. A judge's pick still goes through the identical identity/shape validation as
every other observation: a wrong candidate (a `/NOPB` or `-T26A` suffix variant, for instance)
is rejected with a clear reason, never silently accepted.

## The heal loop and the four gates (Day 5)

A heal regenerates a collector's extraction logic from a natural-language description of
what broke. The preview always *looks* plausible - the risk is a healed selector that grabbed
the wrong field on the page (stock instead of pin count, stock instead of incoming) while
still returning a perfectly valid-looking number. `domain/gates.ts` runs four checks against
every healed preview before it's trusted:

| Gate | Catches |
|---|---|
| Identity | The heal drifted to a different product on the page |
| Shape | A heal that fixes one field while silently dropping another |
| Continuity | An implausible jump from the last valid value (e.g. stock replaced by pin count) |
| Collision | The healed value exactly equals a different field on the same page (stock === incoming) |

Identity/shape failures auto-reject (unambiguously wrong); continuity/collision failures
escalate to a human, since a plausible-but-wrong value can't be told apart from a real
extreme change by magnitude alone (`domain/gates.test.ts` covers all four scenarios against
the plan's own examples - run with `npm run test:gates`). `brightdata/heal.ts` runs a healed
preview through the same normalize-and-validate pipeline production ingestion uses, then
these gates, so there's one implementation of "is this heal trustworthy," not two.

The read/write API surface for this (`GET /api/incidents/open`, `GET
/api/observations/latest-valid`, `POST /api/incidents/[id]/resolve`) is bearer-token
protected like the ingestion endpoint, and never calls `bdata scraper create/heal` itself -
per the terminal/app boundary above, that orchestration (the actual CI heal loop and the
live rehearsal) is driven from the coding-agent CLI, not from Vantage's own backend. The one
exception is `POST /api/incidents/[id]/approve`: a human approving or rejecting an
already-escalated incident from the **Source health** screen (`/dashboard/sources`) - acting
on a decision, not authoring a scraper.

## Limitations

Vantage does not guarantee: inventory is still available when a PO is placed; distributor
stock is globally allocatable; lead-time text equals a delivery date; two distributors
represent the whole market; production ships on component availability alone. Buildable-unit
math is a simple floor division and does not account for minimum order quantity or order
multiple, though both are captured. Component images are displayed from the source page and
not rehosted.

**Known limitation:** the DigiKey India collector (`c_mt1cydk063bbxlpux`) does not reliably
extract price breaks on every part page - it returned a full price-break table for
LM2596S-ADJ/NOPB but an empty one for STM32F407VGT6, even though that page does have a price
table (verified manually). Stock, currency, and lead time are unaffected and extract
correctly on both. The component detail page handles this gracefully (an empty price-break
array renders as "—" / "No price break data observed yet", never a wrong number), so this is
a coverage gap, not a correctness bug. Left unresolved for now - a heal pass on this
collector would be the fix.
