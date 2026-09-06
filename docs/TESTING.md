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

## Coverage

`npm run test:coverage` runs the unit and component suites with coverage: `c8` over `node:test` for the shared package
and the API, Jest's own for the web app. Each prints a summary and writes `coverage/lcov.info` in its workspace, which
CI uploads as an artifact. Measured over the source, not the tests; the API's entry points, migrations and seeds are
excluded because they are exercised by the route suites and the release step, not by unit tests.

## End to end

`npm run test:e2e` starts the API and the web app for the run, against the fixture providers and a database of the
tests' own (`<test database>_e2e` on the route tests' container, prepared as the API starts), on ports 4210 and 3210
beside the development ones. The web app builds into `.next-e2e`, so a running dev server is untouched. One flow does
what a person does: upload, define a market, watch the run finish, read the dashboard, pick a store, run again, find it
in the list, delete it; a second checks a bad file is refused; a phone project checks the screens fit. About a minute.

## In CI

`.github/workflows/ci.yml` runs the same commands on every push: typecheck, `npm run lint`, `npm test`, the route suites against a
`postgis/postgis:16-3.4` service container, then the end-to-end run, then a second job builds both container images
without pushing. Nothing in the file is specific to a machine or a person: the throwaway database's user and name and
the `User-Agent` come from repository variables (`CI_DB_USER`, `CI_DB_NAME`, `CI_NOMINATIM_USER_AGENT`), its password
from a repository secret (`CI_DB_PASSWORD`), and each has a fallback so a fresh fork runs as is.
