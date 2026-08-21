import { Activity, Database, ShieldCheck } from "lucide-react";

import { HeroGlobe } from "@/components/hero-globe";
import { LandingSections } from "@/components/landing-sections";
import { Navigation } from "@/components/navigation";
import { getPlatformStats } from "@/db/analytics";

const signals = [
  { label: "Monitor changes", icon: Activity },
  { label: "Detect risks early", icon: Database },
  { label: "Act with confidence", icon: ShieldCheck },
];

// Real platform stats, refreshed periodically rather than baked in at build time forever.
export const revalidate = 300;

export default async function Home() {
  const stats = await getPlatformStats();

  return (
    <main className="relative block w-full min-h-screen overflow-visible bg-white text-black dark:bg-black dark:text-white">
      <Navigation />

      <section
        id="product"
        className="relative isolate min-h-screen overflow-hidden bg-white px-6 pt-[clamp(104px,14vh,145px)] scroll-mt-24 dark:bg-black"
      >
        <div className="relative z-10 mx-auto flex max-w-[1180px] flex-col items-center text-center">
          <div className="flex flex-col items-center">
            <p className="text-[15px] font-medium tracking-[-0.018em] text-black/64 dark:text-white/64 sm:text-base">
              Self-healing supply-chain intelligence
            </p>
            <div className="mt-4 flex items-center sm:mt-5" aria-hidden="true">
              <span className="h-px w-[68px] bg-black/[0.06] dark:bg-white/[0.1] sm:w-[84px]" />
              <span className="h-2 w-2 rounded-full bg-black/28 dark:bg-white/28" />
              <span className="h-px w-[68px] bg-black/[0.06] dark:bg-white/[0.1] sm:w-[84px]" />
            </div>
          </div>

          <h1 className="mt-[clamp(24px,3.5vh,36px)] font-display text-[clamp(3.35rem,5vw,5.55rem)] leading-[0.94] tracking-[-0.045em] text-black dark:text-white">
            <span className="block whitespace-normal sm:whitespace-nowrap">
              Know if your next production
            </span>
            <span className="mt-1 block">run is still buildable.</span>
          </h1>

          <div className="mt-[clamp(22px,3.2vh,34px)] flex w-full max-w-[420px] flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row sm:gap-4">
            <a
              href="/dashboard"
              className="inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-black px-7 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-px hover:bg-black/88 dark:bg-white dark:text-black dark:hover:bg-white/88 sm:w-auto"
            >
              Get started
            </a>
            <a
              href="#demo"
              className="inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-black/[0.12] px-7 text-sm font-medium text-black/76 transition-colors duration-200 hover:border-black/24 hover:text-black dark:border-white/[0.16] dark:text-white/76 dark:hover:border-white/32 dark:hover:text-white sm:w-auto"
            >
              Try it now
            </a>
          </div>

          <div className="mt-[clamp(26px,4vh,40px)] flex w-full max-w-[820px] flex-col items-center justify-center gap-5 sm:flex-row sm:gap-0">
            {signals.map(({ label, icon: Icon }, index) => (
              <div key={label} className="flex items-center">
                {index > 0 && (
                  <span className="mx-8 hidden h-1 w-1 rounded-full bg-black/16 dark:bg-white/16 sm:block lg:mx-11" />
                )}
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-black/[0.07] bg-white shadow-[0_7px_26px_rgba(0,0,0,0.035)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                    <Icon className="h-[18px] w-[18px] stroke-[1.5] text-black/72 dark:text-white/72" />
                  </span>
                  <span className="text-sm font-medium tracking-[-0.014em] text-black/70 dark:text-white/70 sm:text-[15px]">
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-[clamp(24px,3.5vh,42px)] flex max-w-full flex-wrap items-center justify-center gap-y-3 text-[11px] font-medium tracking-[-0.012em] text-black/64 dark:text-white/64 sm:text-xs">
            <div className="flex items-center gap-2.5 px-4">
              <span className="h-1.5 w-1.5 rounded-full border border-black/55 dark:border-white/55" />
              <span>LIVE</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 dark:bg-white/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <Activity className="h-4 w-4 stroke-[1.35]" />
              <span>{stats.collectors} collector{stats.collectors === 1 ? "" : "s"} self-healing</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 dark:bg-white/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <Database className="h-4 w-4 stroke-[1.35]" />
              <span>Parts tracked: {stats.trackedMpns.toLocaleString()}</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 dark:bg-white/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <ShieldCheck className="h-4 w-4 stroke-[1.35]" />
              <span>Incidents caught: {stats.incidentsCaught.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <HeroGlobe />
      </section>

      <div className="relative z-10 block w-full">
        <LandingSections />
      </div>
    </main>
  );
}
