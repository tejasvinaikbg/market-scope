import express from "express";
import { requestLogger } from "./middleware/request-logger.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { healthRouter } from "./routes/health.ts";
import { echoRouter } from "./routes/echo.ts";
import { docsRouter } from "./routes/docs.ts";

/** Builds the Express app without listening, 
so tests can drive it and the process file only wires it up. */

export function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter(), echoRouter(), docsRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
