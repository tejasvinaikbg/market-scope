'use client';
/**
 * Step 02 — Market setup: location → categories → data sources → boundary → CTA, with the city map beside it.
 * This is the route file itself. It is a client component because it holds state, uses React Query hooks,
 * and loads the Leaflet map with `ssr: false`, which Next only allows inside client components.
 * The boundary is the user's: it starts as a legal square on the city centre and follows the handles on the map.
 */
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Globe, Map, MapPin, ShoppingBag, Database, Maximize2, RotateCcw, ArrowRight, Crosshair } from 'lucide-react';
import { bboxAreaSqKm, bboxDimensionsKm, estimateDiscoveryCalls, squareAround, padBbox, MAX_MARKET_AREA_SQ_KM, DEFAULT_MARKET_AREA_SQ_KM, type Bbox } from '@market-scope/shared';
import { useLocations, useCategories, useCityBounds, usePortfolioSummary } from '@/api/hooks';
import { useCurrentPortfolio } from '@/app/providers';
import { Field } from '@/components/Field';

const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false, loading: () => <div className="h-full bg-panel" /> });

export default function Page() {
  const locations = useLocations();
  const categories = useCategories();
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stateId, setStateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [places, setPlaces] = useState<'overpass' | 'google'>('overpass');
  const [geocoder, setGeocoder] = useState<'nominatim' | 'google'>('nominatim');
  // The user's edits to the boundary, remembered per city so changing city starts fresh.
  const [draft, setDraft] = useState<{ cityId: number; box: Bbox } | null>(null);

  const country = locations.data?.countries.find((c) => c.id === countryId) ?? null;
  const state = country?.states.find((s) => s.id === stateId) ?? null;
  const city = useCityBounds(cityId).data ?? null;
  const { portfolio } = useCurrentPortfolio();
  const summary = usePortfolioSummary(portfolio?.id ?? null).data ?? null;

  // The boundary: the user's draft for this city, else a legal square on the city centre. Derived, so no effect is needed.
  const boundary: Bbox | null = draft?.cityId === cityId ? draft.box : city ? squareAround(city.centre, DEFAULT_MARKET_AREA_SQ_KM) : null;
  const setBoundary = (box: Bbox) => { if (cityId) setDraft({ cityId, box }); };

  // Live numbers for the BOUNDARY AREA block, from the shared maths (the server measures again with PostGIS on create).
  const area = useMemo(() => (boundary ? bboxAreaSqKm(boundary) : 0), [boundary]);
  const dims = useMemo(() => (boundary ? bboxDimensionsKm(boundary) : null), [boundary]);
  const calls = useMemo(() => (boundary ? estimateDiscoveryCalls(boundary) : 0), [boundary]);
  const over = area > MAX_MARKET_AREA_SQ_KM;

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="grid grid-cols-1 md:min-h-[calc(100vh-8rem)] md:grid-cols-[360px_1fr]">
      {/* Form first on a phone (the decisions), map beside it from 768 px */}
      <section className="space-y-6 border-b border-line bg-surface p-4 md:overflow-y-auto md:border-b-0 md:border-r md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Crosshair size={22} /> Define the market</h1>
          <p className="mt-1 text-muted">Boundary and categories decide how much store discovery costs.</p>
        </div>

        <Field icon={<Globe size={14} />} label="Country" value={countryId ?? ''} onChange={(e) => { setCountryId(Number(e.target.value) || null); setStateId(null); setCityId(null); }}>
          <option value="">Select…</option>
          {locations.data?.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Field>
        <Field icon={<Map size={14} />} label="State" disabled={!country} value={stateId ?? ''} onChange={(e) => { setStateId(Number(e.target.value) || null); setCityId(null); }}>
          <option value="">Select…</option>
          {country?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Field>
        <Field icon={<MapPin size={14} />} label="City" disabled={!state} value={cityId ?? ''} onChange={(e) => setCityId(Number(e.target.value) || null)}>
          <option value="">Select…</option>
          {state?.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Field>

        {cityId && (
          <div>
            <div className="caption mb-2 flex items-center gap-1.5"><ShoppingBag size={14} /> Categories</div>
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => toggle(c.id)}
                    className={`rounded border px-3 py-2 font-medium ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg hover:border-muted'}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selected.length > 0 && (
          <div className="space-y-3 border-t border-line pt-5">
            <div className="caption flex items-center gap-1.5"><Database size={14} /> Data sources</div>
            <Field label="Store discovery" value={places} onChange={(e) => setPlaces(e.target.value as typeof places)}>
              <option value="overpass">OSM Overpass</option>
              <option value="google">Google Places API (New)</option>
            </Field>
            <Field label="Address lookup" value={geocoder} onChange={(e) => setGeocoder(e.target.value as typeof geocoder)}>
              <option value="nominatim">OSM Nominatim</option>
              <option value="google">Google Geocoding API</option>
            </Field>
            <p className="text-xs text-muted">
              {places === 'overpass'
                ? `Free, community-maintained data. Slower: about one request per second, one per 3 km tile of the boundary.`
                : `Paid per request, up to 60 results per tile. Faster, and usually more complete for chains.`}
            </p>
          </div>
        )}

        {city && boundary && (
          <div className="space-y-2 border-t border-line pt-5">
            <div className="caption flex items-center gap-1.5"><Maximize2 size={14} /> Boundary area</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-bold ${over ? 'text-bad' : ''}`}>{Math.round(area).toLocaleString()}</span>
              <span className="text-muted">km² / {MAX_MARKET_AREA_SQ_KM} km² cap</span>
            </div>
            <div className="h-1 w-full bg-line"><div className={`h-full ${over ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${Math.min(100, (area / MAX_MARKET_AREA_SQ_KM) * 100)}%` }} /></div>
            {dims && <p className="text-xs text-muted">{dims.widthKm.toFixed(1)} × {dims.heightKm.toFixed(1)} km · ≈ {calls} calls</p>}
            {over && <p className="font-medium text-bad">Over the {MAX_MARKET_AREA_SQ_KM} km² cap — shrink the rectangle to continue.</p>}
            {/* Two ways to reshape without dragging. Fit appears only when there are located stores to fit to. */}
            <div className="flex flex-wrap gap-2 pt-1">
              {summary?.bounds && (
                <button type="button" onClick={() => setBoundary(padBbox(summary.bounds!, 0.5))}
                  className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-muted">
                  <Maximize2 size={12} /> Fit to portfolio stores
                </button>
              )}
              <button type="button" onClick={() => setBoundary(city.bbox)}
                className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-muted">
                <RotateCcw size={12} /> Reset to city boundary
              </button>
            </div>
          </div>
        )}

        {/* The CTA appears only once the form is complete — the fields above already say what is missing. */}
        {cityId && selected.length > 0 && (
          <button type="button" disabled className="flex w-full items-center justify-between rounded border border-line px-4 py-3 font-semibold text-muted disabled:opacity-60">
            {portfolio ? 'Create market' : 'Upload a portfolio first'} <ArrowRight size={16} />
          </button>
        )}
      </section>

      <section className="flex h-[50vh] flex-col md:h-auto">
        <CityMap city={city} geocoder={geocoder} boundary={boundary} onBoundaryChange={setBoundary} />
      </section>
    </div>
  );
}