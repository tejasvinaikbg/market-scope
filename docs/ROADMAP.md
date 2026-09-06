# Roadmap

In the order they would be done, with the reason for each.

1. **Match quality.** A name-similarity check (`pg_trgm`) as a tie-breaker and a threshold, so a different shop of the
   same category 127 m away is no longer a confident pair.
2. **Geocoding quality.** A structured query, then a neighbourhood-level fallback stored with a precision flag.
3. **Production hardening**, in the order the [production plan](PRODUCTION.md) gives: worker claims filtered by type,
   `Retry-After` honoured, a heartbeat lease on jobs, server-sent events for status, and the rest of the register as
   its triggers are met.
4. **Filters in the address bar**, so a filtered dashboard can be linked to and survives a reload.

Done since the first draft: container images for the API, the worker and the web app, a CI workflow, the end-to-end run, and lint and format.

Not planned: multi-market comparison and authentication, which the brief puts out of scope.
