/**
 * Application errors.
 * Every failure the API returns is a plain Error carrying an HTTP status and a stable machine-readable `code`.
 * No class: `createAppError` builds the object and `isAppError` recognises it, so the error handler can tell
 * "a failure we chose to report" from "a bug".
 */
export interface AppError extends Error {
  status: number;      // HTTP status to respond with
  code: string;        // stable identifier clients switch on, e.g. 'NOT_FOUND', 'AREA_TOO_LARGE'
  details?: unknown;   // structured extras: validation issues, row numbers, measured values
}

const MARK = Symbol('appError');   // a private tag on the object; nothing else can accidentally look like an AppError

export function createAppError(status: number, code: string, message: string, details?: unknown): AppError {
  const err = new Error(message) as AppError & { [MARK]: true };
  err.name = 'AppError';
  err.status = status;
  err.code = code;
  err.details = details;
  err[MARK] = true;
  return err;
}

/** Type guard used by the error handler. */
export const isAppError = (err: unknown): err is AppError =>
  typeof err === 'object' && err !== null && (err as Record<symbol, unknown>)[MARK] === true;

// The two shapes routes actually throw. Add more here as codes are introduced; never build error bodies in a route.
export const notFound = (what: string) => createAppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (code: string, message: string, details?: unknown) => createAppError(400, code, message, details);
