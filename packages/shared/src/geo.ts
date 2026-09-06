/** A rectangular boundary in WGS84 degrees. */
export interface Bbox { south: number; west: number; north: number; east: number }
export interface LatLng { lat: number; lng: number }

/** Product rules from the brief. */
export const MAX_MARKET_AREA_SQ_KM = 30;
export const MIN_MARKET_AREA_SQ_KM = 0.01;   // below ~100 m × 100 m it is a mis-drag, not a market
export const DEFAULT_TILE_KM = 3;            // discovery splits the boundary into tiles of this size

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

/**
 * Split a bbox into a grid of tiles at most `tileKm` on a side, row-major (south→north, west→east).
 * The tile count is the number of places-API calls a discovery run will make — the "cost" the UI shows.
 */
export function splitBbox(b: Bbox, tileKm: number): Bbox[] {
  if (tileKm <= 0) throw new Error('tileKm must be positive');
  const { widthKm, heightKm } = bboxDimensionsKm(b);
  const cols = Math.max(1, Math.ceil(widthKm / tileKm));
  const rows = Math.max(1, Math.ceil(heightKm / tileKm));
  const dLat = (b.north - b.south) / rows;
  const dLng = (b.east - b.west) / cols;
  const tiles: Bbox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        south: b.south + r * dLat,
        north: r === rows - 1 ? b.north : b.south + (r + 1) * dLat,   // last row/col snap to the edge: no float gap
        west: b.west + c * dLng,
        east: c === cols - 1 ? b.east : b.west + (c + 1) * dLng,
      });
    }
  }
  return tiles;
}

export const estimateDiscoveryCalls = (b: Bbox, tileKm = DEFAULT_TILE_KM): number => splitBbox(b, tileKm).length;

/** A square of the given area centred on a point — the default editable boundary. */
export function squareAround(centre: LatLng, areaSqKm: number): Bbox {
  const sideKm = Math.sqrt(areaSqKm);
  const dLat = sideKm / 2 / KM_PER_DEG_LAT;
  const dLng = sideKm / 2 / (KM_PER_DEG_LAT * Math.cos(toRad(centre.lat)));
  return { south: centre.lat - dLat, north: centre.lat + dLat, west: centre.lng - dLng, east: centre.lng + dLng };
}

export const pointInBbox = (p: LatLng, b: Bbox): boolean =>
  p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;