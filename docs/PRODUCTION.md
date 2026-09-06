# Production

Three documents, one idea: the same code runs at every stage, and what changes is the infrastructure around it and the
environment variables that point at it.

- **[Deployment plan](production/deployment-plan.md)** — four stages from one laptop to a million users: what runs where,
  which variables change, and the checklist before the first real traffic.
- **[Scaling limits](production/scaling-limits.md)** — every design choice that is right at today's size and wrong at some
  larger size: what makes it bite, the options with their pros and cons, the pick, and the number that triggers it.
- **[Upgrade register](production/upgrade-register.md)** — the same items as a table: what exists in code today, what
  would replace what, locally and deployed, with the capacity the current shape holds.

## The short version

The first deployment is the API and the worker as two services from one image, a managed Postgres with PostGIS behind a
connection pooler, the web app built with `NEXT_PUBLIC_API_URL` pointing at the API's own domain, and a CDN in front.
Migrations run from a release step, secrets live in the platform's store, `/api/health` is the readiness probe.

The application tier scales by instances because it holds no state: sessions live in the browser, jobs in the database,
and the queue is safe for many workers. Two things do not scale that way. The database gets replicas, a maintained
store count and, much later, partitioning. The external services are the hard ceiling: the grid cache does most of the
work, and past a few hundred markets a day the choice is self-hosted OpenStreetMap data or a paid provider.

## What a million users at once would break, in order

1. The connection pool: ten per instance. A pooler and more instances.
2. The single Node process: CPU on JSON, memory on uploads. Instances, and uploads to object storage.
3. The web server in the path of every API call, locally. Deployed, the browser calls the API directly.
4. The external services, absolutely. Cache, then own the data or pay for it.
5. Polling: a million dashboards every two seconds. Server-sent events fed by `LISTEN/NOTIFY`.

Every knob these need already exists as an environment variable with a local default; see [CONFIGURATION.md](CONFIGURATION.md).
