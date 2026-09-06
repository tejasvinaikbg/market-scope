'use client';
/**
 * The dashboard's map: the boundary as the solid rectangle, one marker per store — a round badge whose colour is the
 * layer and whose icon is the category, the way a map app marks a cafe with a cup — the store's name and category on
 * hover, and the legend that speaks the chips' words. The rows arrive already filtered — the map draws what it is given,
 * the same rows as the list. `focus` is the store picked in the list; the map moves to it.
 */
import { MapContainer, TileLayer, Rectangle, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
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
const icons = new Map<string, L.DivIcon>();
const pin = (layer: StoreLayer, slug: string | null) => {
  const key = `${layer}:${slug ?? ''}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = L.divIcon({ className: LOOK[layer].className, html: categoryIconHtml(slug), iconSize: [26, 26], iconAnchor: [13, 13], tooltipAnchor: [0, -14] });
    icons.set(key, icon);
  }
  return icon;
};

/** Moves to the store picked in the list. Keyed on the object, so picking the same store again still recentres. */
function Focus({ at }: { at: LatLng | null }) {
  const map = useMap();
  useEffect(() => { if (at) map.setView([at.lat, at.lng], Math.max(map.getZoom(), 16)); }, [map, at]);
  return null;
}

export default function MarketMap({ boundary, stores, focus }: { boundary: Bbox; stores: Store[]; focus: LatLng | null }) {
  return (
    <>
      <div className="min-h-0 flex-1">
        <MapContainer center={[12.97, 77.59]} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Rectangle bounds={toBounds(boundary)} pathOptions={{ color: 'var(--accent)', weight: 2, fillOpacity: 0.04 }} />
          {stores.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={pin(s.layer, s.category?.slug ?? null)} zIndexOffset={LOOK[s.layer].zIndexOffset}>
              <Tooltip>{s.name}{s.category ? ` · ${s.category.name}` : ''}</Tooltip>
            </Marker>
          ))}
          <Fit bbox={boundary} />
          <Focus at={focus} />
        </MapContainer>
      </div>
      <div className="caption flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface px-4 py-3">
        <span className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-accent" /> Boundary</span>
        {LAYERS.map((l) => <span key={l.id} className="flex items-center gap-2"><LayerSwatch layer={l.id} /> {l.label}</span>)}
        <span>Colour is the layer, the icon is the category</span>
      </div>
    </>
  );
}