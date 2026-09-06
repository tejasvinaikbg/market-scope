'use client';
/**
 * Map panel: the city outline as a dashed reference, the market boundary as a solid rectangle with five drag handles —
 * blue while it is drawn, red once it is over the cap — and the design's legend. Geometry is not computed here: the
 * handles call the shared maths and hand the result up; the colour asks the same maths the area figure uses.
 */
import { MapContainer, Rectangle, Marker } from 'react-leaflet';
import { BaseLayer } from './BaseLayer';
import * as L from 'leaflet'; // namespace import: the ES build (see next.config) has no default export
import { useRef } from 'react';
import { Square } from 'lucide-react';
import { bboxFromCorners, translateBbox, bboxAreaSqKm, MAX_MARKET_AREA_SQ_KM, type Bbox, type LatLng } from '@market-scope/shared';
import type { CityBounds } from '@/api/hooks';
import { Fit, toBounds } from './MapFit';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker is an image that bundlers lose; a div with a class is styled in globals.css instead.
// Two sets: the handles turn red with the rectangle once the boundary is over the cap.
const handles = (over: boolean) => ({
  corner: L.divIcon({ className: `boundary-handle${over ? ' boundary-handle-over' : ''}`, iconSize: [12, 12] }),
  centre: L.divIcon({ className: `boundary-handle boundary-handle-move${over ? ' boundary-handle-over' : ''}`, iconSize: [14, 14] }),
});
const HANDLES = { fine: handles(false), over: handles(true) };

// The four corners: where the handle sits, and the opposite corner that stays fixed while it is dragged.
const CORNERS = [
  { key: 'sw', at: (b: Bbox): LatLng => ({ lat: b.south, lng: b.west }), anchor: (b: Bbox): LatLng => ({ lat: b.north, lng: b.east }) },
  { key: 'se', at: (b: Bbox): LatLng => ({ lat: b.south, lng: b.east }), anchor: (b: Bbox): LatLng => ({ lat: b.north, lng: b.west }) },
  { key: 'nw', at: (b: Bbox): LatLng => ({ lat: b.north, lng: b.west }), anchor: (b: Bbox): LatLng => ({ lat: b.south, lng: b.east }) },
  { key: 'ne', at: (b: Bbox): LatLng => ({ lat: b.north, lng: b.east }), anchor: (b: Bbox): LatLng => ({ lat: b.south, lng: b.west }) },
];

/**
 * The solid rectangle and its handles. Each drag remembers what was true at dragstart — the anchor corner, or the whole box
 * and the grab point — and recomputes from that on every move, so a handle dragged past its anchor flips cleanly.
 */
function EditableBoundary({ boundary, onChange }: { boundary: Bbox; onChange: (b: Bbox) => void }) {
  const start = useRef<{ box: Bbox; grab: LatLng; anchor: LatLng } | null>(null);
  const centre: LatLng = { lat: (boundary.south + boundary.north) / 2, lng: (boundary.west + boundary.east) / 2 };
  // Blue while it is being drawn, red the moment it is larger than the cap — the same rule the area figure follows.
  const over = bboxAreaSqKm(boundary) > MAX_MARKET_AREA_SQ_KM;
  const icons = over ? HANDLES.over : HANDLES.fine;
  return (
    <>
      <Rectangle bounds={toBounds(boundary)} pathOptions={{ color: over ? 'var(--map-over)' : 'var(--map-draft)', weight: 2, fillOpacity: 0.08 }} />
      {CORNERS.map(({ key, at, anchor }) => (
        <Marker
          key={key}
          position={at(boundary)}
          icon={icons.corner}
          draggable
          eventHandlers={{
            dragstart: () => {
              start.current = { box: boundary, grab: at(boundary), anchor: anchor(boundary) };
            },
            drag: (e) => {
              if (start.current) onChange(bboxFromCorners(start.current.anchor, e.target.getLatLng()));
            },
          }}
        />
      ))}
      <Marker
        position={centre}
        icon={icons.centre}
        draggable
        eventHandlers={{
          dragstart: () => {
            start.current = { box: boundary, grab: centre, anchor: centre };
          },
          drag: (e) => {
            if (!start.current) return;
            const p = e.target.getLatLng();
            onChange(translateBbox(start.current.box, p.lat - start.current.grab.lat, p.lng - start.current.grab.lng));
          },
        }}
      />
    </>
  );
}

export default function CityMap({
  city,
  geocoder,
  boundary,
  onBoundaryChange,
}: {
  city: CityBounds | null;
  geocoder: 'nominatim' | 'google';
  boundary: Bbox | null;
  onBoundaryChange: (b: Bbox) => void;
}) {
  const b = city?.bbox ?? null;
  return (
    <>
      {b && (
        <div className="caption flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-2">
            <Square size={14} />
            {city!.name} · city boundary from {geocoder === 'nominatim' ? 'OSM Nominatim' : 'Google Geocoding'}
          </span>
          {boundary && <span>Drag the corners to resize, the centre to move</span>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {!b && <div className="flex h-full items-center justify-center text-muted">Choose a country, state and city to see its boundary here.</div>}
        {b && (
          <MapContainer center={[12.97, 77.59]} zoom={10} className="h-full w-full" scrollWheelZoom>
            <BaseLayer />
            <Rectangle bounds={toBounds(b)} pathOptions={{ color: 'var(--map-muted)', weight: 1, dashArray: '6 6', fill: false }} />{' '}
            {/* the city: a reference, not editable; map colours never follow the theme */}
            {boundary && <EditableBoundary boundary={boundary} onChange={onBoundaryChange} />}
            <Fit bbox={b} />
          </MapContainer>
        )}
      </div>
      {b && (
        <div className="caption flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="inline-block w-5 border-t-2 border-map-draft" /> Discovery boundary
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-5 border-t-2 border-map-over" /> Over the {MAX_MARKET_AREA_SQ_KM} km² cap
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-5 border-t border-dashed border-map-muted" /> City boundary
          </span>
        </div>
      )}
    </>
  );
}
