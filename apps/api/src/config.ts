import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from "./openapi/zod.ts";
import pkg from "../package.json" with { type: "json" };


dotenv.config({ path: join(import.meta.dirname, '..', '..', '..', '.env') })

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4200),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url()
})

const env = Env.parse(process.env);
export const config = {
  PORT: env.PORT,
  LOG_LEVEL: env.LOG_LEVEL,
  DATABASE_URL: env.DATABASE_URL,
  APP_NAME: pkg.name,
  APP_VERSION: pkg.version,
  APP_DESCRIPTION: pkg.description ?? "",
} as const;

export type Config = typeof config;
