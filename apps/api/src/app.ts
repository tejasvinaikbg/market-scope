/**
 * Builds the Express app: the middleware chain, the routes, and the error handling, in the order requests flow.
 * No listening here — server.ts does that — so tests can build an app without opening a port.
 */
import express from "express";
import { requestLogger } from "./middleware/request-logger.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { healthRouter } from "./routes/health.ts";
import { echoRouter } from "./routes/echo.ts";
import { docsRouter } from "./routes/docs.ts";
import { locationsRouter } from './routes/location.ts'
import { categoriesRouter } from './routes/categories.ts'
import { citiesRouter } from './routes/cities.ts'
/** Builds the Express app without listening, 
so tests can drive it and the process file only wires it up. */

export function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter(), locationsRouter(), categoriesRouter(), citiesRouter(), echoRouter(), docsRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
