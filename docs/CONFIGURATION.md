# Configuration

Everything is an environment variable read once at start-up and validated with zod; a bad value fails fast and names the
variable. Locally they live in `.env` at the repository root, which is ignored by git. `.env.example` lists them with the
shared defaults.

## Database

| Variable | Default | Meaning |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | — | the Docker container's user, password and database |
| `POSTGRES_PORT` | `5432` | the port the container publishes |
| `DATABASE_URL` | — | what the API and worker connect to; must agree with the four above locally |
| `POSTGRES_TEST_DB`, `POSTGRES_TEST_PORT`, `TEST_DATABASE_URL` | `…_test`, `5433` | the route tests' own container and database; never one a server points at |
| `DB_POOL_MAX` | `10` | connections per process; raise behind a connection pooler |

## API and worker

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4200` | the API's port |
| `LOG_LEVEL` | `info` | pino level; `silent` in tests |
| `JOBS` | `on` | `on`: this process also runs the queue; `off`: an API that only answers, with `npm run worker -w apps/api` elsewhere |
| `JOB_STALE_MINUTES` | `15` | a job still running after this long is taken over: its worker died |
| `TILE_CACHE_HOURS` | `24` | how long a grid cell's discovery answer serves other markets; `0` disables the cache |
| `MATCH_DISTANCE_M` | `150` | a portfolio store and a discovered store of the same category this close are the same shop |
| `TRUST_PROXY` | `0` | proxy hops in front of the API, so rate limits see the client, not the balancer |
| `CORS_ORIGIN` | blank | the browser origin allowed to call the API directly; blank means none (the local rewrite needs none) |
| `RATE_LIMIT_PER_MINUTE` | `300` | requests per client per minute, counted per API instance; `0` turns it off |

## Data sources

| Variable | Default | Meaning |
|---|---|---|
| `GEOCODER` | `nominatim` | `nominatim` (live) or `fixture` (offline, from `apps/api/fixtures/geocode.json`) |
| `PLACES` | `overpass` | `overpass` (live) or `fixture` (offline, from `apps/api/fixtures/overpass.json`) |
| `NOMINATIM_USER_AGENT` | — | required; a real contact, as the mirrors' policy asks (they answer 406 to placeholders) |
| `OVERPASS_URLS` | two public mirrors | comma-separated; a retry moves to the next one |
| `OVERPASS_ENABLED`, `NOMINATIM_ENABLED` | `true` | switches; off means greyed out on the setup screen and refused by the API |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_GEOCODING_API_KEY` | blank | not used yet; the providers are on the [roadmap](ROADMAP.md) |
| `GOOGLE_PLACES_ENABLED`, `GOOGLE_GEOCODING_ENABLED` | `false` | their switches |

## Web

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | blank | read at build time; blank means the browser calls `/api` on the web server, which proxies to the API (local); deployed, the API's own URL |
| `API_URL` | `http://localhost:4200` | where the web server's proxy forwards `/api/*`; compiled in at build time, so in the web image it is a build argument (default `http://api:4200`, the compose network) |

## In the containers

`docker compose --profile app` sets `DATABASE_URL` to the `db` service, `JOBS=off` on the API (the worker service runs
the queue), and `API_URL=http://api:4200` on the web server; everything else comes from `.env` through `env_file`. The
web image takes `NEXT_PUBLIC_API_URL` and `API_URL` as build arguments: Next inlines the first into the browser bundle
and compiles the second into the server's rewrite, so neither can change at start-up.

## Where each value goes when deployed

The [deployment plan](production/deployment-plan.md) lists the values per stage. In short: `JOBS=off` on the API and a
separate worker, `TRUST_PROXY=1` behind a balancer, `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL` set to the real domains,
`DB_POOL_MAX` raised behind a pooler, secrets in the platform's store rather than a file.
