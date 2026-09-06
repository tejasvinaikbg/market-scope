/**
 * GET /api/health — liveness plus a real database ping and the queue's depth; 503 when the database is unreachable.
 * The queue numbers are what an autoscaler or a person looks at to decide whether more workers are needed.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry } from '../openapi/registry.ts';
import { config } from '../config.ts';
import { db } from '../db/knex.ts';
import { jobsQueries } from '../queries/jobs.ts';

const Health = z.object({
  healthy: z.boolean().openapi({ example: true }),
  db: z.boolean(),
  version: z.string().openapi({ example: '1.0.0' }),
  jobs: z.object({ pending: z.number(), running: z.number(), failed: z.number() }).nullable(),   // null when the database is unreachable
}).openapi('Health');

registry.registerPath({
  method: 'get', path: '/api/health', tags: ['system'], summary: 'Live, database reachable, queue depth',
  responses: {
    200: { description: 'Healthy and DB reachable', content: { 'application/json': { schema: Health } } },
    503: { description: 'DB unreachable', content: { 'application/json': { schema: Health } } },
  },
});

// Called per app instance; safe to call many times (tests build several apps).
export function healthRouter() {
  const router = Router();
  router.get('/health', async (_req, res) => {
    let jobs: Awaited<ReturnType<typeof jobsQueries.depth>> | null = null;
    try { jobs = await jobsQueries.depth(); } catch { jobs = null; }      // one query does both: proves the database answers, reads the queue
    const healthy = jobs !== null;
    res.status(healthy ? 200 : 503).json({ healthy, db: healthy, version: config.APP_VERSION, jobs });
  });
  return router;
}