/**
 * The store layers in the design's order, and the one vocabulary they share everywhere they appear — the chips that switch
 * them, the tag on each list row, the legend under the map: the same words and the same mark, learnt once. Also the words
 * for why one of the user's stores is on the list but not on the map.
 */
import type { StoreLayer, UnlocatedStore } from '@/api/hooks';

export const LAYERS: { id: StoreLayer; label: string; tag: string }[] = [
  { id: 'discovered', label: 'Discovered', tag: 'Discovered' },
  { id: 'portfolio_inside', label: 'Portfolio inside', tag: 'Portfolio · inside' },
  { id: 'portfolio_outside', label: 'Portfolio outside', tag: 'Portfolio · outside' },
];
// "Matched ≤150 m" joins this list with matching; the chips, tags and legend follow by themselves.
export const ALL_LAYERS: StoreLayer[] = LAYERS.map((l) => l.id);
export const layerTag = (id: StoreLayer) => LAYERS.find((l) => l.id === id)?.tag ?? id;

/** A layer's mark: a muted dot for what was discovered, the accent dot for the user's stores inside, a dashed ring for those outside. */
export function LayerSwatch({ layer }: { layer: StoreLayer }) {
  const look = layer === 'discovered' ? 'bg-muted' : layer === 'portfolio_inside' ? 'bg-accent' : 'border-2 border-dashed border-accent';
  return <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full ${look}`} />;
}

/** Why one of the user's stores is not on the map, in the user's words. */
export const unlocatedReason = (reason: UnlocatedStore['reason']) =>
  reason === 'not_found' ? 'address not found' : reason === 'error' ? 'address lookup failed' : 'not located yet';