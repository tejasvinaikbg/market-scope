# Limitations

What was deliberately left out or simplified, what is wrong or surprising today, and what comes next. Each
shortcoming names the register row in [PRODUCTION.md](PRODUCTION.md) that would lift it.

## Shortcomings

### Scope

- **Single user.** No authentication, no per-user data, no quotas. The brief assumes one user (row 16).
- **Public OpenStreetMap services by default.** Nominatim and Overpass on public mirrors, at their limit of one request
  per second per process: roughly one market every six seconds and one address a second, for everyone. Google Places
  (New) and Google Geocoding lift both sides for markets that choose them, at a price per request and behind a key;
  a city's box still comes from Nominatim (rows 9, 21).
- **Editing is a fresh run.** Editing a market rewrites its decisions, discards what was found and runs again. There is
  no diff, no history of earlier runs.

### Data

- **Same category, or it is not the same shop.** Matching pairs a portfolio store with the nearest discovered store of
  the same category within 150 m. The brief says only "within 150 m"; the rule was added because the sample's FreshMart
  sits 104 m from a pharmacy. Names are not compared, so a different supermarket 127 m away still pairs (row 27).
- **Geocoding is free-text and bounded to the city.** An address the lookup cannot place inside the city box stays
  unlocated and is retried on the next run. Some real streets are missed that way; a structured query and a
  neighbourhood-level fallback are row 22.
- **A workbook's rich text and formulas are flattened to text**; a cell error becomes an empty value.
- **The tile cache expires by age only.** No purge, no way to force a fresh answer before the 24 hours (row 18).

### Runtime

- **Polling, twice.** The dashboard asks for the market every two seconds while a run is in flight, and for the stores
  list beside it, so stores appear as they are found; the worker polls the jobs table every two seconds. Cost scales with
  runs in progress, not users (rows 10, 12).
- **Limits counted per process.** The inbound rate limit counts per API instance; the outbound throttle is per worker
  process, so two workers make twice the rate the mirrors allow (rows 6, 19).
- **A worker claims every job type** and parks the ones it cannot handle as failed (row 24).
- **File parsing runs in the request**, CPU-bound, acceptable under the 5 MB cap (row 7).
- **No pagination.** The stores list and the previous-markets list come whole (row 23).
- **No `Retry-After` handling** on a 429 from the external services; the backoff is fixed (row 20).

### Screens

- **Filters live in page state**, not in the address bar: a filtered view cannot be linked to or restored on reload.
- **The map frames the boundary.** Portfolio stores outside it are reached by zooming out or by picking them in the
  list.
- **Markers are SVG**, fine to a few thousand; beyond that the canvas renderer and a map-area filter go together (row 23).
- **The header shows no service status** on purpose. Each screen says, in its own words, when its own request cannot
  reach the service; `/api/health` exists for the balancer and the tests.

## Known issues

Things that are wrong or surprising today, with what to expect and what would fix them.

- **A worker that dies mid-run leaves its job `running`.** It is taken over after `JOB_STALE_MINUTES` (15) and the market
  runs again from the start, so an interrupted run can take up to fifteen minutes longer. A worker heartbeat with a
  short lease would shorten that (register row 17).
- **Any process with `JOBS=on` that can reach a database is a worker for it.** A second API pointed at the same database
  claims the jobs the first one queues. The route tests own a database and a container no server points at for exactly
  this reason; the same discipline applies to environments (rows 24 to 26).
- **Overpass answers a timed-out query with HTTP 200 and a remark.** It is treated as transient and retried, which makes
  a busy mirror slow rather than wrong; a run can end `partial` with the cells named. "Run again" is the recovery.
- **A city's box always comes from Nominatim.** It is looked up once per city, before any market exists to choose a
  geocoder, and cached on the city row; only a market's addresses go to the geocoder it chose.
- **Route test suites share one database and run one file at a time.** In parallel, the discovery suite's job runner
  drained other suites' queued jobs and polluted the tile cache about one run in four.
- **The match distance label follows the shared default.** `MATCH_DISTANCE_M` overridden in the environment changes the
  rule but not the "Matched ≤150 m" chip, which reads the constant in `packages/shared`.
- **`helmet`'s content security policy is off on the API** because Swagger UI needs inline scripts. The API serves JSON
  otherwise; the web app carries its own policy.
- **Two icon packages, one cast.** `lucide` and `lucide-react` ship the same shapes with differently strict types;
  one cast in `categoryIcons.tsx` bridges them, because Leaflet needs HTML and React needs components.
- **Leaflet's stylesheet is unlayered.** Any rule that must beat it, such as the marker badges, lives outside Tailwind's
  layers with a two-class selector; a layered rule loses silently. Map tiles are light in both themes, so everything
  drawn on them uses a fixed light palette.
- **Markets created before the job queue existed** (a development artefact) show "queued" forever. They are not busy,
  so they can be run again, edited or deleted.

## Roadmap

In the order they would be done, with the reason for each.

1. **Match quality.** A name-similarity check (`pg_trgm`) as a tie-breaker and a threshold, so a different shop of the
   same category 127 m away is no longer a confident pair.
2. **Geocoding quality.** A structured query, then a neighbourhood-level fallback stored with a precision flag.
3. **Production hardening**, in the order the [production plan](PRODUCTION.md) gives: worker claims filtered by type,
   `Retry-After` honoured, a heartbeat lease on jobs, server-sent events for status, and the rest of the register as
   its triggers are met.
4. **Filters in the address bar**, so a filtered dashboard can be linked to and survives a reload.

Done since the first draft: container images for the API, the worker and the web app, a CI workflow, the end-to-end run, and lint and format.

Not planned: multi-market comparison and authentication, which the brief puts out of scope.
