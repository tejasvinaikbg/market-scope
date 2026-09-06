/**
 * All SQL for the cities table: reading a city with its state and country names, and caching the
 * geocoder's bounding box on the row. PostGIS values go in and out through k.raw inside builder calls,
 * because the query builder has no vocabulary for geometry.
 */
import type { Bbox, LatLng } from '@market-scope/shared';
import { db, type Db } from '../db/knex.ts';

export interface CityRow {
  id: number;
  name: string;
  state: string;
  country: string;
  bbox: Bbox | null;
  centre: LatLng | null;
}

export const citiesQueries = {
  /** The city plus the names needed to build the geocoder query ("Bengaluru, Karnataka, India"). */
  async byId(id: number, k: Db = db): Promise<CityRow | null> {
    const r = await k('cities as ci')
      .join('states as s', 's.id', 'ci.state_id')
      .join('countries as c', 'c.id', 's.country_id')
      .select(
        'ci.id',
        'ci.name',
        's.name as state',
        'c.name as country',
        // bbox/centre are geometry columns: read them back as plain numbers
        k.raw(
          'ST_YMin(ci.bbox) AS south, ST_XMin(ci.bbox) AS west, ST_YMax(ci.bbox) AS north, ST_XMax(ci.bbox) AS east, ST_Y(ci.centre) AS lat, ST_X(ci.centre) AS lng',
        ),
      )
      .where('ci.id', id)
      .first();
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      state: r.state,
      country: r.country,
      bbox: r.south == null ? null : { south: r.south, west: r.west, north: r.north, east: r.east }, // NULL until first geocode
      centre: r.lat == null ? null : { lat: r.lat, lng: r.lng },
    };
  },

  /** Store the geocoder's answer so later requests never hit Nominatim for this city again. */
  async cacheBounds(id: number, bbox: Bbox, centre: LatLng, k: Db = db): Promise<void> {
    await k('cities')
      .where({ id })
      .update({
        bbox: k.raw('ST_MakeEnvelope(?, ?, ?, ?, 4326)', [bbox.west, bbox.south, bbox.east, bbox.north]), // xmin, ymin, xmax, ymax
        centre: k.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)', [centre.lng, centre.lat]), // x = lng, y = lat
        bbox_fetched_at: k.fn.now(),
      });
  },
};
