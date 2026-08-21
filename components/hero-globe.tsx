import {
  geoContains,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopology from "world-atlas/countries-50m.json";
import landTopology from "world-atlas/land-110m.json";

const VIEW_CENTER: [number, number] = [-12, 22];
const DOT_STEP_DEGREES = 0.82;
const DOT_RADIUS = 0.76;
const EDGE_TAPER_START_RADIANS = (72 * Math.PI) / 180;
const HORIZON_CULL_RADIANS = (82 * Math.PI) / 180;

const landTopo = landTopology as any;
const land = feature(landTopo, landTopo.objects.land) as any;

const countriesTopo = countriesTopology as any;
const geographyLines = mesh(
  countriesTopo,
  countriesTopo.objects.countries,
) as any;

// Static framing shifted northwest toward Greenland while keeping Europe and
// Africa visible in the same hero composition.
const projection = geoOrthographic()
  .rotate([-VIEW_CENTER[0], -VIEW_CENTER[1], 0])
  .translate([800, 558])
  .scale(505)
  .precision(0.25);

const path = geoPath(projection);
const spherePath = path({ type: "Sphere" }) ?? "";
const graticulePath = path(geoGraticule10()) ?? "";
const geographyLinesPath = path(geographyLines) ?? "";

type LandDot = {
  x: number;
  y: number;
  radius: number;
};

function createLandDots(): LandDot[] {
  const dots: LandDot[] = [];

  // These are genuine geographic sample points. Each longitude/latitude pair
  // must be on land AND on the front hemisphere before it becomes an SVG dot.
  // Dot opacity stays identical everywhere; only the final few degrees near
  // the limb reduce in radius to prevent orthographic compression from making
  // a dark ring around the globe edge.
  for (
    let latitude = -60, row = 0;
    latitude <= 82;
    latitude += DOT_STEP_DEGREES, row += 1
  ) {
    const cosLatitude = Math.cos((latitude * Math.PI) / 180);
    const longitudeStep =
      DOT_STEP_DEGREES / Math.max(Math.abs(cosLatitude), 0.3);
    const rowOffset = row % 2 === 0 ? 0 : longitudeStep / 2;

    for (
      let longitude = -180 + rowOffset;
      longitude < 180;
      longitude += longitudeStep
    ) {
      const coordinate: [number, number] = [longitude, latitude];
      const distanceFromCamera = geoDistance(VIEW_CENTER, coordinate);

      // Cull before the exact horizon so projected rows cannot stack into a
      // dense outline at the sphere boundary.
      if (distanceFromCamera >= HORIZON_CULL_RADIANS) continue;
      if (!geoContains(land, coordinate)) continue;

      const projected = projection(coordinate);
      if (!projected) continue;

      let radius = DOT_RADIUS;

      if (distanceFromCamera > EDGE_TAPER_START_RADIANS) {
        const edgeProgress =
          (distanceFromCamera - EDGE_TAPER_START_RADIANS) /
          (HORIZON_CULL_RADIANS - EDGE_TAPER_START_RADIANS);

        // Keep the dots dark/visible; only reduce their physical size near the
        // limb where orthographic projection packs them closer together.
        radius = DOT_RADIUS * (1 - 0.42 * Math.min(edgeProgress, 1));
      }

      dots.push({
        x: Number(projected[0].toFixed(2)),
        y: Number(projected[1].toFixed(2)),
        radius: Number(radius.toFixed(3)),
      });
    }
  }

  return dots;
}

const landDots = createLandDots();

const particles = [
  [224, 520, 1.1],
  [334, 486, 0.8],
  [452, 540, 1],
  [612, 462, 0.8],
  [742, 510, 0.9],
  [892, 472, 0.8],
  [1048, 518, 1],
  [1198, 472, 0.8],
  [1365, 528, 1.1],
] as const;

export function HeroGlobe() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-[450px] z-0 h-[720px] w-[1360px] -translate-x-1/2 text-black dark:text-white sm:top-[465px] sm:w-[1510px] lg:top-[455px] lg:w-[1680px]"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 6%, black 72%, transparent 96%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 6%, black 72%, transparent 96%)",
      }}
    >
      <svg
        viewBox="0 0 1600 800"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
      >
        <g fill="none">
          <ellipse
            cx="800"
            cy="582"
            rx="682"
            ry="100"
            stroke="currentColor"
            strokeOpacity="0.028"
            strokeWidth="1"
            transform="rotate(-6 800 582)"
          />
          <ellipse
            cx="800"
            cy="580"
            rx="710"
            ry="118"
            stroke="currentColor"
            strokeOpacity="0.020"
            strokeWidth="1"
            transform="rotate(7 800 580)"
          />

          <path
            d={spherePath}
            stroke="currentColor"
            strokeOpacity="0.105"
            strokeWidth="1.05"
          />

          <path
            d={graticulePath}
            stroke="currentColor"
            strokeOpacity="0.040"
            strokeWidth="0.54"
          />

          {/* Actual geographic dots. No SVG pattern or land-shape masking. */}
          <g fill="currentColor" fillOpacity="0.245">
            {landDots.map((dot, index) => (
              <circle
                key={`land-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.radius}
              />
            ))}
          </g>

          {/* Real coastline + political detail over the geographic dots. */}
          <path
            d={geographyLinesPath}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.060"
            strokeWidth="0.34"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {particles.map(([cx, cy, r]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="currentColor"
              fillOpacity="0.075"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
