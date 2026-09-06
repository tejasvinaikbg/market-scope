# Shortcomings

Deliberate choices, each sized to the brief: one user, one market at a time, a few markets a day. None is a bug. Each
names the register row in [PRODUCTION.md](PRODUCTION.md) that would lift it.

## Scope

- **Single user.** No authentication, no per-user data, no quotas. The brief assumes one user (row 16).
- **Public OpenStreetMap services only.** Nominatim and Overpass on public mirrors, at their limit of one request per
  second per process. That is the hard ceiling of the whole system: roughly one market every six seconds and one
  address a second, for everyone. The Google providers are offered in configuration but not implemented (rows 9, 21).
- **Editing is a fresh run.** Editing a market rewrites its decisions, discards what was found and runs again. There is
  no diff, no history of earlier runs.

## Data

- **Same category, or it is not the same shop.** Matching pairs a portfolio store with the nearest discovered store of
  the same category within 150 m. The brief says only "within 150 m"; the rule was added because the sample's FreshMart
  sits 104 m from a pharmacy. Names are not compared, so a different supermarket 127 m away still pairs (row 27).
- **Geocoding is free-text and bounded to the city.** An address the lookup cannot place inside the city box stays
  unlocated and is retried on the next run. Some real streets are missed that way; a structured query and a
  neighbourhood-level fallback are row 22.
- **A workbook's rich text and formulas are flattened to text**; a cell error becomes an empty value.
- **The tile cache expires by age only.** No purge, no way to force a fresh answer before the 24 hours (row 18).

## Runtime

- **Polling, twice.** The dashboard asks for the market every two seconds while a run is in flight, and for the stores
  list beside it, so stores appear as they are found; the worker polls the jobs table every two seconds. Cost scales with
  runs in progress, not users (rows 10, 12).
- **Limits counted per process.** The inbound rate limit counts per API instance; the outbound throttle is per worker
  process, so two workers make twice the rate the mirrors allow (rows 6, 19).
- **A worker claims every job type** and parks the ones it cannot handle as failed (row 24).
- **File parsing runs in the request**, CPU-bound, acceptable under the 5 MB cap (row 7).
- **No pagination.** The stores list and the previous-markets list come whole (row 23).
- **No `Retry-After` handling** on a 429 from the external services; the backoff is fixed (row 20).

## Screens

- **Filters live in page state**, not in the address bar: a filtered view cannot be linked to or restored on reload.
- **The map frames the boundary.** Portfolio stores outside it are reached by zooming out or by picking them in the
  list.
- **Markers are SVG**, fine to a few thousand; beyond that the canvas renderer and a map-area filter go together (row 23).
- **The header shows no service status** on purpose. Each screen says, in its own words, when its own request cannot
  reach the service; `/api/health` exists for the balancer and the tests.
