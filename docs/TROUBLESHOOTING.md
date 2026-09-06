# Troubleshooting

Symptom, cause, fix. Everything here has happened at least once while building this.

## Setting up

**`npm run db:up` fails, or the API says the database is unreachable.**
Docker is not running, or the port in `.env` is taken. `docker ps` should list `market-scope-db`; `lsof -iTCP:5432
-sTCP:LISTEN` shows what holds the port. Change `POSTGRES_PORT` and `DATABASE_URL` together in `.env`.

**Apple Silicon: the Postgres container is slow or will not start.**
Use the Debian-based `postgis/postgis:16-3.4` image, as `docker-compose.yml` does; the `alpine` tags are amd64-only and
run under emulation.

**The API refuses to start and names a variable.**
Configuration is validated at start-up. The message says which variable and why; `NOMINATIM_USER_AGENT` and
`DATABASE_URL` are the usual ones. Compare with `.env.example`.

**`migrate` says the migration directory is corrupt, or a file is missing.**
A migration file was renamed or deleted after it ran. Either restore the file, or fix the row in `knex_migrations` to the
current name. Never create an empty migration and run `migrate` before writing it: the empty file is recorded as done.

## Running

**The setup screen says "Couldn't reach the service".**
The API is not running on 4200, or the web server's proxy points elsewhere (`API_URL`). `curl localhost:4200/api/health`
should answer JSON. Deployed, check `NEXT_PUBLIC_API_URL` and `CORS_ORIGIN` agree on the real domains.

**A city's boundary never appears; the API log shows `406` from Nominatim.**
The mirrors reject a placeholder `User-Agent`. Put a real contact address in `NOMINATIM_USER_AGENT`.

**A market ends "done with gaps", or the log shows `504` or `429` from Overpass.**
A public mirror is busy. Nothing is lost: the areas that answered are kept. Press "Run discovery again"; the cells already
answered come from the cache and only the missing ones are asked for. A second mirror in `OVERPASS_URLS` helps.

**A market has said "queued" for a long time.**
No worker is running: the API was started with `JOBS=off` and no `npm run worker -w apps/api` is up. Or the market is
from before the queue existed. In both cases "Run discovery again" queues it; make sure a worker is running.

**A store you expected to see is missing from the dashboard.**
Discovery keeps only what lies inside the rectangle, and only the chosen categories. Hypermarkets in OpenStreetMap are
mostly tagged as supermarkets, so choose Supermarket to find them. An address-only portfolio store the lookup could not
place is listed under "Not on the map" with the reason.

**The map is bright in dark mode.**
By design: the tiles are light, so everything drawn on them keeps the light palette in both themes.

## Testing

**Route tests fail with markets `running` and no stores, or tiles that were already cached.**
Some process with `JOBS=on` is pointed at the test database. Stop it. The tests are meant to own `db-test` on port 5433.

**`npm run test:integration` cannot reach the test database.**
The container was not started, or the port is taken. `npm run db:test:up` starts it and waits for it to be healthy;
`docker ps` should list `market-scope-db-test-1`.

**Jest crashes mentioning Watchman.**
Watchman is off in `jest.config.mjs`; if a global config re-enables it, run with `--watchman=false`.

**A route test suite passes alone and fails with the others.**
It shares the database with the other files. Count your own rows, never the whole table, and clean up in `after`.
