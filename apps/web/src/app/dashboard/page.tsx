'use client';
/**
 * Step 03 without a market in the address: the design's notice when this session has created none, the way to the setup
 * screen, and every market the service holds, newest first, so a market from an earlier session can be opened again.
 * A market opens at /dashboard/<id>.
 */
import Link from 'next/link';
import { Info, ArrowRight, Layers, Loader } from 'lucide-react';
import { useMarkets, type Market } from '@/api/hooks';
import { useCurrentMarket } from '@/app/providers';

/** One word per status for the list; the dashboard itself says more. */
const STATUS: Record<Market['status'], string> = { pending: 'queued', running: 'running', ready: 'done', partial: 'done with gaps', failed: 'failed' };
const when = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export default function Page() {
  const { market } = useCurrentMarket();
  const markets = useMarkets();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface p-4">
        <p className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" />
          {market
            ? <span><strong>{market.name}</strong> is the market from this session.</span>
            : <span><strong>No market created yet.</strong> Discovered stores and matches appear once the market is created.</span>}
        </p>
        {market
          ? <Link href={`/dashboard/${market.id}`} className="flex items-center gap-2 rounded bg-accent px-4 py-2 font-semibold text-accent-fg">Open it <ArrowRight size={16} /></Link>
          : <Link href="/setup" className="flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">Back to market setup <ArrowRight size={16} /></Link>}
      </div>

      {markets.isPending && <p className="flex items-center gap-2 text-muted"><Loader size={16} className="animate-spin" /> Looking for previous markets…</p>}
      {markets.isError && <p role="alert" className="border border-bad bg-surface p-3 text-sm font-medium text-bad">Couldn't reach the service. Check your connection and reload the page.</p>}
      {markets.data && markets.data.length > 0 && (
        <section>
          <h2 className="caption mb-2 flex items-center gap-2"><Layers size={14} /> Previous markets · {markets.data.length}</h2>
          <ul className="divide-y divide-line border border-line bg-surface">
            {markets.data.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/${m.id}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-panel">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block text-sm text-muted">{m.cityName} · {m.areaSqKm.toFixed(1)} km² · {m.categories.map((c) => c.name).join(', ')}</span>
                  </span>
                  <span className="caption flex items-center gap-4">
                    <span className={m.status === 'failed' ? 'text-bad' : m.status === 'partial' ? 'text-bad' : ''}>{STATUS[m.status]}</span>
                    <span>{m.storeCount} stores</span>
                    <span>{when(m.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}