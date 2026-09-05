import express from "express";
import { config } from "./config.ts";
import { requestLogger } from "./middleware/request-logger.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { echoRouter } from "./routes/echo.ts";

/** Builds the Express app without listening, 
so tests can drive it and the process file only wires it up. */

export function buildApp() {
	const app = express();
	app.disable("x-powered-by");
	app.use(requestLogger);
	app.use(express.json({ limit: '1mb' }));

	app.get('/api/health', (req, res) => {
		res.status(200).json({
			healthy: true,
			version: config.version
		})
	})
	app.use('/api', echoRouter());
	app.use(notFoundHandler);
	app.use(errorHandler);
	return app;
}
