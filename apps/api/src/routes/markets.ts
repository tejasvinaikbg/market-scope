/**
 * /api/markets — create a market from the setup screen's decisions, list markets, read one.
 * The body is validated by zod (shape and types); the product rules live in the service.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { marketsQueries } from '../queries/markets.ts';
import { createMarket, getMarket } from '../services/markets.ts';

const Bbox = z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() }).openapi('Bbox');
const Category = z.object({ id: z.number(), slug: z.string(), name: z.string() });
const Market = z.object({
  id: z.number(), name: z.string(),
  portfolioId: z.number(), portfolioName: z.string(), cityId: z.number(), cityName: z.string(),
  boundary: Bbox, areaSqKm: z.number(),
  placesProvider: z.enum(['overpass', 'google']), geocoderProvider: z.enum(['nominatim', 'google']),
  categories: z.array(Category), createdAt: z.string(),
  status: z.enum(['pending', 'running', 'ready', 'partial', 'failed']), error: z.string().nullable(),
  startedAt: z.string().nullable(), completedAt: z.string().nullable(), storeCount: z.number(),
  progress: z.object({ tiles: z.number(), done: z.number(), failed: z.number() }).nullable(),
}).openapi('Market');
const CreateMarket = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  portfolioId: z.number().int().positive(),
  cityId: z.number().int().positive(),
  categoryIds: z.array(z.number().int().positive()).min(1),
  boundary: Bbox,
  placesProvider: z.enum(['overpass', 'google']).default('overpass'),
  geocoderProvider: z.enum(['nominatim', 'google']).default('nominatim'),
}).openapi('CreateMarket');
const idParam = z.object({ id: z.coerce.number().int().positive() });

registry.registerPath({
  method: 'post', path: '/api/markets', tags: ['markets'], summary: 'Create a market from a portfolio, a city, a boundary and categories',
  description: 'The boundary is measured with PostGIS; over the area cap the request is rejected with the measured value in `details.areaSqKm`. The market is created as `pending` and discovery runs in the background; poll GET /api/markets/{id} for `status` and `storeCount`.',
  request: { body: { content: { 'application/json': { schema: CreateMarket } } } },
  responses: { 201: { description: 'Created', content: { 'application/json': { schema: Market } } }, ...errorResponses(400, 404, 500) },
});
registry.registerPath({
  method: 'get', path: '/api/markets', tags: ['markets'], summary: 'Markets, newest first',
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(Market) } } }, ...errorResponses(500) },
});
registry.registerPath({
  method: 'get', path: '/api/markets/{id}', tags: ['markets'], summary: 'One market',
  request: { params: idParam },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: Market } } }, ...errorResponses(400, 404, 500) },
});

export function marketsRouter() {
  const router = Router();
  router.post('/markets', async (req, res) => { res.status(201).json(await createMarket(CreateMarket.parse(req.body))); });
  router.get('/markets', async (_req, res) => { res.json(await marketsQueries.list()); });
  router.get('/markets/:id', async (req, res) => { res.json(await getMarket(idParam.parse(req.params).id)); });
  return router;
}