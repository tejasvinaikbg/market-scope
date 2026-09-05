import express from "express";
import { config } from "./config.ts";

/** Builds the Express app without listening, 
so tests can drive it and the process file only wires it up. */

export function buildApp() {
	const app = express();
	app.disable("x-powered-by");
	app.get('/api/health', (req, res) => {
		res.status(200).json({
			healthy: true,
			version: config.version
		})
	})

	return app;
}
