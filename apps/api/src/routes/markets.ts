/**
 * /api/markets — create a market from the setup screen's decisions, list markets, read one.
 * The body is validated by zod (shape and types); the product rules live in the service.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { marketsQueries } from '../queries/markets.ts';
import { createMarket, getMarket, listMarketStores } from '../services/markets.ts';

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
  geocoding: z.object({ total: z.number(), done: z.number(), failed: z.number() }),
  placement: z.object({ inside: z.number(), outside: z.number(), unlocated: z.number() }),
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

// Filters arrive as comma-separated query strings: ?layers=discovered,portfolio_inside&categories=supermarket&q=apollo
const commaList = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const StoreFiltersQuery = z.object({
  layers: z.string().optional().transform(commaList).pipe(z.array(z.enum(['discovered', 'portfolio_inside', 'portfolio_outside'])).optional()),
  categories: z.string().optional().transform(commaList).pipe(z.array(z.string().min(1)).optional()),
  q: z.string().trim().max(100).optional(),
}).openapi('StoreFilters');
const StoreCategory = Category.nullable();
const Store = z.object({
  id: z.string(), layer: z.enum(['discovered', 'portfolio_inside', 'portfolio_outside']), name: z.string(), category: StoreCategory,
  lat: z.number(), lng: z.number(), address: z.string().nullable(), source: z.string(),
}).openapi('Store');
const MarketStores = z.object({
  stores: z.array(Store),
  unlocated: z.array(z.object({ id: z.string(), name: z.string(), category: StoreCategory, address: z.string().nullable(), reason: z.string().nullable() })),
  counts: z.object({ discovered: z.number(), portfolioInside: z.number(), portfolioOutside: z.number(), portfolioUnlocated: z.number() }),
}).openapi('MarketStores');

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
  method: 'get', path: '/api/markets/{id}/stores', tags: ['markets'], summary: "Everything the market's dashboard draws",
  description: 'Discovered stores and the portfolio\'s stores with their placement, as one list filtered by `layers`, `categories` (slugs) and `q` (name contains), plus the unlocated portfolio stores and unfiltered totals per layer.',
  request: { params: idParam, query: StoreFiltersQuery },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: MarketStores } } }, ...errorResponses(400, 404, 500) },
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
  router.get('/markets/:id/stores', async (req, res) => { res.json(await listMarketStores(idParam.parse(req.params).id, StoreFiltersQuery.parse(req.query))); });
  return router;
}