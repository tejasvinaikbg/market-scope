import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.ts";

export const requestLogger = pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
});