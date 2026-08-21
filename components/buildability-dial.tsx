"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

/**
 * The Overview showpiece: every build as one concentric ring on a single instrument.
 *
 * Ring sweep = buildable / planned for that build. The most-constrained build takes the
 * outermost ring so the eye lands on the run that needs attention first. The centre holds
 * the aggregate across the whole workspace, counting up on mount.
 *
 * Deliberately honest, like the rest of the app: a build with no valid observation yet draws
 * a dashed track, never a zero-length or fabricated-full arc, so "awaiting data" never reads
 * as "nothing buildable" or "fully buildable".
 */

export interface DialBuild {
  id: string;
  name: string;
  plannedBuildQty: number;
  /** null = no monitored part has produced a valid observation yet. Never coerce to 0. */
  buildableUnits: number | null;
  score: number | null;
  bottleneckMpn: string | null;
}

/** Rings past this get folded into a "+N more" note - beyond five the dial stops reading. */
const MAX_RINGS = 5;

const CENTER = 230;
const VIEWBOX = 460;
const OUTER_RING_RADIUS = 198;
const RING_STEP = 27;
const RING_WIDTH = 14;
const BEZEL_RADIUS = 216;
const TICK_COUNT = 96;
const SWEEP_DURATION = 16;

function toneFor(score: number | null): { stroke: string; label: string } {
  if (score == null) return { stroke: "var(--muted-foreground)", label: "awaiting data" };
  if (score >= 80) return { stroke: "var(--chart-3)", label: "healthy" };
  if (score >= 50) return { stroke: "var(--chart-4)", label: "watch" };
  return { stroke: "var(--destructive)", label: "at risk" };
}

/**
 * Rounded to 2dp so server and client render identical attribute strings. Without this,
 * Math.cos/Math.sin can differ in their last bit between Node's and the browser's math
 * library, and React's hydration check treats "86.262612308185" vs "86.26261230818497" as a
 * real mismatch even though the SVG renders pixel-identical either way.
 */
function polar(radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.round((CENTER + radius * Math.cos(angle)) * 100) / 100,
    y: Math.round((CENTER + radius * Math.sin(angle)) * 100) / 100,
  };
}

