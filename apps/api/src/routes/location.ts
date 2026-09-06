/**
 * GET /api/locations — the seeded country → state → city tree for the dropdowns.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { locationsQueries } from '../queries/locations.ts';
import { cacheFor } from '../middleware/cache-control.ts';

const City = z.object({ id: z.number(), name: z.string() }).openapi('City');
const State = z.object({ id: z.number(), name: z.string(), cities: z.array(City) }).openapi('State');
const Country = z.object({ id: z.number(), name: z.string(), states: z.array(State) }).openapi('Country');
const Locations = z.object({ countries: z.array(Country) }).openapi('Locations');

registry.registerPath({
  method: 'get',
  path: '/api/locations',
  tags: ['locations'],
  summary: 'Seeded country=>state=>city tree for the dropdowns',
  responses: {
    200: {
      description: 'Locations tree',
      content: {
        'application/json': {
          schema: Locations,
        },
      },
    },
    ...errorResponses(500),
  },
});

export function locationsRouter() {
  const router = Router();
  router.get('/locations', cacheFor(3600), async (_req, res) => {
    res.json({ countries: await locationsQueries.locationTree() });
  });
  return router;
}
