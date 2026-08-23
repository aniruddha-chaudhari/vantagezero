# Vantage

**Live app: [vantagezero.vercel.app](https://vantagezero.vercel.app)**

A hardware team commits to 500 units. Vantage answers the question that decides whether that
date holds: **how many can we actually build today, and which part stops us?**

It watches public distributor and manufacturer pages for stock, incoming quantity, lead time,
price breaks and lifecycle status.

When a supplier page changes *shape*, the collector heals in place. When supply *actually*
changes, the number moves. Vantage knows the difference.

| | |
|---|---|
| **Live app** | https://vantagezero.vercel.app |
| **Collectors** | 5 custom Scraper Studio collectors, 3 regions (UK, India, China) |
| **Example output** | [jump ↓](#example-structured-output) — one real capture per source |
| **Self-healing** | [jump ↓](#the-heal-loop-and-the-four-gates) — four gates, three outcomes |

## Architecture

![Vantage architecture](docs/vantage-architecture-with-suppliers.png)

Five supplier pages → Bright Data collectors → per-source normalize + Zod validate →
PostgreSQL → dashboard.

The self-healing gates feed back into **both** the scrapers and the validation step, and
resolve to one of three outcomes: **approve, reject, or escalate.**

### Demo video

[![Watch the demo](https://img.youtube.com/vi/BlsxOLZN47E/maxresdefault.jpg?refresh=1)](https://www.youtube.com/watch?v=BlsxOLZN47E)

## Example structured output

Raw collector output (pre-normalization), one file per source, each captured from a real
live run — not hand-written:

| Source | File |
|---|---|
| RS Online | [`brightdata/examples/rs-uk-pdp-run.json`](brightdata/examples/rs-uk-pdp-run.json) |
| element14 | [`brightdata/examples/e14-uk-pdp-run.json`](brightdata/examples/e14-uk-pdp-run.json) |
| DigiKey India | [`brightdata/examples/digikey-in-pdp-run.json`](brightdata/examples/digikey-in-pdp-run.json) |
| LCSC | [`brightdata/examples/lcsc-cn-pdp-run.json`](brightdata/examples/lcsc-cn-pdp-run.json) |
| STMicroelectronics (manufacturer) | [`brightdata/examples/st-lifecycle-pdp-run.json`](brightdata/examples/st-lifecycle-pdp-run.json) |
| A heal in progress | [`brightdata/examples/st-lifecycle-heal.json`](brightdata/examples/st-lifecycle-heal.json) |

### Why four normalizers and not one

The same conceptual field is named and typed differently on every source. This is the whole
argument for custom collectors plus a per-source normalizer, and it's visible directly in the
files above — all four rows below describe *in-stock quantity, price tiers, and lead time*:

| | RS Online | element14 | DigiKey India | LCSC |
|---|---|---|---|---|
| MPN key | `mpn` | `manufacturer_part_number` | `mpn` | `mpn` |
| Price-break array | `bulk_price_breaks` | `price_breaks` | `price_breaks` | `price_breaks` |
| Break quantity | `"1 - 9"` (range) | `"1+"` | `1` (number) | `"1,000 +"` (comma) |
| Break price key | `unit_price.value` | `unit_price.value` | `unitPrice.value` | `unit_price.value` |
| Lead time | `lead_time_text` (prose) | `"32 weeks 32 weeks"` | `52` (number) | absent |
| `currency` | `"£"` (symbol) | `"GBP"` (ISO) | `"INR"` | `"USD"` |
| Incoming qty | absent | `incoming_quantity` | absent | absent |

Note `unitPrice` vs `unit_price`, `"1 - 9"` vs `1`, and a `currency` that is sometimes a symbol
and sometimes an ISO code. element14 even returns its lead time doubled
(`"32 weeks 32 weeks"`). A single generic product scraper cannot reconcile this; each
normalizer in `brightdata/normalize.ts` is the only place that ambiguity is allowed to live,
and every one of them is followed by the same Zod schema.

### Raw → normalized, end to end

Raw output from the LCSC collector (`c_mt44s8op4nh52dumy`) against a live product page:

```json
[
  {
    "mpn": "STM32F103C8T6",
    "manufacturer": "ST",
    "lcsc_part_number": "C8734",
    "in_stock_quantity": 57666,
    "package": "LQFP-48(7x7)",
    "minimum_order_quantity": 1,
    "order_multiple": 1,
    "currency": "USD",
    "price_breaks": [
      { "min_qty": "1 +", "unit_price": { "value": 1.7292, "currency": "USD", "symbol": "$" } },
      { "min_qty": "1,000 +", "unit_price": { "value": 1.0859, "currency": "USD", "symbol": "$" } }
    ],
    "product_image_url": "https://assets.lcsc.com/images/lcsc/900x900/20230221_STMicroelectronics-STM32F103C8T6_C8734_front.jpg",
    "input": { "url": "https://www.lcsc.com/product-detail/C8734.html" }
  }
]
```

Every field name here is source-specific and untrusted until normalized — `normalizeLcsc()`
(`brightdata/normalize.ts`) maps it into the same canonical shape every other source produces.
Abbreviated below (null fields omitted) for readability - this is the actual shape Zod
validates before a row is ever written:

```json
{
  "mpn": "STM32F103C8T6",
  "supplier": "LCSC",
  "region": "China",
  "stock": 57666,
  "currency": "USD",
  "minimumOrderQty": 1,
  "orderMultiple": 1,
  "priceBreaks": [
    { "minQty": 1, "unitPrice": 1.7292 },
    { "minQty": 1000, "unitPrice": 1.0859 }
  ],
  "package": "LQFP-48(7x7)"
}
```

### Self-healing output

A real heal, abridged from
[`brightdata/examples/st-lifecycle-heal.json`](brightdata/examples/st-lifecycle-heal.json).
The ST collector's `product_status` was returning duplicated, garbled text instead of a clean
value, so it was healed in place — **note the `collector_id` is unchanged**, which is the point:
every schedule, trigger and integration referencing that collector keeps working.

```json
{
  "collector_id": "c_msyu5pk9lpeacevev",
  "status": "awaiting_approval",
  "completed_steps": ["planner", "control_preview_runner", "code_fixer",
                      "step_preview_runner", "request_fulfillment_validator", "step_advance"],
  "prompt": "The product_status field returns duplicated repeated text instead of one clean value. Extract Marketing Status (e.g. Active, NRND, Obsolete) and Production Status as two separate short single-value string fields, no repetition. Also extract longevity_commitment_years and longevity_start_date if shown; else null.",
  "next_step": "bdata scraper approve c_msyu5pk9lpeacevev --url https://www.st.com/...",
  "preview_result": [
    {
      "product_name": "STM32F407VG",
      "marketing_status": "Active",
      "production_status": "Product is in volume production.",
      "longevity_commitment_years": 10,
      "longevity_start_date": "01/2026"
    }
  ]
}
```

One garbled field became four clean typed ones. Critically, the heal stops at
`awaiting_approval` rather than shipping — that preview is exactly what the four gates in
`domain/gates.ts` evaluate before anything is trusted (see
"[The heal loop and the four gates](#the-heal-loop-and-the-four-gates)" below). A healed
preview always *looks* plausible; looking plausible is not evidence of being right.

## Screenshots

**Landing page** — live buildability stats up front, not marketing copy alone.

![Landing page](docs/screenshots/landing-hero.png)

**Dashboard overview** — which build needs attention today, on one dial.

![Dashboard overview](docs/screenshots/dashboard-overview.png)

**Build decision** — buildable units, the bottleneck part, and why.

![Build decision](docs/screenshots/build-decision.png)

**Run cost and coverage** — cheapest achievable price per part, coverage and bottleneck ranking charted.

![Build cost and charts](docs/screenshots/build-cost-and-charts.png)

**BOM buildability** — every part in the build, sorted by production impact.

![BOM buildability table](docs/screenshots/bom-buildability.png)

**Source comparison** — regions never combined into one number; each source's stock, price and lead time stays separate.

![Source comparison](docs/screenshots/source-comparison.png)

**Price break curves** — unit price by order quantity, per supplier.

![Price break curves](docs/screenshots/price-break-curves.png)

**Cross-supplier price comparison** — the same part priced across every supplier that carries it, cheapest highlighted.

![Price comparison across suppliers](docs/screenshots/price-comparison.png)

## Sources

Five collectors, three regions. Every source was probed live before it was used — none were
picked by preference.

| Role | Source | Region | Collector |
|---|---|---|---|
| Distributor | RS Online (`uk.rs-online.com`) | UK | `c_msy7solmrxow00enh` |
| Distributor | element14 / Farnell (`uk.farnell.com`) | UK | `c_msyu5nup1i1bjgowvk` |
| Distributor | DigiKey India (`www.digikey.in`) | India | `c_mt1cydk063bbxlpux` |
| Distributor | LCSC (`www.lcsc.com`) | China | `c_mt44s8op4nh52dumy` |
| Manufacturer | STMicroelectronics (`www.st.com`) | — | `c_msyu5pk9lpeacevev` |

**Rejected, with evidence:**

- **Mouser India** — blocked outright (`captcha or protection page found` on the Web Unlocker).
- **Robu.in** — needs a full JS browser session, and even then exposes stock as a boolean
  "In Stock"/"Out of Stock". Never an exact count. Hard fail: `stock` is a required integer here,
  not an availability flag.
- **TME** — has an official public API, so "why not just use that?" would have an obvious
  answer. It wouldn't demonstrate anything Scraper Studio is for.

Stock is never summed across regions. A part in a UK warehouse isn't allocatable to an Indian
build, so every aggregate is labelled "observed public stock across tracked regional sites."

## Data pipeline

```
bdata scraper create   (terminal, one-time per source)
        ↓
source_targets row     (mpn, source, url, region, collector_id)
        ↓
scripts/ingest.ts --all   or   POST /api/ingest/webhook
        ↓
runScraper()  →  normalize (per-source)  →  Zod validation
        ↓                                         ↓
   all layers pass                          any layer fails
        ↓                                         ↓
  observation row                       scraper_incidents row
  (immutable, insert-only)              (no observation written —
                                         never a fabricated zero)
```

Two ways in, one validation path:

- **`.github/workflows/collect.yml`** — cron, every 6 hours, runs the CLI in the Actions runner.
- **`POST /api/ingest/webhook`** — a collector can POST straight to the app, no CLI needed.

Both funnel through the same function, so there's one implementation of "is this payload
trustworthy," not two.

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
| `SLACK_WEBHOOK_URL` | Optional. A Slack Incoming Webhook URL. Posts scraper incidents, heal escalations and critical buildability alerts - unset entirely no-ops all Slack output |
| `SLACK_ACTIVITY_FEED` | Optional. Set to `1` alongside `SLACK_WEBHOOK_URL` to also post one line per *successful* scrape - a live activity feed for a demo or a single-target run. Left unset on the cron and on bulk backfills (the catalog resolver): an `--all` cycle posts one per enabled source target, and Slack rate-limits that burst hard enough to drop the incident alerts underneath it |

## Current status

Real numbers from the live database — regenerate any time with `npx tsx --env-file=.env.local scripts/stats.ts`:

- **5 collectors, 3 regions** (UK, India, China) — 34 distinct MPNs across 77 source targets
- **40 distributor + 2 manufacturer lifecycle observations** stored, 93 collector runs
- **51 scraper incidents** opened automatically instead of writing bad data — never a fabricated zero
- **1 heal performed** (STMicroelectronics) — caught a missing `--auto-save` flag that was letting approved heals resume without persisting; fixed in `approveHeal()` (details in [the heal loop](#the-heal-loop-and-the-four-gates))

Unresolved catalog MPNs stay unresolved rather than forced — logged, not guessed. Untracked
parts get a **Search for this part** action instead (Bright Data's Web Search API, since both
distributors' search pages are robots-disallowed), going through the same identity/shape
validation as the seeded catalog.

## The heal loop and the four gates

A heal regenerates a collector's extraction logic from a description of what broke. **The preview always *looks* plausible** — a healed selector can grab pin count instead of stock and still parse cleanly. So `domain/gates.ts` runs four checks before any heal is trusted:

| Gate | Catches | On failure |
|---|---|---|
| Identity | Heal drifted to a different product | Auto-reject |
| Shape | Fixed one field while dropping another | Auto-reject |
| Continuity | Implausible jump from the last valid value | Escalate to human |
| Collision | Healed value equals a different field on the page | Escalate to human |

Identity/shape are unambiguous, so they auto-reject. Continuity/collision can't be told apart
from a real extreme change by magnitude alone, so they escalate to `/dashboard/sources`.

This keeps the loop **unattended and verified**, unlike Bright Data's own two options
(`heal` waits on a human every time; `heal --auto-approve` ships any diff that parses).
`approve --auto-save` is what makes an `auto_approve` decision durable — without it, approving
resumes the paused job but never persists the healed template, and the collector re-breaks on
the next cron cycle. That's exactly what happened once with the STMicroelectronics collector
before the flag was wired through `approveHeal()`.

Tests: `npm run test:gates` (`domain/gates.test.ts`).

## AI assistance disclosure

Built with an AI coding assistant (Claude Code) for scaffolding, components and boilerplate; sourcing, gate logic, schema design and normalizer mappings were my calls.
