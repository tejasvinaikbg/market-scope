# Scaling limits — each one, when it bites, and the ways out with their trade-offs

A scaling limit is a design choice that is right at today's size and wrong at some larger size. Each entry says what the
limit is, what makes it bite, the options with pros and cons, the one we would pick, and the number that triggers it. The
register (`production-upgrades.md`) holds the same items as a table; the plan (`deployment-plan.md`) places them in stages.

---

## 1. Dashboard status by polling

**The limit.** A dashboard asks for its market every two seconds while the market is being built, and its stores list beside
it once discovery has started, so stores appear as they are found; both stop when the run ends. Cost scales with markets in
progress, not with users; a million users with finished markets make no requests.

**When it bites.** Thousands of dashboards open during runs at the same moment, or a queue deep enough that people watch for
minutes. Roughly: 5,000 concurrent open runs is 5,000 requests a second of status and store reads.

| Option | Pros | Cons |
|---|---|---|
| Keep polling, lengthen the interval as depth grows (2 s, then 5 s, then 15 s) | no new code paths; trivial | latency to the user grows; still one request per tab per interval |
| **Server-sent events**: one open connection per dashboard, the API pushes each change, fed by Postgres `LISTEN/NOTIFY` from the worker | no requests between changes; instant updates; plain HTTP, works through most proxies; no client library | connections are held per API instance, so the tier scales by open connections; proxies must allow long responses; needs a reconnect path (browsers do this natively) |
| WebSockets | two-way, if the dashboard ever needs to send | more moving parts than SSE for a one-way stream; harder through proxies and CDNs |
| Push service (Ably, Pusher, AWS AppSync) | connections are someone else's problem at any scale | cost per connection; a dependency; the worker must publish to it as well as to Postgres |
| Notify instead of watch (email or push when done) | zero connections; right for a queue that is hours deep | not a replacement for the first minute, when the user is looking |

**Pick.** Server-sent events when the trigger is met; notification on top when the queue is deep. **Trigger:** more than a
few hundred open runs at once, or a median wait over a minute.

---

## 2. The external services' rate limits

**The limit.** Public Overpass and Nominatim allow about one request per second per client. A 20 km² market is six cells,
so roughly one market every six seconds and one address a second, for the whole deployment.

**When it bites.** More than a few hundred markets a day, or geocoding more than a few thousand addresses a day. This is
the hard ceiling; nothing in the application tier raises it.

| Option | Pros | Cons |
|---|---|---|
| **The grid cache** (done): a cell answered once serves every market that covers it for a day | free; already in; markets in a city overlap heavily | cold cells still cost a call; first market in a city pays full price |
| Self-hosted Overpass and Nominatim | no per-client limit; data under our control | two servers to run and refresh (planet or country extracts, nightly); operations work; disk and memory |
| Google Places (New) and Google Geocoding | high quotas, better addresses, no operations | cost per call; a budget to watch; a key to protect; provider lock-in for that path |
| Longer cache (72 h or more) | fewer calls | staler stores; a shop that closed last week is still listed |

**Pick.** Cache first (done), then the provider decision when volume demands: Google for speed to market, self-hosting when
volume is steady and cost matters. **Trigger:** more than a few hundred markets a day.

---

## 3. One outbound throttle per process

**The limit.** Each worker process throttles itself to one request a second per service. Two workers make two a second,
which the public mirrors will refuse.

| Option | Pros | Cons |
|---|---|---|
| One worker only | nothing to build | one machine's worth of throughput; no redundancy |
| A shared token bucket in Redis, checked before every outbound call | any number of workers share one limit | a new dependency (Redis); a network round trip per outbound call |
| One worker dedicated to OSM calls, others for everything else | no new dependency; the limit stays in one process | job types must be routed by worker; uneven load |

**Pick.** The dedicated OSM worker until self-hosted or paid providers remove the limit; then a shared bucket if several
workers still need to be polite to one service. **Trigger:** the second worker process.

---

## 4. Inbound rate limit counted per instance

**The limit.** `express-rate-limit` keeps counters in the process's memory. With N instances the effective limit is N times
the configured number, and a client that happens to land on a fresh instance starts from zero.

| Option | Pros | Cons |
|---|---|---|
| Accept it and set the number lower | nothing to build | bursts across instances go unnoticed; limits become approximate |
| Shared store in Redis (`rate-limit-redis`) | one true count across instances | Redis; one round trip per request |
| Rate limiting at the edge (CDN or load balancer rules) | no code; enforced before the API is reached | coarser rules; vendor-specific |

