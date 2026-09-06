# Google keys for the Google providers

The setup screen offers Google Places and Google Geocoding as data sources and shows them as "not configured" until a
key is set; the map can draw on Google Maps once its own key is set. This is how to get the keys, restrict them, prove
them, and put them where the code reads them. Nothing here is committed: keys live in `.env`, which git ignores.

## What is needed

| Key | Used by | Google APIs it may call | Variables |
|---|---|---|---|
| Server key | the API and the worker, never the browser | Places API (New), Geocoding API | `GOOGLE_PLACES_API_KEY` and `GOOGLE_GEOCODING_API_KEY`, the same value in both |
| Browser key | the web app, exposed to browsers by design | Maps JavaScript API | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |

Two keys, because a browser key is public and must be restricted by website, while a server key must never reach a
browser and is restricted by API and, deployed, by IP address. Google enforces the split: a key with a website
restriction is refused by the Geocoding and Places web services, so the two cannot be swapped by accident for long.

## Steps

1. **Project.** Open <https://console.cloud.google.com>, create a project (for example `market-scope`) and select it.
   The project id (`market-scope-123456`) appears in every console URL as `?project=`; the links below need it.
2. **Billing.** Billing → link a billing account. Google requires one even inside the free monthly allowance; a card is
   needed. Then Billing → Budgets and alerts → create a budget for the project with alerts at 50%, 90% and 100%. Set a
   small amount; the point is the email before a surprise.
3. **Enable the APIs.** APIs & Services → Library → enable, one by one: **Places API (New)**, **Geocoding API** and
   **Maps JavaScript API** (not the legacy "Places API"). Enabling the first Maps Platform API runs a short onboarding
   that creates an unrestricted key named `Maps Platform API Key`; that key becomes the server key in step 5.
4. **Find the keys.** They are listed at APIs & Services → Credentials, which is
   `https://console.cloud.google.com/apis/credentials?project=<project id>`. The Google Maps Platform section shows the
   same list under Keys & Credentials; its own "APIs & Services" page lists APIs only and has no credentials entry.
5. **Server key.** Click `Maps Platform API Key` (or Create credentials → API key if there is none). The panel has, in
   this order: name, API restrictions, application restrictions.
   - Name: `market-scope server`.
   - Select API restrictions: the drop-down lists only the APIs enabled in the project, with a filter box. Leave
     **Places API (New)** and **Geocoding API** ticked and nothing else, then OK. "Selected APIs" under the box confirms
     the two.
   - Application restrictions: *None* on a laptop; *IP addresses* with the server's egress address when deployed.
   - Save. The Restrictions column of the list now reads "2 APIs".
6. **Browser key.** Create credentials → API key opens the "Create API key" panel with the same fields.
   - Name: `market-scope browser`.
   - Select API restrictions: **Maps JavaScript API** only, then OK.
   - Application restrictions: *Websites*, then Add → Website `http://localhost:3200/*` → Done. Deployed, add
     `https://your-domain/*` as a second row.
   - Create. The key is shown once in an "API key created" panel; afterwards it sits behind *Show key* in the list, where
     the Restrictions column reads "HTTP referrers, 1 API".
7. **Put them in `.env`** at the repository root. The server key goes in both server variables, the browser key in the
   web one:

   ```
   GOOGLE_PLACES_API_KEY=<server key>
   GOOGLE_PLACES_ENABLED=true
   GOOGLE_GEOCODING_API_KEY=<server key>
   GOOGLE_GEOCODING_ENABLED=true
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<browser key>
   ```

   Restart the API and the web app; the setup screen now offers both Google sources, a market that picks them is served
   by them, and the map draws on Google. Deployed, the same names go into the platform's
   secret store; the browser key is a build argument for the web image, like `NEXT_PUBLIC_API_URL`.

8. **Prove each key before building on it.** Read a key out of `.env` with `grep` rather than `source`: the file holds
   values with spaces and brackets (the Nominatim user agent) that a shell cannot parse.

   Geocoding, expected `"status" : "OK"` with Koramangala as the first result:

   ```bash
   K=$(grep '^GOOGLE_GEOCODING_API_KEY=' .env | cut -d= -f2-) && curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=Koramangala,+Bengaluru&key=$K" | head -c 400
   ```

   Places (New), a text search inside a rectangle, which is how the provider asks per grid cell; expected a `places`
   list with names, locations and a `primaryType`:

   ```bash
   K=$(grep '^GOOGLE_PLACES_API_KEY=' .env | cut -d= -f2-) && curl -s -X POST "https://places.googleapis.com/v1/places:searchText" \
     -H "Content-Type: application/json" -H "X-Goog-Api-Key: $K" \
     -H "X-Goog-FieldMask: places.id,places.displayName,places.location,places.formattedAddress,places.primaryType" \
     -d '{"textQuery":"supermarket","includedType":"supermarket","locationRestriction":{"rectangle":{"low":{"latitude":12.92,"longitude":77.60},"high":{"latitude":12.945,"longitude":77.625}}}}' | head -c 600
   ```

   The answer names what is wrong when something is:

   | Answer | Meaning |
   |---|---|
   | `REQUEST_DENIED`, "API keys with referer restrictions cannot be used with this API" | the browser key is in a server variable; put the server key there |
   | `PERMISSION_DENIED` mentioning billing | step 2 is not done |
   | `REQUEST_DENIED` or `PERMISSION_DENIED` saying the key or project is not authorized for the API | the API is not enabled (step 3) or not ticked on the key (steps 5 and 6) |
   | `OK` with an empty `results` or `places` | the key works; the query found nothing |

## Cost, and how the code keeps it small

Google bills per request per SKU, with a free monthly allowance per SKU that changed in March 2025; read the current
numbers on the pricing pages before relying on them. What keeps the bill small here is what already exists for
OpenStreetMap: one request per grid cell, the answer cached for `TILE_CACHE_HOURS` and shared by every market that
covers the cell, and a field mask that asks only for the fields the product uses, which keeps each call in the cheapest
SKU that carries them. The budget alert is the safety net; the register's row 9 is the plan for volume.

## Rotating or revoking

A leaked browser key is limited by its website restriction; a leaked server key is not, so revoke it in Credentials at
once (delete it, or Regenerate key on its page) and issue a new one. Keys are read at start-up: change `.env`, restart
the API and the worker.
