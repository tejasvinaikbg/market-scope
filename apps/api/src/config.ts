/**
 * The only module that reads process.env. Loads .env, validates every variable with zod at startup, and exports typed values.
 */
import { MATCH_DISTANCE_M } from '@market-scope/shared';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from "./openapi/zod.ts";
import pkg from "../package.json" with { type: "json" };


dotenv.config({ path: join(import.meta.dirname, '..', '..', '..', '.env') })

export const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4200),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  GEOCODER: z.enum(['nominatim', 'fixture']).default('nominatim'),
  NOMINATIM_USER_AGENT: z.string().min(1),
  // Store discovery: overpass (live, free) or fixture (offline, from apps/api/fixtures/overpass.json). Mirrors rotate on retry.
  PLACES: z.enum(['overpass', 'fixture']).default('overpass'),
  JOBS: z.enum(['on', 'off']).default('on'),
  JOB_STALE_MINUTES: z.coerce.number().int().min(1).default(15),         // a job still 'running' after this long is taken over (its worker died)
  TILE_CACHE_HOURS: z.coerce.number().min(0).default(24),               // how long a grid cell's places answer is reused across markets; 0 = never
  MATCH_DISTANCE_M: z.coerce.number().positive().default(MATCH_DISTANCE_M),   // the shared default, so the screen's label and the rule agree
  // Facing the internet: how many proxy hops sit in front (so rate limits see the client, not the balancer), which
  // browser origin may call the API directly (blank = none: the Next rewrite proxies), and the per-client request rate (0 = off).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CORS_ORIGIN: z.string().trim().optional().transform((v) => v || undefined),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(300),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),              // per process; raise behind a connection pooler                              // off: the API answers but never runs discovery (tests, debugging)
  OVERPASS_URLS: z.string().default('https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').transform((v) => v.split(',').map((u) => u.trim()).filter(Boolean)),
  // Data sources: every provider has a switch; the Google ones also need a key. Off means greyed out on the screen and refused by the API.
  OVERPASS_ENABLED: z.enum(['true', 'false']).default('true'),
  NOMINATIM_ENABLED: z.enum(['true', 'false']).default('true'),
  GOOGLE_PLACES_API_KEY: z.string().trim().optional().transform((v) => v || undefined),      // a blank line in .env means "none"
  GOOGLE_PLACES_ENABLED: z.enum(['true', 'false']).default('false'),
  GOOGLE_GEOCODING_API_KEY: z.string().trim().optional().transform((v) => v || undefined),
  GOOGLE_GEOCODING_ENABLED: z.enum(['true', 'false']).default('false'),
})

const env = Env.parse(process.env);
export const config = {
  PORT: env.PORT,
  LOG_LEVEL: env.LOG_LEVEL,
  DATABASE_URL: env.DATABASE_URL,
  APP_NAME: pkg.name,
  APP_VERSION: pkg.version,
  APP_DESCRIPTION: pkg.description ?? "",
  GEOCODER: env.GEOCODER,
  NOMINATIM_USER_AGENT: env.NOMINATIM_USER_AGENT,
  PLACES: env.PLACES,
  JOBS: env.JOBS,
  JOB_STALE_MINUTES: env.JOB_STALE_MINUTES,
  TILE_CACHE_HOURS: env.TILE_CACHE_HOURS,
  MATCH_DISTANCE_M: env.MATCH_DISTANCE_M,
  TRUST_PROXY: env.TRUST_PROXY,
  CORS_ORIGIN: env.CORS_ORIGIN,
  RATE_LIMIT_PER_MINUTE: env.RATE_LIMIT_PER_MINUTE,
  DB_POOL_MAX: env.DB_POOL_MAX,
  OVERPASS_URLS: env.OVERPASS_URLS,
  OVERPASS_ENABLED: env.OVERPASS_ENABLED === 'true',
  NOMINATIM_ENABLED: env.NOMINATIM_ENABLED === 'true',
  GOOGLE_PLACES_API_KEY: env.GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACES_ENABLED: env.GOOGLE_PLACES_ENABLED === 'true',
  GOOGLE_GEOCODING_API_KEY: env.GOOGLE_GEOCODING_API_KEY,
  GOOGLE_GEOCODING_ENABLED: env.GOOGLE_GEOCODING_ENABLED === 'true',
} as const;

export type Config = typeof config;