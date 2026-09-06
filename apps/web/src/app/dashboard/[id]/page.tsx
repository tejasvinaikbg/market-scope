'use client';
/**
 * Step 03 — the market this session created: its name, city, the area the server measured, and its categories.
 * Discovery has not run yet, and the page says so. The full dashboard — stores, layers, the list — is built on top of this.
 */
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Layers, Info, ArrowRight, Loader } from 'lucide-react';
import { useMarket } from '@/api/hooks';

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
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface p-4">
        <p className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" />
          <span><strong>Store discovery has not run yet.</strong> Discovered stores, placements and matches appear here once it does.</span>
        </p>
        <Link href="/setup" className="flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">Create another market <ArrowRight size={16} /></Link>
      </div>
    </div>
  );
}