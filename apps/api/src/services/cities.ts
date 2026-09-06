/**
 * City service: the logic between the HTTP route and the SQL for "what is this city's bounding box".
 * Cache-aside: serve the box stored on the city row; on a miss ask the geocoder once and store the answer,
 * so Nominatim is called at most once per city for the life of the database.
 */
import { createAppError, notFound } from '../lib/errors.ts';
import { citiesQueries } from '../queries/cities.ts';
import { geocoder } from '../providers/index.ts';

export async function getCityBounds(cityId: number) {
  const city = await citiesQueries.byId(cityId);
  if (!city) throw notFound('city');
  if (city.bbox && city.centre) return { cityId, name: city.name, bbox: city.bbox, centre: city.centre, cached: true };

  const query = `${city.name}, ${city.state}, ${city.country}`; // derived from the join — no column needed
  const found = await geocoder.lookupBounds(query);
  if (!found) throw createAppError(502, 'GEOCODER_NO_RESULT', `Geocoder returned nothing for "${query}"`); // 502: the upstream failed us, not the client

  await citiesQueries.cacheBounds(cityId, found.bbox, found.centre);
  return { cityId, name: city.name, bbox: found.bbox, centre: found.centre, cached: false };
}
