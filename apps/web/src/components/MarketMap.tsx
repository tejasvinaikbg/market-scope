'use client';
/**
 * The dashboard's map: the boundary as the solid rectangle, one marker per store — a round badge whose colour is the
 * layer and whose icon is the category, the way a map app marks a cafe with a cup, with a check at its shoulder when the
 * store found its discovered twin and a dashed line to that twin — the store's name, category and match on hover, and the
 * legend that speaks the chips' words. The rows arrive already filtered — the map draws what it is given,
 * the same rows as the list. `selectedId` is the store picked in either view: its badge is larger and ringed, its label
 * stays open, and a click on any badge reports it up. `focus` is set only for a pick made in the list; the map moves to it.
 */
import { MapContainer, TileLayer, Rectangle, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Check, createElement } from 'lucide';
import { useEffect } from 'react';
import type { Bbox, LatLng } from '@market-scope/shared';
import type { Store, StoreLayer } from '@/api/hooks';
import { LAYERS, LayerSwatch } from './layers';
import { categoryIconHtml } from './categoryIcons';
import { Fit, toBounds } from './MapFit';
import 'leaflet/dist/leaflet.css';

// The badge's look per layer is CSS (globals.css); the user's own stores sit above what was discovered.
const LOOK: Record<StoreLayer, { className: string; zIndexOffset: number }> = {
  discovered: { className: 'store-pin store-pin-discovered', zIndexOffset: 0 },
  portfolio_inside: { className: 'store-pin store-pin-inside', zIndexOffset: 100 },
  portfolio_outside: { className: 'store-pin store-pin-outside', zIndexOffset: 100 },
};

// One Leaflet icon per (layer, category), made on first use and shared by every marker that needs it.
// The picked store's badge is larger, ringed, and above everything else. A matched store wears a check at its shoulder.
const checkHtml = () => `<span class="store-pin-check">${createElement(Check, { width: 9, height: 9, 'stroke-width': 3.5 }).outerHTML}</span>`;
const icons = new Map<string, L.DivIcon>();
const pin = (layer: StoreLayer, slug: string | null, picked: boolean, matched: boolean) => {
  const key = `${layer}:${slug ?? ''}:${picked}:${matched}`;
  let icon = icons.get(key);
  if (!icon) {
    const size = picked ? 32 : 26;
    icon = L.divIcon({
      className: `${LOOK[layer].className}${picked ? ' store-pin-picked' : ''}`,
      html: categoryIconHtml(slug, picked ? 16 : 14) + (matched ? checkHtml() : ''),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [0, -size / 2 - 1],
    });
    icons.set(key, icon);
  }
  return icon;
};

/** What the label under a badge says: the name, the category, and the twin it was matched to. */
const label = (s: Store) => `${s.name}${s.category ? ` · ${s.category.name}` : ''}${s.match ? ` · matched to ${s.match.name}, ${s.match.distanceM} m` : ''}`;

/** Moves to the store picked in the list. Keyed on the object, so picking the same store again still recentres. */
function Focus({ at }: { at: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (at) map.setView([at.lat, at.lng], Math.max(map.getZoom(), 16));
  }, [map, at]);
  return null;
}

export default function MarketMap({
  boundary,
  stores,
  focus,
  selectedId,
  onSelect,
}: {
  boundary: Bbox;
  stores: Store[];
  focus: LatLng | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // A matched pair is joined by a line when both ends are on the map (the discovered layer may be off).
  const byId = new Map(stores.map((s) => [s.id, s]));
  const pairs = stores.flatMap((s) => {
    const twin = s.match && byId.get(s.match.id);
    return twin ? [[s, twin] as const] : [];
  });
  return (
    <>
      <div className="min-h-0 flex-1">
        <MapContainer center={[12.97, 77.59]} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* The tiles are light in both themes, so the map palette never changes with the theme; the boundary wears a white casing under the accent line. */}
          <Rectangle bounds={toBounds(boundary)} pathOptions={{ color: 'var(--map-surface)', weight: 7, fill: false, opacity: 0.9 }} interactive={false} />
          <Rectangle bounds={toBounds(boundary)} pathOptions={{ color: 'var(--map-accent)', weight: 3, fillOpacity: 0.05 }} interactive={false} />
          {pairs.map(([s, twin]) => (
            <Polyline
              key={`pair:${s.id}`}
              positions={[
                [s.lat, s.lng],
                [twin.lat, twin.lng],
              ]}
              pathOptions={{ color: 'var(--map-match)', weight: 2, dashArray: '4 4' }}
              interactive={false}
            />
          ))}
          {stores.map((s) => {
            const picked = s.id === selectedId;
            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={pin(s.layer, s.category?.slug ?? null, picked, s.match !== null)}
                zIndexOffset={picked ? 1000 : LOOK[s.layer].zIndexOffset}
                eventHandlers={{ click: () => onSelect(s.id) }}
              >
                {/* The picked store keeps its label open; the others show theirs on hover. The key remounts the label when that changes. */}
                <Tooltip key={String(picked)} permanent={picked}>
                  {label(s)}
                </Tooltip>
              </Marker>
            );
          })}
          <Fit bbox={boundary} />
          <Focus at={focus} />
        </MapContainer>
      </div>
      <div className="caption flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="inline-block w-5 border-t-2 border-map-accent" /> Boundary
        </span>
        {LAYERS.map((l) => (
          <span key={l.id} className="flex items-center gap-2">
            <LayerSwatch layer={l.id} /> {l.label}
          </span>
        ))}
        <span>Colour is the layer, the icon is the category, the check is a match</span>
      </div>
    </>
  );
}
