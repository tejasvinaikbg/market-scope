# Testing

Four suites, one command each, no network.

| Suite | Runner | What it covers | Command |
|---|---|---|---|
| Shared package | `node:test` | boundary maths, the file contract | `npm test -w packages/shared` |
| API unit | `node:test` | config, errors, middleware, the HTTP client, providers, file parsing, the app's route table | `npm test -w apps/api` |
| API routes | `node:test` against Postgres | every endpoint end to end: upload, markets, discovery, geocoding, placement, matching, management, jobs | `npm run test:integration` |
| Web | Jest + React Testing Library | every screen and hook, the map stubbed | `npm test -w apps/web` |

`npm test` at the root runs the first, second and fourth. `npm run typecheck` runs TypeScript across all workspaces.

## The route tests own a database

They never touch the development database. `npm run test:integration` starts a second Postgres container, `db-test`
(same image, no volume, so its data dies with it), waits for it, creates the database named in `TEST_DATABASE_URL` if
it is missing, migrates and seeds it, and only then runs the suites with the worker off and the fixture providers on.
The suites run one file at a time because they share that database. `npm run db:test:down` removes the container.

If a suite fails with markets that are `running` with no stores, or with cached tiles nobody asked for, some process
with `JOBS=on` is pointed at the test database. Nothing should be.

## Fixtures

`apps/api/fixtures/` holds the sample portfolio as CSV and XLSX, a failing CSV and XLSX for the validation paths, and the
two provider answer files: `geocode.json` (city boxes and a few addresses) and `overpass.json` (six places around
Koramangala, one of them 122 m from the sample's FreshMart so a matched pair exists). The same files serve offline use.

## Counts at the time of writing

14 shared, 49 API unit, 45 API route, 51 web. Each lesson-sized change states the counts it expects.

## In CI

`.github/workflows/ci.yml` runs the same commands on every push: typecheck, `npm test`, then the route suites against a
`postgis/postgis:16-3.4` service container. There the runner is pointed at that container by `TEST_DATABASE_URL` and
creates the database itself, so nothing is set up by hand. A second job builds both container images without pushing.
