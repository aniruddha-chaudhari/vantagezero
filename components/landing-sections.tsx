const bomRows = [
  ["STM32H743VIT6", "1,000", "1,420", "1.42×", "6 wks", "Active", "Healthy"],
  ["TPS7A4700RGWR", "2,000", "1,640", "0.82×", "18 wks", "Active", "Shortfall"],
  ["USB4105-GF-A", "1,000", "4,280", "4.28×", "4 wks", "Active", "Healthy"],
  ["W25Q128JVSIQ", "1,000", "3,960", "3.96×", "7 wks", "NRND", "Watch"],
] as const;

const workflow = [
  [
    "01",
    "Observe source truth",
    "Watch distributor and manufacturer pages for stock, price, lead time, lifecycle, and region-specific availability.",
  ],
  [
    "02",
    "Repair extraction drift",
    "When a page structure changes, diagnose the extraction failure and verify a repaired path before bad data reaches the BOM.",
  ],
  [
    "03",
    "Recompute the run",
    "When the supply signal changes, recalculate the BOM and surface the exact production impact.",
  ],
] as const;

const events = [
  ["09:41:08", "Source structure changed", "Distributor product page markup shifted"],
  ["09:41:11", "Source degraded", "Stock selector returned no verified value"],
  ["09:41:29", "Repair verified", "New extraction path passed evidence checks"],
  ["09:42:03", "Supply signal changed", "Lead time moved from 8 to 18 weeks"],
  ["09:42:04", "Production run recalculated", "Buildable quantity revised to 820 units"],
] as const;

const principles = [
  ["Decision → why → evidence", "Every conclusion stays traceable to the observation and source that produced it."],
  ["Region-aware inventory", "Inventory from different regions stays separate so global stock does not create fake buildability."],
  ["Deterministic scoring", "Coverage, lead-time pressure, lifecycle status, and shortfall drive explicit risk."],
  ["History that explains change", "Stock, lead time, lifecycle, source health, and business events remain visible as one timeline."],
] as const;

function StatusBadge({ label }: { label: string }) {
  const style =
    label === "Shortfall"
      ? "border-[#b54236]/20 bg-[#b54236]/[0.055] text-[#9f3028]"
      : label === "Watch"
        ? "border-[#9a6b16]/20 bg-[#9a6b16]/[0.055] text-[#79510e]"
        : "border-[#2d6b4a]/18 bg-[#2d6b4a]/[0.05] text-[#245a3e]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  );
}

