'use client';
/**
 * Step 03 — the market this session created: its name, city, the area the server measured, its categories, and how
 * discovery is going — queued, running with progress, done, done with gaps, or failed — in the user's words. The page
 * polls while the work runs and stops when it ends. The full dashboard — stores on the map, layers, the list — is built on top.
 */
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Layers, Info, ArrowRight, Loader, Check, TriangleAlert } from 'lucide-react';
import { useMarket, type Market } from '@/api/hooks';

/** What to say about discovery, per status. One place, so the words stay consistent. */
function DiscoveryStatus({ m }: { m: Market }) {
  const p = m.progress;
  const bar = p && p.tiles > 0 ? Math.round((p.done / p.tiles) * 100) : 0;
  switch (m.status) {
    case 'pending':
      return <p className="flex items-center gap-2 text-muted"><Loader size={16} className="animate-spin" /> Discovery is queued and starts in a moment.</p>;
    case 'running':
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2"><Loader size={16} className="animate-spin text-accent" /> Discovering stores… {p ? `${p.done} of ${p.tiles} areas searched` : 'starting'} · {m.storeCount} found so far</p>
          <div className="h-1 w-full bg-line"><div className="h-full bg-accent" style={{ width: `${bar}%` }} /></div>
        </div>
      );
    case 'ready':
      return <p className="flex items-center gap-2 text-ok"><Check size={16} /> {m.storeCount} stores discovered{p ? ` across ${p.tiles} areas` : ''}.</p>;
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

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const market = useMarket(Number(id) || null);

  if (market.isPending) return <div className="flex items-center gap-2 p-6 text-muted"><Loader size={16} className="animate-spin" /> Loading the market…</div>;
  if (market.isError || !market.data) {
    return <div role="alert" className="m-4 border border-bad bg-surface p-4 text-bad md:m-6">This market could not be loaded. <Link href="/setup" className="underline">Back to market setup</Link></div>;
  }
  const m = market.data;
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <div className="caption flex items-center gap-2"><Layers size={14} /> Market</div>
        <h1 className="mt-1 text-2xl font-bold">{m.name}</h1>
        <p className="mt-1 text-muted">{m.cityName} · {m.areaSqKm.toFixed(1)} km² · portfolio {m.portfolioName}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {m.categories.map((c) => <span key={c.id} className="rounded border border-line bg-surface px-3 py-1 text-sm">{c.name}</span>)}
      </div>
      <div className="border border-line bg-surface p-4" role="status" aria-live="polite">
        <div className="caption mb-2 flex items-center gap-2"><Info size={14} /> Store discovery</div>
        <DiscoveryStatus m={m} />
      </div>
      <Link href="/setup" className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">Create another market <ArrowRight size={16} /></Link>
    </div>
  );
}
