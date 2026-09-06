/** A rectangular boundary in WGS84 degrees. */
export interface Bbox { south: number; west: number; north: number; east: number }
export interface LatLng { lat: number; lng: number }

/** Product rules from the brief. */
export const MAX_MARKET_AREA_SQ_KM = 30;
export const MIN_MARKET_AREA_SQ_KM = 0.01;   // below ~100 m × 100 m it is a mis-drag, not a market
/** Discovery's grid: cells this many degrees on a side (≈ 2.8 km N–S, ≈ 2.7 km E–W near Bengaluru), aligned to the world, not to the boundary. */
export const GRID_CELL_DEG = 0.025;

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEG_LAT = 111.32;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Area of a lat/lng rectangle on a sphere: R² · |sin φ₂ − sin φ₁| · |λ₂ − λ₁|.
 * Within 0.4 % of PostGIS ST_Area(geography) at city scale; the server still uses PostGIS as ground truth.
 */
export function bboxAreaSqKm(b: Bbox): number {
  const dLon = Math.abs(toRad(b.east) - toRad(b.west));
  const dSin = Math.abs(Math.sin(toRad(b.north)) - Math.sin(toRad(b.south)));
  return EARTH_RADIUS_KM * EARTH_RADIUS_KM * dSin * dLon;
}

/** Structural validity. Returns an error message, or null when the box is usable. */
export function validateBbox(b: Bbox): string | null {
  const values = [b.south, b.west, b.north, b.east];
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'boundary values must be finite numbers';
  if (b.south < -90 || b.north > 90) return 'latitude must be within [-90, 90]';
  if (b.west < -180 || b.east > 180) return 'longitude must be within [-180, 180]';
  if (b.south >= b.north) return 'south must be less than north';
  if (b.west >= b.east) return 'west must be less than east';
  return null;
}

/** Width and height in km, good to <1 % at city scale. */
export function bboxDimensionsKm(b: Bbox): { widthKm: number; heightKm: number } {
  const midLat = toRad((b.north + b.south) / 2);
  return { widthKm: (b.east - b.west) * KM_PER_DEG_LAT * Math.cos(midLat), heightKm: (b.north - b.south) * KM_PER_DEG_LAT };
}

export interface GridCell { key: string; bbox: Bbox }

/**
 * The fixed-grid cells that cover a box, row-major (south→north, west→east). Cells are aligned to multiples of
 * GRID_CELL_DEG from the equator and the prime meridian — not to the box — so two boundaries over the same streets share
 * the same cells, which is what lets a cell's results be cached across markets. A cell can overhang the box; the caller
 * filters results by the box. The cell count is the number of places-API calls a run makes: the "cost" the setup screen shows.
 */
export function gridCells(b: Bbox, cellDeg = GRID_CELL_DEG): GridCell[] {
  const first = (v: number) => Math.floor(v / cellDeg + 1e-9);          // 77.6 / 0.025 is 3103.9999… in floating point: nudge onto the line
  const last = (v: number) => Math.floor(v / cellDeg - 1e-9);           // an edge exactly on a grid line does not start a new cell
  const cells: GridCell[] = [];
  for (let i = first(b.south); i <= last(b.north); i++) {
    for (let j = first(b.west); j <= last(b.east); j++) {
      cells.push({ key: `${i}:${j}`, bbox: { south: i * cellDeg, north: (i + 1) * cellDeg, west: j * cellDeg, east: (j + 1) * cellDeg } });
    }
  }
  return cells;
}

export const estimateDiscoveryCalls = (b: Bbox): number => gridCells(b).length;

/** A square of the given area centred on a point — the default editable boundary. */
export function squareAround(centre: LatLng, areaSqKm: number): Bbox {
  const sideKm = Math.sqrt(areaSqKm);
  const dLat = sideKm / 2 / KM_PER_DEG_LAT;
  const dLng = sideKm / 2 / (KM_PER_DEG_LAT * Math.cos(toRad(centre.lat)));
  return { south: centre.lat - dLat, north: centre.lat + dLat, west: centre.lng - dLng, east: centre.lng + dLng };
}

export const pointInBbox = (p: LatLng, b: Bbox): boolean =>
  p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;


/** Where a new market starts: a square of this area on the city centre — under the cap, so the form is usable at once. */
export const DEFAULT_MARKET_AREA_SQ_KM = 24;

/** Move the box by a delta in degrees — the centre handle. */
export function translateBbox(b: Bbox, dLat: number, dLng: number): Bbox {
  return { south: b.south + dLat, north: b.north + dLat, west: b.west + dLng, east: b.east + dLng };
}

/** The box with these two points as opposite corners, in any order — a corner handle dragged anywhere, including past its anchor. */
export function bboxFromCorners(a: LatLng, b: LatLng): Bbox {
  return { south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat), west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng) };
}

/** Grow the box by `km` on every side — "fit to the stores" wants a margin, not a box that clips the outermost pin. */
export function padBbox(b: Bbox, km: number): Bbox {
  const dLat = km / KM_PER_DEG_LAT;
  const dLng = km / (KM_PER_DEG_LAT * Math.cos(toRad((b.north + b.south) / 2)));
  return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLng, east: b.east + dLng };
}