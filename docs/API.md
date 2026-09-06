# API

Base path `/api`. JSON in and out. The live, generated reference with schemas and try-it-out is at `/api/docs`
(OpenAPI 3, from the same zod schemas the routes validate with).

## Endpoints

| Method and path | Purpose | Answers |
|---|---|---|
| `GET /health` | database reachable, queue depth | `200`, or `503` when the database is down |
| `GET /locations` | countries → states → cities, for the selects | `200`, cached an hour |
| `GET /categories` | the seeded categories | `200`, cached an hour |
| `GET /providers` | data sources with availability and the reason when off | `200` |
| `GET /cities/{id}/bbox` | a city's bounding box and centre, looked up once and cached on the row | `200`, `404` |
| `POST /portfolios` | upload a CSV or XLSX (multipart field `file`); validates the whole file first | `201` with a summary and warnings, `400` with row-addressed issues |
| `GET /portfolios/{id}` | summary: counts and the extent of the located stores | `200`, `404` |
| `POST /markets` | create a market and queue its run | `201`, `400` (shape, area over the cap with the measured value, unknown category, provider unavailable), `404` |
| `GET /markets` | every market, newest first | `200` |
| `GET /markets/{id}` | one market with status, progress, counts and `busy` | `200`, `404` |
| `PUT /markets/{id}` | rewrite its decisions, discard what was found, queue again | `202`, same `400`s as create, `404`, `409` while busy |
| `POST /markets/{id}/runs` | queue the run again | `202`, `404`, `409` while busy |
| `DELETE /markets/{id}` | delete it and everything found for it | `204`, `404`, `409` while busy |
| `GET /markets/{id}/stores` | what the dashboard draws: one list, filtered; the unlocated apart; unfiltered totals | `200`, `400` on a bad filter, `404` |

Filters on the stores list: `layers` (comma list of `discovered`, `portfolio_inside`, `portfolio_outside`, `matched`),
`categories` (comma list of slugs), `q` (name contains). `matched` selects the portfolio stores that found a partner,
beside whatever other layers are asked for. Totals never follow the filters.

## Errors

Every error is the same envelope:

```json
{ "error": { "code": "AREA_TOO_LARGE", "message": "Boundary is 31.20 km²; the cap is 30 km²", "details": { "areaSqKm": 31.2 } } }
```

`code` is stable and meant for the client to switch on; `message` is for people; `details` carries what the client can
act on, such as the list of file issues with their row and column.

## Rate limit and caching

Every response carries `RateLimit` headers; the limit is per client per minute, per API instance. Reference data carries
`Cache-Control: public, max-age=3600` so a CDN can serve it.
