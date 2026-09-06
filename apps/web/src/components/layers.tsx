/**
 * The store layers in the design's order, and the one vocabulary they share everywhere they appear — the chips that switch
 * them, the tag on each list row, the legend under the map: the same words and the same mark, learnt once. The fourth chip,
 * Matched, is not a layer of its own: it is the portfolio stores that found their discovered twin, asked for beside the
 * layers. Also the words for why one of the user's stores is on the list but not on the map.
 */
import { Check } from 'lucide-react';
import { MATCH_DISTANCE_M } from '@market-scope/shared';
import type { LayerFilter, StoreLayer, UnlocatedStore } from '@/api/hooks';

export const LAYERS: { id: LayerFilter; label: string; tag: string }[] = [
  { id: 'discovered', label: 'Discovered', tag: 'Discovered' },
  { id: 'portfolio_inside', label: 'Portfolio inside', tag: 'Portfolio · inside' },
  { id: 'portfolio_outside', label: 'Portfolio outside', tag: 'Portfolio · outside' },
  { id: 'matched', label: `Matched ≤${MATCH_DISTANCE_M} m`, tag: 'Matched' },
];
export const ALL_LAYERS: LayerFilter[] = LAYERS.map((l) => l.id);
export const layerTag = (id: LayerFilter) => LAYERS.find((l) => l.id === id)?.tag ?? id;

/**
 * A layer's mark: a muted dot for what was discovered, the accent dot for the user's stores inside, a dashed ring for those
 * outside, a check on green for a store that found its twin — in the map's own palette, which never follows the theme, so
 * the swatch is the badge's colour in both themes.
 */
export function LayerSwatch({ layer }: { layer: LayerFilter }) {
  if (layer === 'matched') {
    return (
      <span aria-hidden className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-map-match text-white">
        <Check size={9} strokeWidth={3} />
      </span>
    );
  }
  const look = layer === 'discovered' ? 'bg-map-muted' : layer === 'portfolio_inside' ? 'bg-map-accent' : 'border-2 border-dashed border-map-accent';
  return <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full ${look}`} />;
}

/** Why one of the user's stores is not on the map, in the user's words. */
export const unlocatedReason = (reason: UnlocatedStore['reason']) =>
  reason === 'not_found' ? 'address not found' : reason === 'error' ? 'address lookup failed' : 'not located yet';

/** The type of the three real layers, for the places that never see 'matched'. */
export type { StoreLayer };
