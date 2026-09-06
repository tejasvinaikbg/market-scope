# Database

PostgreSQL 16 with PostGIS. Every point is `geography(Point, 4326)`, so distances are metres on the sphere; every
boundary is `geometry(Polygon, 4326)` with a GIST index, so containment and area are one function call. The schema is
owned by the migrations in `apps/api/src/db/migrations`, applied with `npm run migrate`; the seeds load the location tree
and the categories.

The schema is drawn three ways, so it can be read anywhere: as an entity diagram below, also editable in diagrams.net
([`diagrams/er.drawio`](diagrams/er.drawio)); as DBML for [dbdiagram.io](https://dbdiagram.io)
([`diagrams/schema.dbml`](diagrams/schema.dbml), paste it in); and as a Mermaid diagram further down that GitHub renders
on its own.

![Entity diagram](diagrams/er.svg)

**Reading the diagram.** The location tree runs down the left: a state points at its country, a city at its state, and a
market at its city. `markets`, top centre, is what everything else belongs to: `discovered_stores` to its right and
`market_portfolio_stores` below both point at it and go with it when it is deleted, as does the `jobs` row queued for
it. `market_portfolio_stores` joins a market to a `portfolio_stores` row and carries the placement and, when found, the
discovered store it was matched to, a link that is cleared rather than broken when that store goes. `portfolio_stores`
and `discovered_stores` both point at `categories`, as does `market_categories`, the set a market was asked for.
`place_tiles`, bottom right, belongs to no market: it is the discovery cache, keyed by source, grid cell and category
set, and outlives the markets that filled it.

## The same schema as Mermaid

```mermaid
erDiagram
  countries ||--o{ states : "country_id"
  states ||--o{ cities : "state_id"
  cities ||--o{ markets : "city_id"
  portfolios ||--o{ portfolio_stores : "portfolio_id, cascade"
  portfolios ||--o{ markets : "portfolio_id"
  categories |o--o{ portfolio_stores : "category_id, nullable"
  categories ||--o{ discovered_stores : "category_id"
  categories ||--o{ market_categories : "category_id"
  markets ||--o{ market_categories : "cascade"
  markets ||--o{ discovered_stores : "cascade"
  markets ||--o{ market_portfolio_stores : "cascade"
  markets ||--o{ jobs : "cascade"
  portfolio_stores ||--o{ market_portfolio_stores : "cascade"
  discovered_stores |o--o{ market_portfolio_stores : "matched_store_id, set null"

  countries {
    int id PK
    text code UK
    text name
  }
  states {
    int id PK
    int country_id FK
    text name
  }
  cities {
    int id PK
    int state_id FK
    text name
    geometry_polygon bbox "looked up once"
    geometry_point centre
    timestamptz bbox_fetched_at
  }
  categories {
    int id PK
    text slug UK
    text name
    jsonb osm_selectors "OpenStreetMap tag selectors"
  }
  portfolios {
    int id PK
    text name
    text source_filename
    int row_count
    timestamptz created_at
  }
  portfolio_stores {
    int id PK
    int portfolio_id FK
    int row_number "spreadsheet row, header is 1"
    text store_name
    text address
    text city
    text state
    text country
    text category_raw "exactly what the file said"
    int category_id FK "null when nothing seeded matched"
    geography_point location "null until uploaded or geocoded"
    text location_source "uploaded or geocoded"
    text geocode_status "ok, not_found, error"
    timestamptz geocoded_at
  }
  markets {
    int id PK
    text name
    int portfolio_id FK
    int city_id FK
    geometry_polygon boundary "the rectangle, GIST"
    numeric area_sq_km "measured by PostGIS"
    text places_provider "overpass or google"
    text geocoder_provider "nominatim or google"
    text status "pending running ready partial failed"
    text error
    jsonb progress "tiles done failed"
    timestamptz started_at
    timestamptz completed_at
    timestamptz created_at
  }
  market_categories {
    int market_id PK,FK
    int category_id PK,FK
  }
  discovered_stores {
    int id PK
    int market_id FK
    text provider
    text provider_place_id "unique with market and provider"
    text name
    int category_id FK
    geography_point location "GIST"
    text address
    jsonb tags "everything the source said"
    timestamptz created_at
    timestamptz updated_at
  }
  market_portfolio_stores {
    int market_id PK,FK
    int portfolio_store_id PK,FK
    text placement "inside outside unlocated"
    timestamptz placed_at
    int matched_store_id FK "set null when the store goes"
    real match_distance_m
    timestamptz matched_at
  }
  place_tiles {
    int id PK
    text provider
    text cell_key "grid cell"
    text categories_key "slugs sorted and joined"
    jsonb places "the answer for the whole cell"
    timestamptz fetched_at
  }
  jobs {
    int id PK
    text type "market.pipeline"
    int market_id FK
    jsonb payload
    text status "pending running done failed"
    int attempts
    timestamptz run_after "a retry is a later run_after"
    text last_error
    timestamptz created_at
    timestamptz updated_at
  }
```

## How the tables are used

| Table | Written by | Read by |
|---|---|---|
| `countries`, `states`, `cities` | seeds; `cities.bbox` by the first city lookup | the setup screen's selects; geocoding, to bound address lookups to the city |
| `categories` | seeds | the setup screen; discovery, for the OpenStreetMap selectors |
| `portfolios`, `portfolio_stores` | the upload, in one transaction after the whole file validates; geocoding fills `location` | placement, matching, the dashboard list |
| `markets`, `market_categories` | create and edit; the pipeline updates status, progress, error | everything |
| `discovered_stores` | discovery, upsert per grid cell; cleared by an edit | the dashboard, matching |
| `market_portfolio_stores` | placement (rewritten every run); matching fills the pair | the dashboard, the market's counts |
| `place_tiles` | discovery, once per cell and category set | discovery, for `TILE_CACHE_HOURS` |
| `jobs` | create, edit, run again; the worker's claim, complete and fail | the worker's claim (`FOR UPDATE SKIP LOCKED` over `status, run_after`); the market's `busy` |

Everything that belongs to a market cascades from it, so a delete is one statement, and a matched store that disappears
leaves the placement row with its pair cleared rather than a dangling reference.
