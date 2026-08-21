"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { geoEquirectangular } from "d3-geo";
import { ComposableMap, Geographies, Geography, Marker, Sphere, ZoomableGroup, useZoomPanContext } from "react-simple-maps";
// countries-110m (not land-110m) - land-110m is a single merged landmass blob with no internal
// divisions, so there was nothing to draw a border *between*. countries-110m has 177
// individual country features, giving real per-country borders. Not countries-50m: that's
// 756kb raw (~7x this) for coastline precision this card is too small to actually show.
import countriesTopology from "world-atlas/countries-110m.json";

/**
 * Same geography/interaction problem as the hand-rolled version, but built on
 * react-simple-maps (a thin d3-geo/d3-zoom wrapper) instead of a custom viewBox state
 * machine - library-grade pan/zoom (d3-zoom's own non-passive wheel handling, no page-scroll
 * bug to work around) and geography rendering, still fully offline (same world-atlas land
 * data as HeroGlobe, no tile server, no network calls). "region" appears in exactly one place
 * in Vantage's schema (source_targets.region), a small terminal-controlled free-text field -
 * today that's exactly two values, so REGION_COORDINATES is a lookup table, not a geocoder.
 */

export interface RegionSupplyStat {
  region: string;
  totalStock: number;
  partCount: number;
}

const REGION_COORDINATES: Record<string, [number, number]> = {
  UK: [-2.5, 54.0],
  India: [78.0, 21.0],
};

// Exactly 2:1 - equirectangular's own aspect ratio (360deg lon / 180deg lat) - so the world
// fills the frame with zero residual gap on any side.
const WIDTH = 680;
const HEIGHT = 340;
// geoEquirectangular's fill relationship: a full 360deg longitude span covers scale*2*PI
// pixels. This is the scale that makes the world exactly fill WIDTH x HEIGHT, edge to edge.
const SCALE = WIDTH / (2 * Math.PI);

const MIN_RADIUS = 9;
const MAX_RADIUS = 30;
/** Room a two-line label needs above a marker before it risks clipping the frame's top edge. */
const LABEL_HEIGHT_ABOVE = 28;

// A standalone projection, matched exactly to ComposableMap's own (same projection, scale,
// and centered translate) - used only to decide each label's flip direction before render,
// not for any actual drawing (react-simple-maps' Marker/Geography own that internally).
const labelProjection = geoEquirectangular().translate([WIDTH / 2, HEIGHT / 2]).scale(SCALE);

/**
 * A separate component (not inlined in the parent's .map()) so it can call
 * useZoomPanContext() itself - that hook tracks the *live* zoom scale on every tick of an
 * active drag/zoom gesture, unlike the parent's own zoomState (only updated at onMoveEnd,
 * once the gesture settles). Reading the live value here means the counter-scale below tracks
 * smoothly in real time instead of snapping to correct only once you let go of the scroll.
 */
function RegionMarkerContent({
  radius,
  nameY,
  statsY,
  region,
  totalStock,
  partCount,
}: {
  radius: number;
  nameY: number;
  statsY: number;
  region: string;
  totalStock: number;
  partCount: number;
}) {
  const { k } = useZoomPanContext();
  return (
    // Marker's own translate(x,y) should scale with zoom (so it tracks the right geographic
    // point), but its content shouldn't also grow with it - a map pin stays a constant size
    // on screen regardless of zoom level, so this cancels the ambient ZoomableGroup scale.
    <g transform={`scale(${1 / k})`}>
      <circle r={radius} fill="var(--chart-1)" fillOpacity={0.16} />
      <circle r={Math.max(3, radius * 0.32)} fill="var(--chart-1)" />
      <text y={nameY} textAnchor="middle" className="fill-current" fontSize={12} fontWeight={600}>
        {region}
      </text>
      <text y={statsY} textAnchor="middle" className="fill-current text-muted-foreground" fontSize={10}>
        {totalStock.toLocaleString()} units · {partCount} part{partCount === 1 ? "" : "s"}
      </text>
    </g>
  );
}

