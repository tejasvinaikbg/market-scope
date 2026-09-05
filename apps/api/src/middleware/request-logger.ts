/**
 * One log line per request (method, url, status, duration, request id) via pino-http; the health poller is excluded.
 */
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.ts";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/api/health" }
});
