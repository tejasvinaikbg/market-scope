import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry } from '../openapi/registry.ts';
import { config } from '../config.ts';
import { db } from '../db/knex.ts'

const Health = z.object({
  healthy: z.boolean().openapi({ example: true }),
  version: z.string().openapi({ example: '1.0.0' })
}).openapi('Health')

registry.registerPath({
  method: 'get', path: '/api/health', tags: ['system'], summary: 'Live and Database reachable',
  responses: {
    200: { description: 'Healthy and DB reachable', content: { 'application/json': { schema: Health } } },
    503: { description: 'DB unreachable', content: { 'application/json': { schema: Health } } }
  },
});

// Called per app instance; safe to call many times (tests build several apps).
export function healthRouter() {
  const router = Router();
  router.get('/health', async (_req, res) => {
    let healthy = false;
    try {
      await db.raw('SELECT 1');
      healthy = true
    } catch (error) {
      healthy = false
    }
    res.status(200).json({
      healthy,
      db: healthy,
      version: config.APP_VERSION
    })
  });
  return router;
}