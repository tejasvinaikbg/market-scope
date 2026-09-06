/**
 * The discovery step: the market's boundary is cut into tiles, the places provider is asked tile by tile, and what comes
 * back is kept only if it lies inside the boundary and stored under the market. A tile that fails after its retries does
 * not stop the run: the other tiles complete and the market ends 'partial' with the failed tiles named — a market with most
 * of its stores beats a market with none.
 */
import { splitBbox, pointInBbox, DEFAULT_TILE_KM } from '@market-scope/shared';
import { places as defaultPlaces } from '../providers/index.ts';
import type { PlacesProvider } from '../providers/places.ts';
import { marketsQueries, type MarketStatus } from '../queries/markets.ts';
import { discoveryQueries } from '../queries/discovery.ts';
import { logger } from '../lib/logger.ts';

export interface DiscoveryDeps { places: PlacesProvider; log: (message: string, meta?: Record<string, unknown>) => void }
export interface DiscoveryResult { tiles: number; failedTiles: number; stores: number; status: MarketStatus }

const defaults: DiscoveryDeps = { places: defaultPlaces, log: (message, meta) => logger.info(meta ?? {}, message) };

export async function discoverStores(marketId: number, deps: DiscoveryDeps = defaults): Promise<DiscoveryResult> {
  const market = await marketsQueries.byId(marketId);
  if (!market) throw new Error(`market ${marketId} not found`);
  const searches = await marketsQueries.categorySearches(marketId);
  await marketsQueries.setStatus(marketId, 'running');

  const tiles = splitBbox(market.boundary, DEFAULT_TILE_KM);           // the same tiling the setup screen counted as "≈ N calls"
  const failures: string[] = [];
  const progress = { tiles: tiles.length, done: 0, failed: 0 };
  await marketsQueries.setProgress(marketId, progress);
  for (const [i, tile] of tiles.entries()) {
    try {
      const found = await deps.places.discover(tile, searches);
      const inside = found.filter((p) => pointInBbox({ lat: p.lat, lng: p.lng }, market.boundary));   // a way's centre can sit just outside its tile
      await discoveryQueries.upsertStores(marketId, market.placesProvider, inside);
      deps.log('discovery tile done', { marketId, tile: i + 1, of: tiles.length, stores: inside.length });
    } catch (err) {
      failures.push(`tile ${i + 1}/${tiles.length}: ${(err as Error).message}`);
      progress.failed++;
      deps.log('discovery tile failed', { marketId, tile: i + 1, of: tiles.length, error: (err as Error).message });
    }
    progress.done++;
    await marketsQueries.setProgress(marketId, progress);                 // after every tile, so the dashboard can show "2 of 4 areas"
  }

  const stores = await discoveryQueries.countForMarket(marketId);
  const status: MarketStatus = failures.length === 0 ? 'ready' : failures.length === tiles.length ? 'failed' : 'partial';
  await marketsQueries.setStatus(marketId, status, failures.length ? failures.join('; ') : null);
  return { tiles: tiles.length, failedTiles: failures.length, stores, status };
}
