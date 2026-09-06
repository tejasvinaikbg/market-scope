/**
 * GET /api/providers — the data sources the setup screen may offer, each with whether it can be chosen and why not.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { listProviders } from '../providers/availability.ts';

const ProviderOption = z.object({
  id: z.enum(['overpass', 'nominatim', 'google']), name: z.string(), enabled: z.boolean(),
  reason: z.enum(['not configured', 'disabled']).nullable(),
}).openapi('ProviderOption');
const Providers = z.object({ places: z.array(ProviderOption), geocoding: z.array(ProviderOption) }).openapi('Providers');

registry.registerPath({
  method: 'get', path: '/api/providers', tags: ['providers'], summary: 'Data sources on offer, with availability',
  description: 'OSM providers are always available. A Google provider is available when its key is configured and its switch is on.',
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: Providers } } }, ...errorResponses(500) },
});

export function providersRouter() {
  const router = Router();
  router.get('/providers', (_req, res) => { res.json(listProviders()); });
  return router;
}