function radiusFor(stock: number, maxStock: number): number {
  if (maxStock <= 0) return MIN_RADIUS;
  const fraction = Math.sqrt(stock / maxStock);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * fraction;
}

const DEFAULT_ZOOM_STATE = { center: [0, 0] as [number, number], zoom: 1 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function RegionSupplyMap({ regions }: { regions: RegionSupplyStat[] }) {
  const [zoomState, setZoomState] = useState(DEFAULT_ZOOM_STATE);

  const plottable = regions
    .filter((r) => REGION_COORDINATES[r.region])
    .sort((a, b) => b.totalStock - a.totalStock);
  const unplottable = regions.filter((r) => !REGION_COORDINATES[r.region]);

  const totalStock = regions.reduce((sum, r) => sum + r.totalStock, 0);
  const topRegion = plottable[0] ?? regions.slice().sort((a, b) => b.totalStock - a.totalStock)[0];
  const topPct = topRegion && totalStock > 0 ? Math.round((topRegion.totalStock / totalStock) * 100) : null;
  const maxStock = Math.max(...plottable.map((r) => r.totalStock), 1);

  if (plottable.length === 0) {
    return null;
  }

  const isDefaultView = zoomState.zoom === DEFAULT_ZOOM_STATE.zoom && zoomState.center.every((v) => v === 0);

  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Where supply comes from
        </p>
        <div className="flex items-center gap-3">
          {topPct != null && topRegion && (
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{topPct}%</span> of tracked stock is in{" "}
              <span className="font-medium text-foreground">{topRegion.region}</span>
            </p>
          )}
          {!isDefaultView && (
            <button
              type="button"
              onClick={() => setZoomState(DEFAULT_ZOOM_STATE)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              Reset view
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg">
        <ComposableMap
          width={WIDTH}
          height={HEIGHT}
          projection="geoEquirectangular"
          projectionConfig={{ scale: SCALE }}
          className="h-auto w-full"
          role="img"
          aria-label="Tracked stock by region - scroll to zoom, drag to pan"
        >
          <ZoomableGroup
            center={zoomState.center}
            zoom={zoomState.zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            translateExtent={[
              [0, 0],
              [WIDTH, HEIGHT],
            ]}
            onMoveEnd={(position) => setZoomState({ center: position.coordinates, zoom: position.zoom })}
          >
            <Sphere id="region-supply-map-sphere" fill="var(--secondary)" stroke="none" strokeWidth={0} />
            <Geographies geography={countriesTopology}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeOpacity={0.16}
                    strokeWidth={1}
                  />
                ))
              }
            </Geographies>

            {plottable.map((r) => {
              const coords = REGION_COORDINATES[r.region];
              const [, y] = labelProjection(coords) ?? [0, 0];
              const radius = radiusFor(r.totalStock, maxStock);
              // Label goes above the marker by default; flipped below when there isn't room,
              // so the map itself never has to shrink away from the frame to make space for it.
              const labelAbove = y - radius - LABEL_HEIGHT_ABOVE >= 0;
              const nameY = labelAbove ? -radius - 8 : radius + 18;
              const statsY = labelAbove ? -radius + 6 : radius + 32;

              return (
                <Marker key={r.region} coordinates={coords}>
                  <RegionMarkerContent
                    radius={radius}
                    nameY={nameY}
                    statsY={statsY}
                    region={r.region}
                    totalStock={r.totalStock}
                    partCount={r.partCount}
                  />
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground">Scroll to zoom, drag to pan.</p>

      {unplottable.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          +{unplottable.length} region{unplottable.length === 1 ? "" : "s"} not shown on the map (
          {unplottable.map((r) => r.region).join(", ")})
        </p>
      )}
    </div>
  );
}