export function LandingSections() {
  return (
    <>
      <section className="border-t border-black/[0.06] bg-[#f8f8f6] px-6 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto grid max-w-[1320px] gap-14 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/58">Buildability layer</p>
            <h2 className="mt-6 max-w-[560px] font-display text-[clamp(3rem,5vw,5.6rem)] leading-[0.92] tracking-[-0.05em]">
              The answer is not “stock changed.”
            </h2>
            <p className="mt-7 max-w-[470px] text-base leading-7 text-black/64 sm:text-lg sm:leading-8">
              The answer is whether that change blocks the production run, by how much, and which part is responsible.
            </p>

            <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-medium text-black/66">
              <span className="h-2 w-2 rounded-full bg-black/55" />
              Requested run: 1,000 units
            </div>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-black/[0.08] bg-white shadow-[0_28px_80px_rgba(0,0,0,0.055)]">
            <div className="flex flex-col gap-8 border-b border-black/[0.06] px-6 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55">Buildable quantity</p>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="font-display text-6xl tracking-[-0.055em] sm:text-7xl">820</span>
                  <span className="text-sm font-medium text-black/58">/ 1,000 units</span>
                </div>
              </div>
              <div className="max-w-[260px] sm:text-right">
                <StatusBadge label="Watch" />
                <p className="mt-3 text-sm leading-6 text-black/64">
                  Limited by <span className="font-semibold text-black/76">TPS7A4700RGWR</span> stock coverage.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-black/[0.055] text-[10px] font-semibold uppercase tracking-[0.11em] text-black/55">
                    <th className="px-6 py-4 sm:px-8">Part</th>
                    <th className="px-4 py-4">Need</th>
                    <th className="px-4 py-4">Observed stock</th>
                    <th className="px-4 py-4">Coverage</th>
                    <th className="px-4 py-4">Lead time</th>
                    <th className="px-4 py-4">Lifecycle</th>
                    <th className="px-4 py-4 pr-6 sm:pr-8">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {bomRows.map(([part, need, stock, coverage, lead, lifecycle, risk]) => (
                    <tr key={part} className="border-b border-black/[0.045] last:border-b-0">
                      <td className="px-6 py-5 font-mono text-[12px] font-medium text-black/76 sm:px-8">{part}</td>
                      <td className="px-4 py-5 text-xs text-black/62">{need}</td>
                      <td className="px-4 py-5 text-xs font-medium text-black/68">{stock}</td>
                      <td className="px-4 py-5 text-xs font-medium text-black/68">{coverage}</td>
                      <td className="px-4 py-5 text-xs text-black/62">{lead}</td>
                      <td className="px-4 py-5 text-xs text-black/62">{lifecycle}</td>
                      <td className="px-4 py-5 pr-6 sm:pr-8"><StatusBadge label={risk} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 border-t border-black/[0.055] bg-black/[0.012] px-6 py-5 text-xs text-black/60 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <span>Last recomputed 18 seconds ago</span>
              <span className="font-medium text-black/64">Blocking component →</span>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-t border-black/[0.06] bg-white px-6 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-[1320px]">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/58">How it works</p>
              <h2 className="mt-6 max-w-[650px] font-display text-[clamp(3.1rem,5.5vw,6.1rem)] leading-[0.9] tracking-[-0.055em]">
                One loop. Two kinds of change.
              </h2>
            </div>
            <p className="max-w-[580px] text-base leading-7 text-black/64 lg:justify-self-end lg:text-lg lg:leading-8">
              Structural website changes trigger source repair. Semantic supply-chain changes trigger business action. Vantage keeps those problems separate.
            </p>
          </div>

          <div className="mt-16 grid border-y border-black/[0.07] lg:grid-cols-3 lg:divide-x lg:divide-black/[0.07]">
            {workflow.map(([number, title, body], index) => (
              <div key={number} className={`py-10 lg:px-10 lg:py-12 ${index < workflow.length - 1 ? "border-b border-black/[0.07] lg:border-b-0" : ""}`}>
                <span className="font-mono text-[11px] font-medium text-black/55">{number}</span>
                <h3 className="mt-12 text-[22px] font-semibold tracking-[-0.035em] text-black/82">{title}</h3>
                <p className="mt-4 max-w-[340px] text-sm leading-6 text-black/62">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-black/[0.065] bg-[#f8f8f6] p-6 sm:p-7">
              <p className="text-sm font-semibold text-black/72">Structural change</p>
              <p className="mt-3 text-sm leading-6 text-black/62">DOM moved, label renamed, page template changed → diagnose extraction → verify repair.</p>
            </div>
            <div className="rounded-2xl border border-black/[0.065] bg-[#f8f8f6] p-6 sm:p-7">
              <p className="text-sm font-semibold text-black/72">Semantic change</p>
              <p className="mt-3 text-sm leading-6 text-black/62">Stock fell, lead time moved, lifecycle changed → recompute BOM → surface production impact.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-24 border-t border-black/[0.06] bg-[#f8f8f6] px-6 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-[1320px]">
          <div className="max-w-[800px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/58">Live operating view</p>
            <h2 className="mt-6 font-display text-[clamp(3.1rem,5.5vw,6rem)] leading-[0.91] tracking-[-0.055em]">
              See the decision before you inspect the scrape.
            </h2>
            <p className="mt-7 max-w-[640px] text-base leading-7 text-black/64 sm:text-lg sm:leading-8">
              Decision ↓ why ↓ evidence ↓ raw source. The production impact stays readable before the extraction details.
            </p>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[22px] border border-black/[0.075] bg-white p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">Event feed</p>
                  <p className="mt-2 text-sm text-black/60">Latest system and supply-chain changes</p>
                </div>
                <span className="flex items-center gap-2 text-[11px] font-medium text-black/60"><span className="h-1.5 w-1.5 rounded-full bg-[#2d6b4a]" />Live</span>
              </div>

              <div className="mt-8">
                {events.map(([time, title, detail], index) => (
                  <div key={`${time}-${title}`} className="grid grid-cols-[56px_16px_1fr] gap-3">
                    <span className="pt-1 font-mono text-[10px] text-black/55">{time}</span>
                    <div className="relative flex justify-center">
                      <span className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full border border-black/25 bg-white" />
                      {index < events.length - 1 && <span className="absolute bottom-0 top-3 w-px bg-black/[0.07]" />}
                    </div>
                    <div className="pb-7">
                      <p className="text-sm font-semibold tracking-[-0.018em] text-black/72">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-black/60">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.045)]">
              <div className="border-b border-black/[0.06] px-6 py-6 sm:px-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-black/78">TPS7A4700RGWR</span>
                      <StatusBadge label="Shortfall" />
                    </div>
                    <p className="mt-2 text-xs text-black/60">Texas Instruments · Linear regulator</p>
                  </div>
                  <span className="text-xs font-medium text-black/60">Updated 18 sec ago</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4">
                {[["Observed stock", "1,640"], ["Need", "2,000"], ["Shortfall", "360"], ["Coverage", "0.82×"]].map(([label, value]) => (
                  <div key={label} className="border-b border-r border-black/[0.055] p-5 last:border-r-0 sm:p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-black/55">{label}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-black/78">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">Observed state</p>
                  <div className="mt-5 space-y-4 text-xs">
                    {[["Lead time", "18 weeks"], ["Lifecycle", "Active"], ["Suppliers", "3 verified"], ["Region", "US inventory"]].map(([label, value]) => (
                      <div key={label} className="flex justify-between border-b border-black/[0.05] pb-3">
                        <span className="text-black/60">{label}</span>
                        <span className="font-medium text-black/68">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">Evidence chain</p>
                  <div className="mt-5 space-y-3">
                    {["Distributor stock verified", "Manufacturer lifecycle verified", "Regional availability separated"].map((item) => (
                      <div key={item} className="rounded-xl border border-black/[0.055] px-4 py-3 text-xs font-medium text-black/60">✓ {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-black/[0.06] bg-white px-6 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-[1320px]">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/58">Built for decisions</p>
              <h2 className="mt-6 max-w-[530px] font-display text-[clamp(3rem,5vw,5.5rem)] leading-[0.92] tracking-[-0.05em]">
                Serious supply-chain intelligence without the black box.
              </h2>
            </div>
            <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {principles.map(([title, body]) => (
                <div key={title} className="border-t border-black/[0.08] pt-6">
                  <h3 className="text-base font-semibold tracking-[-0.025em] text-black/76">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-black/62">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-black/[0.06] bg-black px-6 py-24 text-white sm:py-32 lg:py-36">
        <div className="mx-auto max-w-[1320px] text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/64">Vantage</p>
          <h2 className="mx-auto mt-7 max-w-[1050px] font-display text-[clamp(3.5rem,7vw,7.5rem)] leading-[0.87] tracking-[-0.055em]">
            Know what changed. Know what it means.
          </h2>
          <p className="mx-auto mt-8 max-w-[560px] text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
            Turn volatile distributor pages into a continuously verified answer about whether your next production run is still buildable.
          </p>
          <a href="#product" className="mt-10 inline-flex h-12 items-center rounded-xl bg-white px-7 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5">
            Explore Vantage
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black px-6 py-8 text-white/64">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>Vantage · Self-healing supply-chain intelligence</span>
          <a href="https://github.com/aniruddha-chaudhari/vantage" target="_blank" rel="noreferrer" className="transition-colors hover:text-white">GitHub ↗</a>
        </div>
      </footer>
    </>
  );
}
