/**
 * The discovery step: the market's boundary is covered with grid cells, each cell is answered from the cache or by the
 * places provider, and what comes back is kept only if it lies inside the boundary and stored under the market. A cell that
 * fails after its retries does not stop the run: the others complete and the market ends 'partial' with the cells named —
 * a market with most of its stores beats a market with none. The cache is what makes the external rate limits survivable:
 * markets in the same city share cells, and a cell answered once serves all of them until it ages out. The last thing the
 * step does, before it reports, is match what it found against the portfolio, so the finished market already carries the pairs.
 */
import { gridCells, pointInBbox } from '@market-scope/shared';
import { config } from '../config.ts';
import { places as defaultPlaces } from '../providers/index.ts';
import type { PlacesProvider } from '../providers/places.ts';
import { marketsQueries, type MarketStatus } from '../queries/markets.ts';
import { discoveryQueries } from '../queries/discovery.ts';
import { matchPortfolio } from './match-portfolio.ts';
import { logger } from '../lib/logger.ts';

export interface DiscoveryDeps {
  places: PlacesProvider;
  log: (message: string, meta?: Record<string, unknown>) => void;
  cacheHours?: number; // default TILE_CACHE_HOURS; 0 asks the source for every cell
}
export interface DiscoveryResult {
  tiles: number;
  cachedTiles: number;
  failedTiles: number;
  stores: number;
  matched: number;
  status: MarketStatus;
}

const defaults: DiscoveryDeps = { places: defaultPlaces, log: (message, meta) => logger.info(meta ?? {}, message) };

export async function discoverStores(marketId: number, deps: DiscoveryDeps = defaults): Promise<DiscoveryResult> {
  const market = await marketsQueries.byId(marketId);
  if (!market) throw new Error(`market ${marketId} not found`);
  const searches = await marketsQueries.categorySearches(marketId);
  const categoriesKey = searches
    .map((s) => s.slug)
    .sort()
    .join(','); // the same cell with other categories is another question
  const cacheHours = deps.cacheHours ?? config.TILE_CACHE_HOURS;
  await marketsQueries.setStatus(marketId, 'running');

  const cells = gridCells(market.boundary); // the same cells the setup screen counted as "≈ N calls"
  const failures: string[] = [];
  const progress = { tiles: cells.length, done: 0, failed: 0 };
  let cachedTiles = 0;
  await marketsQueries.setProgress(marketId, progress);
  for (const [i, cell] of cells.entries()) {
    try {
      const source = deps.places.id; // the real source, which under PLACES=fixture is not the market's choice
      let found = await discoveryQueries.cachedTile(source, cell.key, categoriesKey, cacheHours);
      const cached = found !== null;
      if (!found) {
        found = await deps.places.discover(cell.bbox, searches);
        if (cacheHours > 0) await discoveryQueries.cacheTile(source, cell.key, categoriesKey, found); // 0 means the cache is off entirely
      } else cachedTiles++;
      const inside = found.filter((p) => pointInBbox({ lat: p.lat, lng: p.lng }, market.boundary)); // a cell overhangs the boundary
      await discoveryQueries.upsertStores(marketId, source, inside);
      deps.log('discovery tile done', { marketId, tile: i + 1, of: cells.length, cell: cell.key, cached, stores: inside.length });
    } catch (err) {
      failures.push(`tile ${i + 1}/${cells.length}: ${(err as Error).message}`);
      progress.failed++;
      deps.log('discovery tile failed', { marketId, tile: i + 1, of: cells.length, cell: cell.key, error: (err as Error).message });
    }
    progress.done++;
    await marketsQueries.setProgress(marketId, progress); // after every cell, so the dashboard can show "2 of 6 areas"
  }

  const stores = await discoveryQueries.countForMarket(marketId);
  const matched = await matchPortfolio(marketId, deps.log); // before the status flips: the finished market carries its pairs
  const status: MarketStatus = failures.length === 0 ? 'ready' : failures.length === cells.length ? 'failed' : 'partial';
  await marketsQueries.setStatus(marketId, status, failures.length ? failures.join('; ') : null);
  return { tiles: cells.length, cachedTiles, failedTiles: failures.length, stores, matched, status };
}
