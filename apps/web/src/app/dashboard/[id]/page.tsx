'use client';
/**
 * Step 03 — the market dashboard. The market as the server stored it and how discovery is going come first, for every
 * status. Once there are stores: the four totals, the layers to show, a search box with category chips, and the list beside
 * the map. Map and list draw the same filtered rows from one request; the totals never follow the filters. The page polls
 * while the run is in flight, so stores appear as they are found, and stops when it ends. A store picked in the list or on
 * the map is marked in both, so the two views always point at the same store. A finished market can be run again, and
 * deleted; neither while a run is in flight.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDebounce } from 'use-debounce';
import { Layers, Info, ArrowRight, ChevronLeft, Loader, Check, TriangleAlert, Search, MapPin, X, RotateCcw, Pencil } from 'lucide-react';
import { MATCH_DISTANCE_M } from '@market-scope/shared';
import type { LatLng } from '@market-scope/shared';
import { useMarket, useMarketStores, useRerunMarket, useDeleteMarket, type Market, type LayerFilter } from '@/api/hooks';
import { isApiError } from '@/api/client';
import { useCurrentMarket } from '@/app/providers';
import { LAYERS, ALL_LAYERS, LayerSwatch, layerTag, unlocatedReason } from '@/components/layers';
import { CategoryIcon } from '@/components/categoryIcons';

const MarketMap = dynamic(() => import('@/components/MarketMap'), { ssr: false, loading: () => <div className="h-full bg-panel" /> });

/** How the portfolio's own stores fared: located from their addresses when any needed it, then where they sit for this market. */
const located = (g: Market['geocoding']) => (g.total === 0 ? '' : ` ${g.done} of ${g.total} of your stores located from their address${g.failed ? `, ${g.failed} not found` : ''}.`);
const placed = (p: Market['placement']) => {
  const total = p.inside + p.outside + p.unlocated;
  return total === 0 ? '' : ` ${p.inside} of your ${total} stores inside the boundary, ${p.outside} outside${p.unlocated ? `, ${p.unlocated} without a location` : ''}.`;
};
const matched = (n: number) => (n === 0 ? '' : ` ${n} of them ${n === 1 ? 'is' : 'are'} a discovered store within ${MATCH_DISTANCE_M} m.`);

/** What to say about discovery, per status. One place, so the words stay consistent. */
function DiscoveryStatus({ m }: { m: Market }) {
  const p = m.progress;
  const g = m.geocoding;
  const bar = p && p.tiles > 0 ? Math.round((p.done / p.tiles) * 100) : 0;
  switch (m.status) {
    case 'pending':
      return <p className="flex items-center gap-2 text-muted"><Loader size={16} className="animate-spin" /> Discovery is queued and starts in a moment.</p>;
    case 'running':
      // Two phases: the portfolio's own stores are located from their addresses first, then the area is searched.
      if (!p && g.total > 0) {
        return <p className="flex items-center gap-2"><Loader size={16} className="animate-spin text-accent" /> Locating your stores from their addresses… {g.done + g.failed} of {g.total}</p>;
      }
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2"><Loader size={16} className="animate-spin text-accent" /> Discovering stores… {p ? `${p.done} of ${p.tiles} areas searched` : 'starting'} · {m.storeCount} found so far</p>
          <div className="h-1 w-full bg-line"><div className="h-full bg-accent" style={{ width: `${bar}%` }} /></div>
        </div>
      );
    case 'ready':
      return <p className="flex items-center gap-2 text-ok"><Check size={16} /> {m.storeCount} stores discovered{p ? ` across ${p.tiles} areas` : ''}.{located(g)}{placed(m.placement)}{matched(m.matched)}</p>;
    case 'partial':
      return (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-bad"><TriangleAlert size={16} /> {m.storeCount} stores discovered; {p?.failed ?? 'some'} of {p?.tiles ?? 'the'} areas could not be searched.</p>
          {m.error && <p className="text-xs text-muted">{m.error}</p>}
        </div>
      );
    case 'failed':
      return (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-bad"><TriangleAlert size={16} /> Discovery failed. No area could be searched.</p>
          {m.error && <p className="text-xs text-muted">{m.error}</p>}
        </div>
      );
  }
}