**Pick.** Edge rules for the crude protection, Redis store when per-user quotas arrive with authentication. **Trigger:** the
second API instance.

---

## 5. One database, one pool of ten

**The limit.** Each API instance opens at most ten connections; every read and write goes to one Postgres.

| Option | Pros | Cons |
|---|---|---|
| Bigger pool and a connection pooler (PgBouncer or the provider's) | the cheapest large gain; no code | a pooler in transaction mode breaks session features (none used here) |
| Read replicas for dashboard reads | reads scale out; writes untouched | replication lag: a dashboard may read a status a second old; two connection strings |
| Maintained `store_count` column instead of a subquery per market read | market list stays fast at thousands of markets | one more thing to keep in step, in the same transaction as the insert |
| Partition `discovered_stores` by market | very large tables stay manageable | operational complexity; only at hundreds of millions of rows |

**Pick.** Pooler first, replicas when reads dominate, the column when the list slows. **Trigger:** more than ~50 concurrent
requests per instance; then dashboard read latency.

---

## 6. File parsing in the request

**The limit.** A 5 MB CSV or workbook is held in memory and parsed on the request's thread; that blocks the event loop for
roughly a hundred milliseconds, per upload, per instance.

| Option | Pros | Cons |
|---|---|---|
| Keep the 5 MB cap (done) | bounded cost; simple | larger portfolios cannot be uploaded |
| Upload to object storage, parse in the worker, answer 202 with a status | any file size; no event-loop blocking; the upload screen already knows how to poll a status | the upload screen changes from "result now" to "result in a moment"; object storage is new infrastructure |
| Parse in a worker thread inside the API | no new infrastructure | still holds the file in one instance's memory; threads add complexity for a small gain |

**Pick.** Object storage plus the worker, the day the cap is too small. **Trigger:** a real portfolio over 5 MB, or dozens of
concurrent uploads.

---

## 7. Job pickup by polling the table

**The limit.** The worker asks the jobs table every two seconds. Pickup latency is up to two seconds; each poll is one cheap
indexed query per worker.

| Option | Pros | Cons |
|---|---|---|
| Keep polling | nothing to build; two seconds is invisible next to a run that takes longer | N workers make N polls every two seconds |
| Postgres `LISTEN/NOTIFY`: the insert notifies, the worker wakes at once | instant pickup; no new dependency; polling kept as the fallback | a dedicated connection per worker; notifications are not durable, hence the fallback |
| A broker (BullMQ on Redis, SQS) with the jobs table as outbox | fan-out, priorities, delayed jobs for free | a second system; the outbox loop to keep them consistent |

**Pick.** `LISTEN/NOTIFY` if latency ever matters; a broker only when a second service consumes the work. **Trigger:** pickup
latency becomes user-visible, or a second consumer appears.

---

## 8. The tile cache grows by age only

**The limit.** Expired rows are overwritten when their cell is asked again and otherwise stay; there is no way to force a
fresh answer before the TTL.

| Option | Pros | Cons |
|---|---|---|
| Leave it | bounded by geography × categories; grows slowly | stale rows for cells nobody revisits; no forced refresh |
| A nightly purge of rows past the TTL | table stays tidy; one SQL in a scheduled job | a scheduled job to run somewhere |
| A refresh flag on re-run that bypasses the cache for that market | the user can get today's answer | one more thing on the re-run request (the "run again" endpoint) |

**Pick.** Both small pieces, with a refresh flag on "run again". **Trigger:** the table is noticed, or a user needs today's answer.

---

## 9. The web server proxies every API call (local only)

**The limit.** Locally the browser calls `/api/...` on the web server, which forwards to the API. Deployed that way, the
web server sits in the path of every request.

| Option | Pros | Cons |
|---|---|---|
| Keep the rewrite deployed | one origin, no CORS | the Next server becomes a second bottleneck and a single point of failure for the API |
| **Direct API URL** (done as configuration: `NEXT_PUBLIC_API_URL` + `CORS_ORIGIN`) | the web tier serves pages only; the API scales alone | CORS to configure; the API URL baked into the web build |

**Pick.** Direct, from the first deployment. **Trigger:** deployment.

---

## Not limits: what already scales

The API keeps nothing in memory that matters, so instances multiply freely. The queue is transactional and safe for many
workers. Every pipeline step is idempotent, so retries and re-runs are harmless. Every outbound call is throttled,
identified, timed out and retried in one place. Reference data carries cache headers so a CDN can serve it.
