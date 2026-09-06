/**
 * Builds the Express app: the middleware chain, the routes, and the error handling, in the order requests flow.
 * No listening here — server.ts does that — so tests can build an app without opening a port.
 * The chain is production-shaped from the start: security headers, compression, CORS when a browser origin is configured,
 * and a per-client rate limit — each a package, each a configuration knob, none of them a code change at deploy time.
 */
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, type Config } from './config.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts';
import { healthRouter } from './routes/health.ts';
import { docsRouter } from './routes/docs.ts';
import { locationsRouter } from './routes/location.ts';
import { categoriesRouter } from './routes/categories.ts';
import { citiesRouter } from './routes/cities.ts';
import { portfoliosRouter } from './routes/portfolios.ts';
import { marketsRouter } from './routes/markets.ts';
import { providersRouter } from './routes/providers.ts';

/** Builds the Express app without listening. `overrides` lets a test change a knob (e.g. a tiny rate limit) without touching the environment. */
export function buildApp(overrides: Partial<Pick<Config, 'RATE_LIMIT_PER_MINUTE' | 'CORS_ORIGIN'>> = {}) {
  const settings = { ...config, ...overrides };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', settings.TRUST_PROXY);                          // behind a load balancer, the client IP is in X-Forwarded-For
  app.use(helmet({ contentSecurityPolicy: false }));                     // the API serves JSON; Swagger UI at /api/docs needs inline scripts
  app.use(compression());
  if (settings.CORS_ORIGIN) app.use(cors({ origin: settings.CORS_ORIGIN.split(',').map((o) => o.trim()) }));   // deployed: the web app's own domain
  if (settings.RATE_LIMIT_PER_MINUTE > 0) {
    app.use('/api', rateLimit({
      windowMs: 60_000, limit: settings.RATE_LIMIT_PER_MINUTE, standardHeaders: 'draft-7', legacyHeaders: false,
      handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests; try again in a minute' } }); },   // our envelope, not the default text
    }));
  }
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', healthRouter(), locationsRouter(), categoriesRouter(), citiesRouter(), portfoliosRouter(), marketsRouter(), providersRouter(), docsRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}