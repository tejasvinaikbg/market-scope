# Deployment plan — from one laptop to a million users, in stages

The rule throughout: the same code runs at every stage; each stage adds infrastructure and changes environment variables.
The code-side knobs already exist (the configuration reference). Capacity numbers are in
[the register](upgrade-register.md). Everything in a stage is a prerequisite for the next.

## Stage 0 — local (today)

One process runs the API and the worker; Postgres in Docker on 5432; the browser reaches the API through the Next rewrite.
Environment: all defaults. Anything committed or shared says 5432.

## Stage 1 — first deployment (tens to hundreds of users)

| Piece | Choice | Environment |
|---|---|---|
| Database | managed Postgres with PostGIS; a pooler (PgBouncer or the provider's) | `DATABASE_URL` to the pooler, `DB_POOL_MAX=20` |
| API | one container from `apps/api/Dockerfile` | `JOBS=off`, `TRUST_PROXY=1`, `CORS_ORIGIN=https://app.example.com`, `RATE_LIMIT_PER_MINUTE=120` |
| Worker | one container from the same image, `node src/worker.ts` | `JOBS` irrelevant; `PLACES=live`, `NOMINATIM_USER_AGENT` a real contact |
| Web | the standalone image from `apps/web/Dockerfile`, or a static host | `NEXT_PUBLIC_API_URL=https://api.example.com` |
| Edge | a CDN or the host's proxy in front of both; TLS; `Cache-Control` honoured | — |
| Observability | logs shipped from stdout; alerts on 5xx rate and on `/api/health` 503 | — |

Checklist before the first traffic: migrations run from a release step (`node src/db/migrate.ts` in the API image), not at
container start; secrets in the platform's store, not in files; `/api/health` wired as the readiness probe; graceful shutdown tested
(the worker stops before the database closes).

## Stage 2 — thousands of concurrent users

- Several API instances behind the load balancer. The API keeps nothing in memory that matters, so this is a scaling knob.
- The rate limiter's store moves from memory to Redis (`rate-limit-redis`), or a per-instance limit is accepted and set lower.
- Two or three workers. `SKIP LOCKED` makes them safe; `JOB_STALE_MINUTES` makes a dead one recoverable.
- `TILE_CACHE_HOURS` raised to 72: the cache is what keeps discovery inside the external limits as markets multiply.
- Uploads move to object storage and are parsed by the worker (register row 7) if uploads become frequent.
- Metrics: request latency, job duration, queue depth from `/api/health`, external-call error rate.

## Stage 3 — a million users

The application tier scales by instances; the two things that do not are the database and the external services.

- **Database**: read replicas for dashboard reads; the market's `store_count` becomes a maintained column (row 13); partition
  `discovered_stores` by market if it reaches hundreds of millions of rows.
- **External services**: at this volume public OSM mirrors are not an option. Either self-hosted Overpass and Nominatim
  (a machine each, with data refreshed nightly) or Google Places with a paid quota and a budget alert. The grid cache
  stays and does most of the work either way.
- **Status**: server-sent events replace polling (row 12), behind a proxy configured for long responses.
- **Queue**: if pickup latency or fan-out becomes a problem, BullMQ on Redis or SQS with the `jobs` table as the outbox (row 11).
- **Identity**: authentication and per-user quotas (row 16) — the brief assumed one user; a million of them need names.

## What never changes

The routes, the services, the queries, the providers and the screens. Every item above is an environment variable, a
container, or a managed service placed around them.
