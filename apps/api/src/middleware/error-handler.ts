/**
 * The last two pieces of the middleware chain.
 * `notFoundHandler` answers anything no route matched. `errorHandler` turns whatever was thrown into the one JSON
 * envelope the API uses: { error: { code, message, details? } }. Routes throw; only this file decides status codes.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../lib/errors.ts';

/** Registered after every route: anything that falls through is a JSON 404, never Express's HTML page. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

// Four parameters is how Express recognises an error handler; `_next` must stay even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (isAppError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  } else if (err instanceof ZodError) {                                  // request failed schema validation
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: err.issues } });
  } else if (err?.type === 'entity.parse.failed') {                      // express.json() could not parse the body
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } });
  } else {
    req.log.error({ err }, 'Unhandled error');                           // a 500 logs the stack and never returns it
    res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } });
  }
};
