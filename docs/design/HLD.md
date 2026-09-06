# High-level design

What the system is made of, how it holds together, and how its shape changes from one laptop to a million users and
beyond. The low-level companion is [LLD.md](LLD.md); the per-limit reasoning is in
[../production/scaling-limits.md](../production/scaling-limits.md).

## Today: one laptop

![System overview](../diagrams/system.svg)

**The flow today.** A request enters through the web server, which serves the page and forwards `/api/*` to the API;
the API validates and reads or writes PostgreSQL; a market's creation leaves a job behind, and the worker, running in
the same process locally, claims it and calls the two OpenStreetMap services at their permitted rate, caching each grid
cell it answers. The browser fetches map tiles itself. The dashed arrow is the deployed path, where the browser calls the
API's own domain.

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 24, TypeScript everywhere, one npm workspace | one language across web, API, worker and the shared package |
| Web | Next.js App Router, React Query, Leaflet, Tailwind tokens | server state and screen state kept apart; light and dark from one palette |
| API | Express 5, zod at the edge, OpenAPI generated from the same schemas | the reference cannot drift from the validation |
| Background work | an in-database queue (`jobs`, `FOR UPDATE SKIP LOCKED`), the same code as a worker | transactional with the market it belongs to; safe for many workers; no second system to run |
| Data | PostgreSQL 16 + PostGIS | area, containment and distance measured by the database, in metres |
| External services | Nominatim and Overpass behind interfaces, with fixture twins; one throttled HTTP client | the public mirrors' limits are the real ceiling, so every call is polite, cached and retried |
| State | none in the API process; the session in the browser, the work in the database | instances can multiply without coordination |

**Capacity of this shape** (one API process, one worker, public mirrors): a few hundred concurrent readers, tens of
concurrent uploads, roughly one market every six seconds and one address a second for everyone, because a 20 km² market
is six grid cells at one Overpass call per second. The tile cache is the one lever: markets in one city share cells.

## A market's run

![The pipeline](../diagrams/pipeline.svg)

**The flow of a run.** Create answers at once with the market queued; the worker claims the job; locate and place need
only the portfolio; discover walks the grid cells, cache first, and writes progress after each; match pairs what was
found with the portfolio; the status is set last, so a dashboard that reads the finished market sees everything.

Four idempotent steps, in order, from one job. Progress is written per grid cell so the dashboard can say "4 of 9 areas";
a failed cell leaves the market `partial` with the cell named rather than failing the run. Matching is the last thing
discovery does before it reports, so a dashboard that reads the finished market already has the pairs.

## First deployment: hundreds of users

The same code as two services from one image, an API with `JOBS=off` and a worker, on a managed Postgres behind a
connection pooler, the web app built with `NEXT_PUBLIC_API_URL` pointing at the API's own domain, a CDN in front.
Migrations run from a release step; secrets in the platform's store; `/api/health` as the readiness probe. Nothing in
the code changes; the [deployment plan](../production/deployment-plan.md) lists the variables per stage.

## A million users

![A million users](../diagrams/prod-1m.svg)

**The flow at a million.** Every request enters through the CDN and the load balancer. Page and API reads hit one of N
stateless API instances, which reach Postgres through PgBouncer and keep their rate-limit counters in Redis. A dashboard
that is watching a run holds one server-sent-events connection instead of polling, fed by Postgres notifications.
Uploads go to object storage and are parsed by a worker. Workers claim jobs from the primary, share one outbound throttle
in Redis, and ask the geo data at the permitted rate, self-hosted or Google. Reads that can be a second old go to the
replicas. Logs and metrics leave every box.

What changes shape, in the order the [scaling limits](../production/scaling-limits.md) say it bites:

| Limit | At a million | Trade-off |
|---|---|---|
| The connection pool and the single process | N stateless API instances behind a balancer, PgBouncer in front of Postgres | free; the code holds no state |
| Reads | read replicas for dashboard reads | a dashboard may read a status a second old |
| Uploads in the request | presigned upload to object storage, parsed by a worker, answered 202 | the upload screen becomes "result in a moment" |
| Status by polling | server-sent events fed by `LISTEN/NOTIFY`, one connection per open dashboard | connections held per instance; proxies must allow long responses |
| Limits counted per process | rate-limit counters and the outbound throttle bucket in Redis; or one worker owns the OSM calls | Redis becomes a dependency |
| The external services | self-hosted Overpass and Nominatim with nightly extracts, or Google with a budget alert | operations work versus cost per call and lock-in |
| Recovery | worker heartbeats and short leases on jobs; claims filtered by type | more bookkeeping on the queue |

Capacity of this shape: bounded by the geo data. Self-hosted, thousands of markets a day; the application tier scales
linearly and the database vertically until the store tables reach hundreds of millions of rows.

## Ten million and beyond

![Ten million](../diagrams/prod-10m.svg)

**The flow at ten million.** The global edge terminates TLS, applies per-tenant rules, serves the static web app and
proxies map tiles. Identity authenticates every request before the regional API tier sees it. Writes go to the region's
partitioned primary; reads to its replicas; uploads go straight from the browser to object storage with a presigned URL.
A create writes the market and its job in one transaction as before, and the outbox relays the job to the broker; worker
pools sized per job type consume it, read hot grid cells from Redis, call the regional geo service at its rate, and write
results back to the primary. The primary's notifications feed the push tier that keeps dashboards live, and its outbox
feeds the event stream other systems read.

At this size the things that were "later" arrive together, and the plan is honest about what each costs.

| Change | Why now | Pros | Cons |
|---|---|---|---|
| Identity and tenants | ten million people need names, quotas and their own data | per-tenant limits, billing, isolation | authentication touches every route; a migration of the single-user tables to tenant-scoped ones |
| Regions | latency and a single region's ceiling | reads served locally; blast radius per region | data placement rules; the geo data per region; cross-region jobs |
| A broker with the jobs table as outbox | fan-out, priorities, worker pools by job type, scaling on depth | proven at any volume; the outbox keeps the market and its job transactional | a second system; the outbox loop to keep consistent |
| Partitioned Postgres by tenant or market | store tables in the billions of rows | maintenance and vacuum per partition; drops are cheap | a partition key in every query; cross-tenant queries become reports |
| Tile cache in Redis, Postgres as the durable copy | cell answers read at memory speed by many workers | hot cells served without a database round trip | two copies to keep in step; memory cost |
| A geo service of its own | the external limit is the ceiling for everyone | self-hosted per region, refreshed nightly; Google as a paid fallback for what OSM lacks | the heaviest operational piece in the system |
| Push for status | millions of open dashboards | connections are a gateway tier's or a vendor's problem | cost per connection; the worker publishes to it as well as to Postgres |
| An event stream | other systems and analytics want "market discovered" | decoupled consumers, replay | beside the queue, never instead of it |

What never changes: routes, services, queries, providers and screens. Every box in the last two diagrams is
infrastructure placed around them, added when its trigger is met and not before. That is the whole design principle: the
code is written for the shape it will have, and configured for the shape it has.
