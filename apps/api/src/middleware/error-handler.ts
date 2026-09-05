import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.ts';

/** Registered after every route: anything that falls through is a JSON 404, never Express's HTML page. */
export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: "Route not found" } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    } else if (err instanceof ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: err.issues } });
    } else if (err?.type === 'entity.parse.failed') { // express.json()  parse error
        res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } });
    } else {
        _req.log.error({ err }, "Unhandled error");
        res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } });
    }
}