import { Activity, Database, ShieldCheck } from "lucide-react";

import { HeroGlobe } from "@/components/hero-globe";
import { LandingSections } from "@/components/landing-sections";
import { Navigation } from "@/components/navigation";

const signals = [
  { label: "Monitor changes", icon: Activity },
  { label: "Detect risks early", icon: Database },
  { label: "Act with confidence", icon: ShieldCheck },
];

export default function Home() {
  return (
    <main className="relative block w-full min-h-screen overflow-visible bg-white text-black">
      <Navigation />

      <section
        id="product"
        className="relative isolate min-h-screen overflow-hidden bg-white px-6 pt-[clamp(104px,14vh,145px)] scroll-mt-24"
      >
        <div className="relative z-10 mx-auto flex max-w-[1180px] flex-col items-center text-center">
          <div className="flex flex-col items-center">
            <p className="text-[15px] font-medium tracking-[-0.018em] text-black/52 sm:text-base">
              Self-healing supply-chain intelligence
            </p>
            <div className="mt-4 flex items-center sm:mt-5" aria-hidden="true">
              <span className="h-px w-[68px] bg-black/[0.06] sm:w-[84px]" />
              <span className="h-2 w-2 rounded-full bg-black/28" />
              <span className="h-px w-[68px] bg-black/[0.06] sm:w-[84px]" />
            </div>
          </div>

          <h1 className="mt-[clamp(24px,3.5vh,36px)] font-display text-[clamp(3.35rem,5vw,5.55rem)] leading-[0.94] tracking-[-0.045em] text-black">
            <span className="block whitespace-normal sm:whitespace-nowrap">
              Know if your next production
            </span>
            <span className="mt-1 block">run is still buildable.</span>
          </h1>

          <div className="mt-[clamp(26px,4vh,40px)] flex w-full max-w-[820px] flex-col items-center justify-center gap-5 sm:flex-row sm:gap-0">
            {signals.map(({ label, icon: Icon }, index) => (
              <div key={label} className="flex items-center">
                {index > 0 && (
                  <span className="mx-8 hidden h-1 w-1 rounded-full bg-black/16 sm:block lg:mx-11" />
                )}
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-black/[0.07] bg-white shadow-[0_7px_26px_rgba(0,0,0,0.035)]">
                    <Icon className="h-[18px] w-[18px] stroke-[1.5] text-black/72" />
                  </span>
                  <span className="text-sm font-medium tracking-[-0.014em] text-black/70 sm:text-[15px]">
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-[clamp(24px,3.5vh,42px)] flex max-w-full flex-wrap items-center justify-center gap-y-3 text-[11px] font-medium tracking-[-0.012em] text-black/54 sm:text-xs">
            <div className="flex items-center gap-2.5 px-4">
              <span className="h-1.5 w-1.5 rounded-full border border-black/55" />
              <span>LIVE</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <Activity className="h-4 w-4 stroke-[1.35]" />
              <span>Sources self-healing</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <Database className="h-4 w-4 stroke-[1.35]" />
              <span>Sources monitored: 1,284</span>
            </div>
            <span className="hidden h-5 w-px bg-black/12 sm:block" />
            <div className="flex items-center gap-2.5 px-4">
              <ShieldCheck className="h-4 w-4 stroke-[1.35]" />
              <span>Buildability signals: 98.7%</span>
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
