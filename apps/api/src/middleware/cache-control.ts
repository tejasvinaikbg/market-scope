/**
 * Cache-Control for responses that do not change within a session: the browser, and any CDN or proxy in front, may keep
 * them for `seconds` and skip the API entirely. Reference data is the same for every user, which is exactly what caches are for.
 */
import type { RequestHandler } from 'express';

export const cacheFor =
  (seconds: number): RequestHandler =>
  (_req, res, next) => {
    res.set('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
