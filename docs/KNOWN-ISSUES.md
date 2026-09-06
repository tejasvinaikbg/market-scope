# Known issues

Things that are wrong or surprising today, with what to expect and what would fix them.

- **A worker that dies mid-run leaves its job `running`.** It is taken over after `JOB_STALE_MINUTES` (15) and the market
  runs again from the start, so an interrupted run can take up to fifteen minutes longer. A worker heartbeat with a
  short lease would shorten that (register row 17).
- **Any process with `JOBS=on` that can reach a database is a worker for it.** A second API pointed at the same database
  claims the jobs the first one queues. The route tests own a database and a container no server points at for exactly
  this reason; the same discipline applies to environments (rows 24 to 26).
- **Overpass answers a timed-out query with HTTP 200 and a remark.** It is treated as transient and retried, which makes
  a busy mirror slow rather than wrong; a run can end `partial` with the cells named. "Run again" is the recovery.
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
