# Production upgrades — the register

Everything deliberately left out of the core build, with the trigger that would make it necessary and what it would replace.
Nothing here is a bug; each is a choice sized to the brief (one user, one market at a time, a few markets a day). Add to
it whenever a decision is made "for now".

Local infrastructure is Docker on the laptop; deployed infrastructure is the managed equivalent. The rule for every row: the
same code runs in both, and the difference is configuration.

## Capacity today (single API instance, one worker, public OSM services)

| Flow | Bound by | Roughly holds |
|---|---|---|
| Browsing: reference data, market reads, dashboard polling | one Node process, Postgres pool of 10 | a few hundred concurrent users |
| Uploads | 5 MB held in memory per request, one CPU parse per upload | tens of concurrent uploads |
| Market creation → discovery | Overpass at ~1 request/second per client; a 20 km² market is 4 tiles | one market every ~5 s, ~700 an hour, **globally** |
| Geocoding  | Nominatim at 1 request/second per client | 3,600 addresses an hour, **globally** |

The external rate limits are the real ceiling. No amount of scaling the app raises them; only caching, self-hosting the data,
or a paid provider does.

## The register

| # | Upgrade | In code? | Trigger | Replaces / adds | Local | Deployed |
|---|---|---|---|---|---|---|
| 1 | API and worker as separate services (`JOBS=off` on API, `npm run worker`) | yes (worker.ts, JOBS) | first deployment | one process doing both | one process | two services, same database |
| 2 | Managed Postgres with a connection pooler (PgBouncer or the provider's) and a bigger knex pool | knob (DB_POOL_MAX) | more than ~50 concurrent requests | pool of 10 to one instance | Docker Postgres | managed Postgres + pooler |
| 3 | Horizontal API instances behind a load balancer | yes (stateless) | one instance's CPU or memory saturates | one process | one process | N stateless instances; nothing is in process memory that matters (session state is in the browser, jobs in the database) |
| 4 | Cache-Control on reference data (`/api/locations`, `/api/categories`, `/api/providers`) and a CDN in front | yes (Cache-Control) | any real traffic | every request hitting Postgres | none | CDN / edge cache |
| 5 | Browser talks to the API's own domain (`NEXT_PUBLIC_API_URL`) instead of the Next rewrite proxy | yes (NEXT_PUBLIC_API_URL, CORS_ORIGIN) | deployment | Next proxying every API call | rewrite to 4200 | direct, with CORS |
| 6 | Inbound rate limiting (`express-rate-limit`) and per-user quotas | yes (rate limit, per instance) | facing the internet; quotas need auth first | nothing | on, generous | on, tuned |
| 7 | Upload to object storage and parse in the worker; answer 202 with a status | infra | files larger than the cap, or many concurrent uploads | in-memory multer + parse in the request | local disk / MinIO | S3-compatible bucket |
| 8 | Tile result cache keyed by (provider, tile, categories) with a TTL of hours | yes (grid + place_tiles) | any market volume: markets in one city overlap heavily | one Overpass call per tile per market | Postgres table | same table, or Redis |
| 9 | Self-hosted Overpass and Nominatim, or Google Places with paid quota | infra | more than a few hundred markets a day, or geocoding more than a few thousand addresses | public OSM mirrors and their per-client limits | not needed | provider decision + budget |
| 10 | Worker wake-up by `LISTEN/NOTIFY` instead of a 2 s poll | infra | pickup latency ever matters | polling | same code | same code |
| 11 | Several workers, then a broker (BullMQ on Redis, or SQS) with the `jobs` table as outbox | infra | jobs queue faster than they drain, or a second service consumes them | one worker on the table | Docker Redis | managed Redis / SQS |
| 12 | Dashboard status by server-sent events instead of polling | infra | many open dashboards while runs are in flight | 1 request / 2 s / tab | same | same, behind a proxy that allows long responses |
| 13 | Maintained `store_count` column instead of a subquery in the market read | infra | thousands of markets in the list | `COUNT` subquery per row | same | same |
| 14 | Event stream (Kafka or SNS) for "market discovered" and similar facts | infra | other systems must consume them | nothing | not needed | add beside the queue, never instead of it |
| 15 | Observability: request metrics, job metrics, queue depth, external-call latency and error rate | partly (health depth, logs) | deployment | pino logs only | logs | logs + metrics + alerts |
| 16 | Authentication and per-user data | infra | more than one user | single-user assumption from the brief | none | identity provider |
| 17 | Recovery of a market stuck at `running` after a worker crash, or done with gaps | yes (stale reclaim; run again on any finished market) | first crash or first 504 | nothing | run again | worker heartbeat + reclaim of stale `running` jobs |
| 18 | Tile cache housekeeping: a periodic purge of entries older than the TTL, and a "refresh" flag on a run again that bypasses the cache for that market | infra (one SQL in a scheduled job; the flag rides on `POST /api/markets/{id}/runs`) | the table grows past what is comfortable, or a user needs today's answer before the TTL | expiry by age only, stale rows overwritten on next use | same | same |
| 19 | Outbound throttle shared across workers (a token bucket in Redis, or one worker dedicated to OSM calls) | infra | more than one worker process: today's throttle is per process, so N workers make N× the rate the mirrors allow | p-throttle inside each provider's client | one worker | shared bucket or a single OSM worker |
| 20 | Honour `Retry-After` on 429 from the external services, and split the inbound limit per route (uploads and market creation stricter than reads) | code (small) | the first 429 with a Retry-After, or abuse of the write routes | fixed backoff; one limit for every route | same | same |
| 22 | Geocoding quality: a structured Nominatim query (street and city as separate fields), then a fallback to the locality alone stored with a precision flag, so a store the geocoder cannot pin to its street still appears at neighbourhood level | code (small) | a real portfolio with more than a few `not_found` rows (the sample already has one: ITPL Main Road, Whitefield) | one free-text query, found or not | same | same |
| 23 | Pagination and a bounding-box filter on `GET /api/markets/{id}/stores` (cursor by layer+name, `bbox=` for the visible map area), with the map switched to its canvas renderer (colours must then be concrete values, not CSS variables) | code (small) | a market with thousands of stores, or list or map rendering that lags | the whole filtered list in one response, SVG markers | same | same |
| 24 | Queue hygiene: `claim()` filtered by the worker's handler types; a `queue` column so a worker takes only its own queue; `locked_by` (host + pid) and `locked_until` on every claim, so who holds a job is visible and a dead holder's lease expires | code (small) | the first deployment with specialised workers, or the first "who took my job" question | every worker takes every job, anonymously | same | same |
| 25 | Tests own their database: `TEST_DATABASE_URL`, created, migrated and seeded by the test runner, never the dev database; CI gets an ephemeral Postgres per run. No server ever runs against it | yes (test/database.ts, test/integration.ts); CI pending | the first shared developer database, and CI | route tests against whatever `DATABASE_URL` says, worker off by convention | a second database in the same Docker Postgres | a service container in CI |
| 26 | Environment isolation for the queue: one database and one set of credentials per environment, the production database unreachable from laptops, the worker's `JOBS=on` refused outside `NODE_ENV=production` unless set on purpose | infra | deployment | one `.env` on one laptop | same code, per-developer `.env` | secrets per environment, network rules |
| 27 | Match quality: a name-similarity check (`pg_trgm`) as tie-breaker and threshold, so a different shop of the same category within 150 m is not a confident pair | code (small) | the first pair a user disputes | distance and category only | same | same |

See the [deployment plan](deployment-plan.md) for the stages, and [scaling limits](scaling-limits.md) for each limit's options with their pros and cons.

## Answering "one million users at once"

It would not hold, and no single-node configuration would. What breaks, in order:

1. **The Postgres pool.** Ten connections per instance queue behind each other; requests time out. Rows 2 and 3.
2. **The instance.** One Node process saturates on CPU for JSON and on memory for uploads. Rows 3, 4, 7.
3. **The proxy.** Every API call passes through the Next server; it becomes a second bottleneck. Row 5.
4. **The external services, and this one is absolute.** A million market creations means millions of Overpass calls; the public
   mirrors would refuse the client long before, and rightly. Rows 8 and 9 are the only answers: cache what overlaps, then
   own the data or pay for it.
5. **Polling.** A million dashboards polling every two seconds is half a million requests a second for status. Row 12.

What already holds at that scale: the API keeps no state in memory, so instances multiply freely; the queue is transactional
and multi-worker safe; discovery is idempotent, so retries and re-runs are harmless; every third-party call is throttled,
identified and retried in one place.