const COUNT_UP_MS = 1100;
// Matches the arcs' cubic-bezier(0.16, 1, 0.3, 1) "ease out" feel without pulling in a curve library.
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function CountUp({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setDisplay(Math.round(value * easeOutExpo(t)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [value, reduceMotion]);

  return <>{display.toLocaleString()}</>;
}

export function BuildabilityDial({ builds }: { builds: DialBuild[] }) {
  const reduceMotion = useReducedMotion();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Worst coverage outermost: the ring you notice first is the run you should look at first.
  const ordered = [...builds].sort((a, b) => {
    const ca = a.buildableUnits == null ? Infinity : a.buildableUnits / a.plannedBuildQty;
    const cb = b.buildableUnits == null ? Infinity : b.buildableUnits / b.plannedBuildQty;
    return ca - cb;
  });

  const shown = ordered.slice(0, MAX_RINGS);
  const hidden = ordered.length - shown.length;

  const withData = builds.filter((b) => b.buildableUnits != null);
  const totalBuildable = withData.reduce((sum, b) => sum + (b.buildableUnits ?? 0), 0);
  const plannedWithData = withData.reduce((sum, b) => sum + b.plannedBuildQty, 0);
  // Clamped the same way each ring's own sweep is - a part can carry far more stock than a
  // run needs, which is real surplus, but "% coverage" reading past 100 looks like a bug.
  const aggregatePct = plannedWithData > 0 ? Math.min(100, Math.round((totalBuildable / plannedWithData) * 100)) : null;
  const awaiting = builds.length - withData.length;

  const rings = shown.map((build, index) => {
    const radius = OUTER_RING_RADIUS - index * RING_STEP;
    const fraction =
      build.buildableUnits == null
        ? null
        : Math.max(0, Math.min(1, build.buildableUnits / build.plannedBuildQty));
    return { build, radius, fraction, tone: toneFor(build.score), order: index };
  });

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card">
      {/* Faint instrument grid behind everything - decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 30% 50%, black 10%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at 30% 50%, black 10%, transparent 72%)",
        }}
      />

      <div className="relative grid gap-8 p-6 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-center lg:gap-10 lg:p-8">
        <div className="relative mx-auto w-full max-w-[440px]">
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={
              aggregatePct != null
                ? `Workspace buildability: ${totalBuildable.toLocaleString()} of ${plannedWithData.toLocaleString()} planned units, ${aggregatePct} percent.`
                : "Workspace buildability: no observations yet."
            }
          >
            <defs>
              <linearGradient id="dial-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0" />
                <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0.09" />
              </linearGradient>
              <radialGradient id="dial-core">
                <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.05" />
                <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <g aria-hidden="true">
              {/* Bezel + tick ring. */}
              <circle cx={CENTER} cy={CENTER} r={BEZEL_RADIUS + 14} fill="none" stroke="var(--border)" strokeWidth="1" />
              <circle cx={CENTER} cy={CENTER} r={BEZEL_RADIUS} fill="none" stroke="var(--border)" strokeWidth="1" />
              {Array.from({ length: TICK_COUNT }, (_, i) => {
                const fraction = i / TICK_COUNT;
                const major = i % 8 === 0;
                const inner = polar(BEZEL_RADIUS + 2, fraction);
                const outer = polar(BEZEL_RADIUS + (major ? 12 : 6), fraction);
                return (
                  <line
                    key={i}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke="var(--foreground)"
                    strokeOpacity={major ? 0.3 : 0.13}
                    strokeWidth={major ? 1.4 : 1}
                    strokeLinecap="round"
                  />
                );
              })}

              {[0, 0.25, 0.5, 0.75].map((fraction) => {
                const a = polar(96, fraction);
                const b = polar(BEZEL_RADIUS - 6, fraction);
                return (
                  <line key={fraction} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--foreground)" strokeOpacity="0.06" strokeWidth="1" />
                );
              })}

              <circle cx={CENTER} cy={CENTER} r={150} fill="url(#dial-core)" />
            </g>

            {!reduceMotion && (
              // A native SMIL animateTransform, not Motion's CSS-based `rotate` - CSS
              // transform-origin on SVG elements depends on transform-box defaults that vary
              // across browsers, so a CSS rotation can pivot around the wrong point on some
              // engines. rotate(angle, cx, cy) always rotates in pure SVG user-space around
              // the exact point given, with no such ambiguity.
              <path
                aria-hidden="true"
                d={`M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - BEZEL_RADIUS} A ${BEZEL_RADIUS} ${BEZEL_RADIUS} 0 0 1 ${
                  polar(BEZEL_RADIUS, 0.16).x
                } ${polar(BEZEL_RADIUS, 0.16).y} Z`}
                fill="url(#dial-sweep)"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 ${CENTER} ${CENTER}`}
                  to={`360 ${CENTER} ${CENTER}`}
                  dur={`${SWEEP_DURATION}s`}
                  repeatCount="indefinite"
                />
              </path>
            )}

            {/* Tracks. */}
            <g fill="none" strokeLinecap="round">
              {rings.map(({ build, radius }) => (
                <circle
                  key={`track-${build.id}`}
                  cx={CENTER}
                  cy={CENTER}
                  r={radius}
                  stroke="var(--foreground)"
                  strokeOpacity="0.07"
                  strokeWidth={RING_WIDTH}
                />
              ))}
            </g>

            {/* Value arcs - motion's `pathLength` handles the dash math for us. */}
            <g fill="none" strokeLinecap="round" transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {rings.map(({ build, radius, fraction, tone, order }) =>
                fraction == null ? (
                  <circle
                    key={`arc-${build.id}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    stroke="var(--muted-foreground)"
                    strokeOpacity="0.35"
                    strokeWidth="1.5"
                    strokeDasharray="2 9"
                  />
                ) : (
                  <motion.circle
                    key={`arc-${build.id}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    stroke={tone.stroke}
                    strokeWidth={hoveredId === build.id ? RING_WIDTH + 4 : RING_WIDTH}
                    strokeOpacity={hoveredId == null || hoveredId === build.id ? 1 : 0.35}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: fraction }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 1, ease: [0.16, 1, 0.3, 1], delay: order * 0.11 }
                    }
                    style={{ transition: "stroke-width 180ms ease, stroke-opacity 180ms ease" }}
                  />
                ),
              )}

              {/* Wider invisible hit-ring so hovering near an arc highlights it too. */}
              {rings.map(({ build, radius, fraction }) =>
                fraction == null ? null : (
                  <circle
                    key={`hit-${build.id}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    stroke="transparent"
                    strokeWidth={RING_WIDTH + 16}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(build.id)}
                    onMouseLeave={() => setHoveredId((id) => (id === build.id ? null : id))}
                  />
                ),
              )}
            </g>

            {/* Arc endpoints - the "needle tip" that makes the reading feel precise. */}
            <g aria-hidden="true">
              {rings.map(({ build, radius, fraction, tone, order }) => {
                if (fraction == null || fraction === 0) return null;
                const p = polar(radius, fraction);
                return (
                  <motion.g
                    key={`tip-${build.id}`}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.6 + order * 0.11 }
                    }
                    style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
                  >
                    <circle cx={p.x} cy={p.y} r={RING_WIDTH / 2 + 3.5} fill="var(--card)" />
                    <circle cx={p.x} cy={p.y} r={4} fill={tone.stroke} />
                  </motion.g>
                );
              })}
            </g>

            {/* Centre readout. */}
            <g textAnchor="middle">
              <circle cx={CENTER} cy={CENTER} r={74} fill="none" stroke="var(--border)" strokeWidth="1" />
              <text
                x={CENTER}
                y={CENTER - 26}
                className="fill-current text-muted-foreground"
                fontSize="10"
                letterSpacing="1.6"
                fontWeight="600"
              >
                BUILDABLE NOW
              </text>
              <text x={CENTER} y={CENTER + 18} className="font-display fill-current" fontSize="46" letterSpacing="-2">
                <CountUp value={totalBuildable} reduceMotion={!!reduceMotion} />
              </text>
              <text x={CENTER} y={CENTER + 40} className="fill-current text-muted-foreground" fontSize="11">
                of {plannedWithData.toLocaleString()} planned
              </text>
              {aggregatePct != null && (
                <text x={CENTER} y={CENTER + 60} className="fill-current text-muted-foreground" fontSize="11" fontWeight="600">
                  {aggregatePct}% coverage
                </text>
              )}
            </g>
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace buildability
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-[-0.035em]">
            {builds.length} build{builds.length === 1 ? "" : "s"} on one dial
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Each ring is one production run - the sweep is how much of it you can build from stock
            observed right now. The outermost ring is the most constrained.
          </p>

          <ul className="mt-6 space-y-px">
            {rings.map(({ build, fraction, tone }) => (
              <li key={build.id}>
                <Link
                  href={`/dashboard/builds/${build.id}`}
                  onMouseEnter={() => setHoveredId(build.id)}
                  onMouseLeave={() => setHoveredId((id) => (id === build.id ? null : id))}
                  className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${
                    hoveredId === build.id ? "bg-secondary" : "hover:bg-secondary"
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tone.stroke }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:underline">{build.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {build.bottleneckMpn ? (
                        <>
                          limited by <span className="font-mono">{build.bottleneckMpn}</span>
                        </>
                      ) : (
                        tone.label
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {fraction == null ? "—" : `${Math.round(fraction * 100)}%`}
                    </span>
                    <span className="block text-[10px] tabular-nums text-muted-foreground">
                      {build.buildableUnits?.toLocaleString() ?? "—"} / {build.plannedBuildQty.toLocaleString()}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {(hidden > 0 || awaiting > 0) && (
            <p className="mt-3 px-2 text-[11px] text-muted-foreground">
              {hidden > 0 && `${hidden} more build${hidden === 1 ? "" : "s"} not shown on the dial`}
              {hidden > 0 && awaiting > 0 && " · "}
              {awaiting > 0 && `${awaiting} awaiting a first observation`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
