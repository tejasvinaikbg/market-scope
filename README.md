# MarketScope

Upload a portfolio of stores, draw a market on a map, and see every store the map data knows about inside it, next to
your own, with the ones that are the same shop paired up.

It is a take-home exercise built as a small production-shaped system: a Next.js app, an Express API with a job worker,
PostgreSQL with PostGIS, and free OpenStreetMap services behind provider interfaces.

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Running without the internet](#running-without-the-internet)
- [Scripts](#scripts)
- [Ports](#ports)
- [Documentation](#documentation)
- [Status](#status)
- [Data sources and attribution](#data-sources-and-attribution)

## What it does

1. **Upload a portfolio.** A CSV or XLSX with `store_name, address, city, state, country, category` and optional
   `latitude, longitude`. Headers and rows are validated before anything is stored; every problem names its row and column.
2. **Set up a market.** Pick a city from seeded lists, pick categories, and drag a rectangle on the map. The area is capped
   at 30 km²; the boundary turns red past it. Creating the market queues a run.
3. **Watch the dashboard.** The run locates your address-only stores, places every store inside or outside the rectangle,
   discovers the stores in the area, and pairs each of yours with the nearest discovered store of the same category
   within 150 m. Layers toggle independently; the list and the map show the same rows; a picked store is marked in both.

A finished market can be run again, edited, or deleted. Nothing can touch it while a run is in flight.

## Quick start

Prerequisites: **Node 24** (`.nvmrc`), **Docker** with Compose, and a free port each for the web app, the API and Postgres.

```bash
git clone <this repository> market-scope && cd market-scope
npm install
cp .env.example .env
```

Edit `.env`: set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and the matching `DATABASE_URL`, and put a real
contact address in `NOMINATIM_USER_AGENT`. The OpenStreetMap services refuse placeholders such as `example.com`.

```bash
npm run db:up                 # Postgres + PostGIS in Docker
npm run migrate               # schema
npm run seed:run              # countries, states, cities, categories
npm run dev                   # API on 4200 and web on 3200
```

Open <http://localhost:3200>, upload `apps/api/fixtures/sample_portfolio_bengaluru.csv`, choose India → Karnataka →
Bengaluru and a category or two, and create the market. The first run makes real calls to Nominatim and Overpass and takes
about half a minute; later runs over the same area come from the tile cache.

The API's interactive reference is at <http://localhost:4200/api/docs> and its health at <http://localhost:4200/api/health>.

## Running without the internet

Set `GEOCODER=fixture` and `PLACES=fixture` in `.env`. Both providers then answer from `apps/api/fixtures/` with a small,
consistent set of Bengaluru data, enough to walk every screen and see a matched pair. The tests always run this way.

## Scripts

All from the repository root.

| Script | What it does |
|---|---|
| `npm run dev` | API and web together, with live reload |
| `npm run db:up` / `npm run db:down` | start or stop the Postgres container |
| `npm run migrate` / `npm run seed:run` | bring the schema up to date / load reference data |
| `npm run migrate:make -- <name>` | new migration file (write it, then run `migrate`) |
| `npm run typecheck` | TypeScript across every workspace |
| `npm run lint` | ESLint and a Prettier check across the repository; `npm run lint:fix` applies both |
| `npm test` | unit and component tests: shared package, API, web |
| `npm run test:coverage` | the same, with coverage summaries and `lcov` reports per workspace |
| `npm run test:integration` | API route tests against their own Postgres container |
| `npm run test:e2e` | the end-to-end run: the real screens over the API, fixture providers, its own database |
| `npm run db:test:down` | remove that test container |
| `npm run worker -w apps/api` | the job worker as its own process (with `JOBS=off` on the API) |
| `docker compose --profile app up -d --build` | the whole stack from the container images: API, worker, web, Postgres |

## Ports

| Port | Service | Set by |
|---|---|---|
| 3200 | Web app (Next.js) | `apps/web/package.json` |
| 4200 | API (Express) | `PORT` |
| 5432 | PostgreSQL for development | `POSTGRES_PORT` and `DATABASE_URL` |
| 5433 | PostgreSQL for the route tests | `POSTGRES_TEST_PORT` and `TEST_DATABASE_URL` |

If a port is taken on your machine, change it in `.env` only; every shared file keeps these defaults.

## Containers

Two images, built from the repository root: `apps/api/Dockerfile` serves the API and, with `node src/worker.ts`, the
worker; `apps/web/Dockerfile` builds the web app as a self-contained Next.js server. Node 24 runs the API's TypeScript
sources directly, so the API image carries no compiler.

```bash
docker compose --profile app up -d --build                               # db, api, worker, web
docker compose --profile app run --rm api node src/db/migrate.ts         # schema and reference data, as a release step
```

The web app is then on 3200 and the API on 4200 (`WEB_PORT` and `API_PORT` in `.env` change that). Inside the network
the API reaches Postgres as `db:5432` and the web server forwards `/api/*` to `api:4200`. Both of the web image's
addresses are build arguments, because Next compiles them in: `API_URL` for that forward, and `NEXT_PUBLIC_API_URL`
when the browser should call the API's own domain instead.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, lint and format check, the unit and component
suites, the route suites against a PostGIS service container in a database of their own, the end-to-end run, then both
images are built.

## Documentation

| Document | For |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | how the pieces fit, with diagrams, the run pipeline and the data model |
| [High-level design](docs/design/HLD.md) | today's shape and how it changes at a million and ten million users, with the trade-offs |
| [Low-level design](docs/design/LLD.md) | modules, contracts, the state machine, sequences, the SQL that carries the product |
| [Database](docs/DATABASE.md) | every table and column, the links between them, and who reads and writes what |
| [Configuration](docs/CONFIGURATION.md) | every environment variable, its default and when to change it |
| [API](docs/API.md) | the endpoints in one page; the live reference is `/api/docs` |
| [Testing](docs/TESTING.md) | the suites, how they isolate themselves, what the fixtures are |
| [Shortcomings](docs/SHORTCOMINGS.md) | what was deliberately left out or simplified, and why |
| [Known issues](docs/KNOWN-ISSUES.md) | things that are wrong or surprising today |
| [Roadmap](docs/ROADMAP.md) | what comes next, in order |
| [Production](docs/PRODUCTION.md) | the deployment plan by stage, each scaling limit with its options, and the upgrade register |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | symptoms, causes and fixes for the things that go wrong locally |
| [Contributing](docs/CONTRIBUTING.md) | the conventions the code follows |

## Status

Built and verified: upload, market setup, discovery with an in-database job queue and a tile cache, geocoding and
placement, the dashboard with four layers, matching, run again, edit and delete; container images, a compose profile
for the stack, CI. Test counts at the time of writing: 14 shared, 49 API unit, 45 API route, 51 web, 3 end-to-end.

Not built yet: the Google Places and Geocoding providers, offered in the setup screen as "not configured". See the
[roadmap](docs/ROADMAP.md).

## Data sources and attribution

Store discovery uses the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) and address lookup uses
[Nominatim](https://nominatim.org/), both on public mirrors under their usage policies: one request per second, an
identifying `User-Agent`, results cached. Map tiles come from OpenStreetMap. Data is © OpenStreetMap contributors, under
the [ODbL](https://www.openstreetmap.org/copyright).

This repository is a private take-home exercise; no licence has been granted for reuse.