/** The five totals, live from the market itself: they tick up during a run and never follow the filters. */
function Totals({ m }: { m: Market }) {
  const cells: [string, number][] = [
    ['Discovered', m.storeCount], ['Portfolio inside', m.placement.inside], ['Portfolio outside', m.placement.outside], ['Not located', m.placement.unlocated], ['Matched', m.matched],
  ];
  return (
    // Five cells in three columns; the last spans the slot that would otherwise be empty.
    <dl className="grid grid-cols-3 gap-px border border-line bg-line">
      {cells.map(([label, n]) => (
        <div key={label} className="bg-surface p-3 last:col-span-2"><dt className="caption">{label}</dt><dd className="mt-1 text-2xl font-bold">{n}</dd></div>
      ))}
    </dl>
  );
}

/** A chip that is on or off. The pressed state is the accessible truth; the look follows it. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm font-medium ${on ? 'border-fg bg-surface text-fg' : 'border-line bg-surface text-muted hover:border-muted'}`}>
      {children}
    </button>
  );
}

const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const noun = (n: number) => (n === 1 ? 'store' : 'stores');
const detail = (category: { name: string } | null, address: string | null) => [category?.name, address].filter(Boolean).join(' · ');

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const marketId = Number(id) || null;
  const market = useMarket(marketId);
  // Whatever market is open is the session's market: the stepper shows it after a reload or from the previous-markets list.
  const { market: current, setMarket } = useCurrentMarket();
  useEffect(() => {
    const m = market.data;
    if (m && current?.id !== m.id) setMarket({ id: m.id, name: m.name, areaSqKm: m.areaSqKm });
  }, [market.data, current, setMarket]);
  const [layers, setLayers] = useState<LayerFilter[]>(ALL_LAYERS);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [q] = useDebounce(search, 250);                  // one request per pause in typing, not one per key
  // The store picked in the list or on the map. Picked from the list, the map moves to it; picked on the map, the list scrolls to it.
  const [selected, setSelected] = useState<{ id: string; from: 'list' | 'map' } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (selected?.from === 'map') rowRefs.current.get(selected.id)?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  // Run again and delete, neither while a run is in flight (the API refuses too). Delete asks twice.
  const rerun = useRerunMarket(marketId);
  const remove = useDeleteMarket();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const everyLayer = layers.length === ALL_LAYERS.length;
  // With every layer on, nothing is sent: the API's default is everything. With no layer on, nothing is asked at all.
  const stores = useMarketStores(layers.length ? marketId : null, { layers: everyLayer ? undefined : layers, categories, q }, market.data?.status);

  if (market.isPending) return <div className="flex items-center gap-2 p-6 text-muted"><Loader size={16} className="animate-spin" /> Loading the market…</div>;
  if (market.isError || !market.data) {
    return <div role="alert" className="m-4 border border-bad bg-surface p-4 text-bad md:m-6">This market could not be loaded. <Link href="/setup" className="underline">Back to market setup</Link></div>;
  }
  const m = market.data;
  const started = m.status !== 'pending';
  const ended = m.status === 'ready' || m.status === 'partial';
  const inFlight = m.busy;                                  // running, or queued: the server refuses changes meanwhile, so the buttons hide
  const rows = layers.length ? stores.data?.stores ?? [] : [];
  // The pair told from the discovered side too: which of the found stores are the user's own, by the portfolio stores' names.
  // A found store can be the twin of several portfolio stores (two of yours 50 m apart), so each carries a list.
  const yours = new Map<string, string[]>();
  for (const s of rows) if (s.match) yours.set(s.match.id, [...(yours.get(s.match.id) ?? []), s.name]);
  const unlocated = stores.data?.unlocated ?? [];
  const total = stores.data ? stores.data.counts.discovered + stores.data.counts.portfolioInside + stores.data.counts.portfolioOutside : 0;
  const anything = total > 0 || unlocated.length > 0;      // the controls and the list appear once there is something to show
  const filtered = !everyLayer || categories.length > 0 || q.trim() !== '';
  const clear = () => { setLayers(ALL_LAYERS); setCategories([]); setSearch(''); };
  // Picking the picked store again lets go of it. The map only moves for a pick made in the list.
  const pick = (id: string, from: 'list' | 'map') => setSelected((s) => (s?.id === id ? null : { id, from }));
  const picked = (id: string) => selected?.id === id;
  const selectedStore = selected ? rows.find((s) => s.id === selected.id) ?? null : null;
  const focus: LatLng | null = selected?.from === 'list' && selectedStore ? { lat: selectedStore.lat, lng: selectedStore.lng } : null;

  return (
    <div className="grid grid-cols-1 md:h-[calc(100vh-8rem)] md:grid-cols-[400px_1fr]">
      {/* The panel first on a phone, the map beside it from 768 px; on a desktop the panel scrolls and the map stays. */}
      <section className="flex flex-col border-b border-line bg-surface md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="space-y-4 p-4 md:p-6">
          <div>
            <div className="caption flex items-center gap-2"><Layers size={14} /> Market</div>
            <h1 className="mt-1 text-2xl font-bold">{m.name}</h1>
            <p className="mt-1 text-muted">{m.cityName} · {m.areaSqKm.toFixed(1)} km² · portfolio {m.portfolioName}</p>
            <p className="text-sm text-muted">{m.categories.map((c) => c.name).join(' · ')}</p>
          </div>
          <div className="border border-line bg-panel p-4" role="status" aria-live="polite">
            <div className="caption mb-2 flex items-center gap-2"><Info size={14} /> Store discovery</div>
            <DiscoveryStatus m={m} />
            {!inFlight && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => rerun.mutate()} disabled={rerun.isPending}
                  className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-muted disabled:opacity-60">
                  <RotateCcw size={12} /> {rerun.isPending ? 'Queueing…' : 'Run discovery again'}
                </button>
                <Link href={`/setup?market=${m.id}`} className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-muted"><Pencil size={12} /> Edit this market</Link>
                {rerun.isError && <span role="alert" className="text-xs text-bad">{isApiError(rerun.error) ? rerun.error.message : "Couldn't reach the service."}</span>}
              </div>
            )}
            {ended && m.storeCount === 0 && (
              <p className="mt-2 text-sm text-muted">Nothing was found for {m.categories.map((c) => c.name).join(', ')} inside this boundary. Try a larger boundary or other categories.</p>
            )}
          </div>
          {started && <Totals m={m} />}
          {anything && (
            <>
              <div>
                <div className="caption mb-2 flex items-center gap-1.5"><Layers size={14} /> Layers</div>
                <div className="flex flex-wrap gap-2">
                  {LAYERS.map((l) => (
                    <Chip key={l.id} on={layers.includes(l.id)} onClick={() => setLayers((s) => toggleIn(s, l.id))}><LayerSwatch layer={l.id} /> {l.label}</Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stores by name" aria-label="Search stores by name"
                    className="w-full rounded border border-line bg-panel py-2 pl-9 pr-3 text-fg placeholder:text-muted" />
                </label>
                <div className="flex flex-wrap gap-2">
                  {m.categories.map((c) => (
                    <Chip key={c.id} on={categories.includes(c.slug)} onClick={() => setCategories((s) => toggleIn(s, c.slug))}><CategoryIcon slug={c.slug} size={14} /> {c.name}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {anything && (
          <div className="border-t border-line">
            {layers.length === 0 ? <p className="p-4 text-muted md:px-6">No layers selected. Turn one on to see stores.</p>
              : rows.length === 0 && stores.data ? <p className="p-4 text-muted md:px-6">No stores match these filters.</p>
                : (
                  <ul>
                    {rows.map((s) => (
                      <li key={s.id} className="border-b border-line">
                        {/* A row is a button: picking a store marks it here and on the map, and moves the map to it. The mark is the same ring the badge wears. */}
                        <button type="button" aria-current={picked(s.id) || undefined} onClick={() => pick(s.id, 'list')}
                          ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
                          className={`flex w-full items-start gap-3 px-4 py-2.5 text-left md:px-6 ${picked(s.id) ? 'bg-accent/10 inset-ring-2 inset-ring-accent' : 'hover:bg-panel'}`}>
                          <CategoryIcon slug={s.category?.slug} size={16} className={`mt-1 shrink-0 ${picked(s.id) ? 'text-accent' : 'text-muted'}`} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate font-medium ${picked(s.id) ? 'text-accent' : ''}`}>{s.name}</span>
                            <span className="block truncate text-sm text-muted">{detail(s.category, s.address)}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 pt-1">
                          <span className="caption flex items-center gap-1.5"><LayerSwatch layer={s.layer} /> {layerTag(s.layer)}</span>
                          {s.match && <span className="caption flex max-w-48 items-center gap-1.5 text-map-match"><LayerSwatch layer="matched" /> <span className="truncate">Matched · {s.match.name} · {s.match.distanceM} m</span></span>}
                          {yours.has(s.id) && <span className="caption flex max-w-48 items-center gap-1.5 text-map-match" title={`Yours: ${yours.get(s.id)!.join(', ')}`}><LayerSwatch layer="matched" /> <span className="truncate">Yours · {yours.get(s.id)!.join(', ')}</span></span>}
                        </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            {unlocated.length > 0 && (
              <div className="border-t border-line pb-2">
                <div className="caption flex items-center gap-1.5 px-4 pt-4 md:px-6"><MapPin size={14} /> Not on the map · {unlocated.length}</div>
                <ul>
                  {unlocated.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 px-4 py-2.5 md:px-6">
                      <CategoryIcon slug={s.category?.slug} size={16} className="mt-1 shrink-0 text-muted" />
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-sm text-muted">{detail(s.category, s.address)} · {unlocatedReason(s.reason)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="caption flex items-center justify-between gap-3 border-t border-line px-4 py-3 md:px-6">
              <span>{rows.length} {noun(rows.length)} shown · {total} in this market</span>
              {filtered && <button type="button" onClick={clear} className="flex items-center gap-1 text-fg"><X size={12} /> Clear filters</button>}
            </div>
          </div>
        )}

        {/* Two ways on: every market the service holds, or a new one. And the way out: delete, asked twice, never mid-run. */}
        <div className="mt-auto space-y-3 p-4 md:p-6">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold"><ChevronLeft size={16} /> All markets</Link>
            <Link href="/setup" className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">Create another market <ArrowRight size={16} /></Link>
          </div>
          {!inFlight && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-muted underline-offset-2 hover:underline">Delete this market</button>
          )}
          {confirmDelete && (
            <div className="flex flex-wrap items-center gap-3 border border-bad bg-surface p-3 text-sm" role="alertdialog" aria-label="Delete this market?">
              <span>Delete this market and everything found for it?</span>
              <button type="button" onClick={() => marketId && remove.mutate(marketId, { onSuccess: () => router.push('/dashboard') })} disabled={remove.isPending}
                className="rounded bg-bad px-3 py-1.5 font-semibold text-white disabled:opacity-60">{remove.isPending ? 'Deleting…' : 'Delete'}</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded border border-line px-3 py-1.5 font-medium">Keep it</button>
              {remove.isError && <span role="alert" className="text-bad">{isApiError(remove.error) ? remove.error.message : "Couldn't reach the service."}</span>}
            </div>
          )}
        </div>
      </section>

      <section className="flex h-[50vh] flex-col md:h-full">
        <MarketMap boundary={m.boundary} stores={rows} focus={focus} selectedId={selected?.id ?? null} onSelect={(id) => pick(id, 'map')} />
      </section>
    </div>
  );
}