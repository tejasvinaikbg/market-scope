'use client';
/** Map panel: header strip with the geocoder's bbox, the box as a dashed accent rectangle, the design's legend footer. */
import { MapContainer, TileLayer, Rectangle, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import { Square } from 'lucide-react';
import type { Bbox } from '@market-scope/shared';
import type { CityBounds } from '@/api/hooks';
import 'leaflet/dist/leaflet.css';

const toBounds = (b: Bbox): [[number, number], [number, number]] => [[b.south, b.west], [b.north, b.east]];

/** Fits the camera when the box changes; keyed on values so refetches with equal bounds do not re-fit. */
function Fit({ bbox }: { bbox: Bbox | null }) {
  const map = useMap();
  const key = bbox ? `${bbox.south},${bbox.west},${bbox.north},${bbox.east}` : '';
  useEffect(() => {
    if (!bbox) return;
    const el = map.getContainer();
    const fit = () => { map.invalidateSize(); map.fitBounds(toBounds(bbox), { padding: [24, 24] }); };
    if (el.clientWidth > 0) { fit(); return; }
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) { fit(); ro.disconnect(); } });   // dynamic import can mount at 0 px wide
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function CityMap({ city, geocoder }: { city: CityBounds | null; geocoder: 'nominatim' | 'google' }) {
  const b = city?.bbox ?? null;
  return (
    <>
      {/* Header strip only once there is a box to describe; before that the CTA already says "Select a city". */}
      {b && (
        <div className="caption flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-2"><Square size={14} />
            {geocoder === 'nominatim' ? 'OSM Nominatim' : 'Google Geocoding API'} bbox · {city!.name} — {b.south.toFixed(4)}, {b.west.toFixed(4)} → {b.north.toFixed(4)}, {b.east.toFixed(4)}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {!b && <div className="flex h-full items-center justify-center text-muted">Choose a country, state and city to see its boundary here.</div>}
        {b && <MapContainer center={[12.97, 77.59]} zoom={10} className="h-full w-full" scrollWheelZoom>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {b && <Rectangle bounds={toBounds(b)} pathOptions={{ color: 'var(--accent)', weight: 2, dashArray: '6 6', fillOpacity: 0.06 }} />}
          <Fit bbox={b} />
        </MapContainer>}
      </div>
      {b && (
        <div className="caption flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-dashed border-accent" /> Discovery boundary</span>
          {/* the two portfolio pins join the legend once there are portfolio stores to draw */}
        </div>
      )}
    </>
  );
}