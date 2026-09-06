'use client';
/**
 * Step 02 — Market setup: location → categories → data sources → boundary → CTA, with the city map beside it.
 * This is the route file itself. It is a client component because it holds state, uses React Query hooks,
 * and loads the Leaflet map with `ssr: false`, which Next only allows inside client components.
 * The boundary is the user's: it starts as a legal square on the city centre and follows the handles on the map.
 * "Create market" posts every decision; the server measures the boundary again and answers with the stored market.
 * With ?market=<id> the same screen edits that market: every field starts from what it stored, and "Save and run again"
 * rewrites the decisions, throws away what was found for the old ones, and queues the run.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Globe, Map, MapPin, ShoppingBag, Database, Maximize2, RotateCcw, ArrowRight, Crosshair, Loader } from 'lucide-react';
import { bboxAreaSqKm, bboxDimensionsKm, estimateDiscoveryCalls, squareAround, padBbox, MAX_MARKET_AREA_SQ_KM, DEFAULT_MARKET_AREA_SQ_KM, type Bbox } from '@market-scope/shared';
import { useLocations, useCategories, useCityBounds, usePortfolioSummary, useCreateMarket, useUpdateMarket, useMarket, useProviders } from '@/api/hooks';
import { isApiError } from '@/api/client';
import { useCurrentPortfolio } from '@/app/providers';
import { Field } from '@/components/Field';

const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false, loading: () => <div className="h-full bg-panel" /> });

function SetupScreen() {
  // Editing? The market's id rides in the address; its stored decisions seed every field below, once.
  const editId = Number(useSearchParams().get('market')) || null;
  const editing = useMarket(editId);
  const locations = useLocations();
  const categories = useCategories();
  const providers = useProviders();                 // which data sources can be chosen right now
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stateId, setStateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  // Data sources: the user's pick, else the first option the API says is available. null until they choose.
  const [placesChoice, setPlaces] = useState<'overpass' | 'google' | null>(null);
  const [geocoderChoice, setGeocoder] = useState<'nominatim' | 'google' | null>(null);
  // The user's edits to the boundary, remembered per city so changing city starts fresh.
  const [draft, setDraft] = useState<{ cityId: number; box: Bbox } | null>(null);
  // Seed the form from the market being edited, once its row and the locations tree are both here. Never twice.
  const seeded = useRef(false);
  useEffect(() => {
    const m = editing.data;
    if (seeded.current || !m || !locations.data) return;
    const home = locations.data.countries.flatMap((c) => c.states.map((s) => ({ country: c, state: s }))).find(({ state }) => state.cities.some((city) => city.id === m.cityId));
    if (!home) return;
    seeded.current = true;
    setCountryId(home.country.id); setStateId(home.state.id); setCityId(m.cityId);
    setSelected(m.categories.map((c) => c.id));
    setPlaces(m.placesProvider); setGeocoder(m.geocoderProvider);
    setDraft({ cityId: m.cityId, box: m.boundary });
  }, [editing.data, locations.data]);

  // The data source in use: the user's pick, else the first the API says is available. The casts narrow the shared id union to each select's own.
  const firstAvailable = (options: Array<{ id: string; enabled: boolean }> | undefined) => options?.find((o) => o.enabled)?.id ?? null;
  const places = (placesChoice ?? firstAvailable(providers.data?.places) ?? 'overpass') as 'overpass' | 'google';
  const geocoder = (geocoderChoice ?? firstAvailable(providers.data?.geocoding) ?? 'nominatim') as 'nominatim' | 'google';
  const sourcesAvailable = !!providers.data?.places.some((p) => p.enabled) && !!providers.data?.geocoding.some((p) => p.enabled);

  const country = locations.data?.countries.find((c) => c.id === countryId) ?? null;
  const state = country?.states.find((s) => s.id === stateId) ?? null;
  const city = useCityBounds(cityId).data ?? null;
  // The portfolio: this session's upload, or, when editing, the one the market was made from.
  const { portfolio: uploaded } = useCurrentPortfolio();
  const portfolioId = editId ? editing.data?.portfolioId ?? null : uploaded?.id ?? null;
  const summary = usePortfolioSummary(portfolioId).data ?? null;

  // The boundary: the user's draft for this city, else a legal square on the city centre. Derived, so no effect is needed.
  const boundary: Bbox | null = draft?.cityId === cityId ? draft.box : city ? squareAround(city.centre, DEFAULT_MARKET_AREA_SQ_KM) : null;
  const setBoundary = (box: Bbox) => { if (cityId) setDraft({ cityId, box }); };

  // Live numbers for the BOUNDARY AREA block, from the shared maths (the server measures again with PostGIS on create).
  const area = useMemo(() => (boundary ? bboxAreaSqKm(boundary) : 0), [boundary]);
  const dims = useMemo(() => (boundary ? bboxDimensionsKm(boundary) : null), [boundary]);
  const calls = useMemo(() => (boundary ? estimateDiscoveryCalls(boundary) : 0), [boundary]);
  const over = area > MAX_MARKET_AREA_SQ_KM;

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Create or save: every decision in one request; the server measures the boundary again. On success, on to the dashboard.
  const router = useRouter();
  const create = useCreateMarket();
  const update = useUpdateMarket();
  const saving = editId ? update : create;
  const ready = portfolioId != null && !!boundary && !!cityId && selected.length > 0 && !over && sourcesAvailable;
  const onCreate = () => {
    if (portfolioId == null || !boundary || !cityId) return;
    const input = { portfolioId, cityId, categoryIds: selected, boundary, placesProvider: places, geocoderProvider: geocoder };
    const toDashboard = { onSuccess: (market: { id: number }) => router.push(`/dashboard/${market.id}`) };
    if (editId) update.mutate({ id: editId, input }, toDashboard); else create.mutate(input, toDashboard);
  };
  const createError = saving.error && isApiError(saving.error) ? saving.error : null;

  return (
    <div className="grid grid-cols-1 md:min-h-[calc(100vh-8rem)] md:grid-cols-[360px_1fr]">
      {/* Form first on a phone (the decisions), map beside it from 768 px */}
      <section className="space-y-6 border-b border-line bg-surface p-4 md:overflow-y-auto md:border-b-0 md:border-r md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Crosshair size={22} /> {editId ? 'Edit the market' : 'Define the market'}</h1>
          <p className="mt-1 text-muted">{editId ? 'Saving runs discovery again; what was found for the old boundary and categories is replaced.' : 'Boundary and categories decide how much store discovery costs.'}</p>
          {editId && editing.isError && <div role="alert" className="mt-2 border border-bad bg-surface p-3 text-sm font-medium text-bad">This market could not be loaded.</div>}
        </div>

        {/* The reference data is the first thing this screen asks for; if that fails, nothing below can work, so say it here. */}
        {(locations.isError || categories.isError || providers.isError) && (
          <div role="alert" className="border border-bad bg-surface p-3 text-sm font-medium text-bad">Couldn't reach the service. Check your connection and reload the page.</div>
        )}

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
            {/* Options come from the API with their availability; an unavailable one is shown greyed out with the reason, not hidden. */}
            <Field label="Store discovery" value={places} onChange={(e) => setPlaces(e.target.value as 'overpass' | 'google')}>
              {providers.data?.places.map((p) => <option key={p.id} value={p.id} disabled={!p.enabled}>{p.name}{p.reason ? ` · ${p.reason}` : ''}</option>)}
            </Field>
            <Field label="Address lookup" value={geocoder} onChange={(e) => setGeocoder(e.target.value as 'nominatim' | 'google')}>
              {providers.data?.geocoding.map((p) => <option key={p.id} value={p.id} disabled={!p.enabled}>{p.name}{p.reason ? ` · ${p.reason}` : ''}</option>)}
            </Field>
            {providers.data && !sourcesAvailable && <p className="text-sm font-medium text-bad" role="alert">No data source is available for one of these. Ask whoever runs the service to enable one.</p>}
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
          <div className="space-y-2">
            {createError && <div role="alert" className="border border-bad bg-surface p-3 text-sm font-medium text-bad">{createError.message}</div>}
            {saving.isError && !createError && <div role="alert" className="border border-bad bg-surface p-3 text-sm font-medium text-bad">Couldn't reach the service. Check your connection and try again.</div>}
            <button type="button" disabled={!ready || saving.isPending} onClick={onCreate}
              className={`flex w-full items-center justify-between rounded px-4 py-3 font-semibold disabled:opacity-60 ${ready ? 'bg-accent text-accent-fg' : 'border border-line text-muted'}`}>
              {saving.isPending ? <span className="flex items-center gap-2"><Loader size={16} className="animate-spin" /> {editId ? 'Saving…' : 'Creating…'}</span> : portfolioId == null ? 'Upload a portfolio first' : editId ? 'Save and run again' : 'Create market'}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>

      <section className="flex h-[50vh] flex-col md:h-auto">
        <CityMap city={city} geocoder={geocoder} boundary={boundary} onBoundaryChange={setBoundary} />
      </section>
    </div>
  );
}

/** useSearchParams needs a Suspense boundary above it for the static build; the screen itself is unchanged by it. */
export default function Page() {
  return <Suspense fallback={<div className="p-6 text-muted">Loading…</div>}><SetupScreen /></Suspense>;
}
