/**
 * The only module that reads process.env. Loads .env, validates every variable with zod at startup, and exports typed values.
 */
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
  OVERPASS_ENABLED: env.OVERPASS_ENABLED === 'true',
  NOMINATIM_ENABLED: env.NOMINATIM_ENABLED === 'true',
  GOOGLE_PLACES_API_KEY: env.GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACES_ENABLED: env.GOOGLE_PLACES_ENABLED === 'true',
  GOOGLE_GEOCODING_API_KEY: env.GOOGLE_GEOCODING_API_KEY,
  GOOGLE_GEOCODING_ENABLED: env.GOOGLE_GEOCODING_ENABLED === 'true',
} as const;

export type Config = typeof config;