# Roadmap

In the order they would be done, with the reason for each.

1. **End-to-end browser tests.** Playwright over the three screens against the fixture providers: upload the sample,
   create a market, see the dashboard fill. The maps are verified only by hand today.
2. **Lint and format.** ESLint and Prettier as packages, one `lint` script at the root, run in CI.
3. **The Google providers.** Google Places API (New) for discovery and Google Geocoding for addresses, behind the existing
   `PlacesProvider` and `Geocoder` interfaces; Google Maps JS behind the map component's props. Needs a key with billing
   to verify live; the setup screen already offers both as "not configured".
4. **Match quality.** A name-similarity check (`pg_trgm`) as a tie-breaker and a threshold, so a different shop of the
   same category 127 m away is no longer a confident pair.
5. **Geocoding quality.** A structured query, then a neighbourhood-level fallback stored with a precision flag.
6. **Production hardening**, in the order the [production plan](PRODUCTION.md) gives: worker claims filtered by type,
   `Retry-After` honoured, a heartbeat lease on jobs, server-sent events for status, and the rest of the register as
   its triggers are met.
7. **Filters in the address bar**, so a filtered dashboard can be linked to and survives a reload.

Done since the first draft: container images for the API, the worker and the web app, and a CI workflow.

Not planned: multi-market comparison and authentication, which the brief puts out of scope.
