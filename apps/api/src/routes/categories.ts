/**
 * GET /api/categories — the seeded store categories, with their OpenAPI contract registered beside the handler.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { categoriesQueries } from '../queries/categories.ts';
import { cacheFor } from '../middleware/cache-control.ts';

const Category = z.object({ id: z.number(), slug: z.string(), name: z.string() }).openapi('Category');

registry.registerPath({
  method: 'get',
  path: '/api/categories',
  tags: ['categories'], summary: 'Seeded store categories',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json':
        { schema: z.array(Category) }
      }
    },
    ...errorResponses(500)
  }
});

export function categoriesRouter() {
  const router = Router();
  router.get('/categories', cacheFor(3600), async (_req, res) => {              // seeded data: an hour is conservative
    res.json((await categoriesQueries.list()).map(({ id, slug, name }) => ({ id, slug, name })));
  });
  return router;
}