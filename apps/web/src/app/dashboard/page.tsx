'use client';
/**
 * Step 03 without a market in the address: the design's notice when this session has created none, the way to the setup
 * screen, and every market the service holds, newest first, so a market from an earlier session can be opened again.
 * A market opens at /dashboard/<id>. A finished market can be edited or deleted from its row, delete asked first.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Info, ArrowRight, Layers, Loader, Trash2, Pencil } from 'lucide-react';
import { useMarkets, useDeleteMarket, type Market } from '@/api/hooks';
import { isApiError } from '@/api/client';
import { useCurrentMarket } from '@/app/providers';

/** One word per status for the list; the dashboard itself says more. */
const STATUS: Record<Market['status'], string> = { pending: 'queued', running: 'running', ready: 'done', partial: 'done with gaps', failed: 'failed' };
const when = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export default function Page() {
  const { market } = useCurrentMarket();
  const markets = useMarkets();
  const remove = useDeleteMarket();
  const [confirmId, setConfirmId] = useState<number | null>(null); // the one row whose delete is being asked about
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface p-4">
        <p className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" />
          {market ? (
            <span>
              <strong>{market.name}</strong> is the market from this session.
            </span>
          ) : (
            <span>
              <strong>No market created yet.</strong> Discovered stores and matches appear once the market is created.
            </span>
          )}
        </p>
        {market ? (
          <Link href={`/dashboard/${market.id}`} className="flex items-center gap-2 rounded bg-accent px-4 py-2 font-semibold text-accent-fg">
            Open it <ArrowRight size={16} />
          </Link>
        ) : (
          <Link href="/setup" className="flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">
            Back to market setup <ArrowRight size={16} />
          </Link>
        )}
      </div>

      {markets.isPending && (
        <p className="flex items-center gap-2 text-muted">
          <Loader size={16} className="animate-spin" /> Looking for previous markets…
        </p>
      )}
      {markets.isError && (
        <p role="alert" className="border border-bad bg-surface p-3 text-sm font-medium text-bad">
          Couldn&apos;t reach the service. Check your connection and reload the page.
        </p>
      )}
      {markets.data && markets.data.length > 0 && (
        <section>
          <h2 className="caption mb-2 flex items-center gap-2">
            <Layers size={14} /> Previous markets · {markets.data.length}
          </h2>
          <ul className="divide-y divide-line border border-line bg-surface">
            {markets.data.map((m) => {
              const inFlight = m.busy;
              return (
                <li key={m.id} className="flex items-stretch">
                  <Link
                    href={`/dashboard/${m.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-panel"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block text-sm text-muted">
                        {m.cityName} · {m.areaSqKm.toFixed(1)} km² · {m.categories.map((c) => c.name).join(', ')}
                      </span>
                    </span>
                    <span className="caption flex items-center gap-4">
                      <span className={m.status === 'failed' ? 'text-bad' : m.status === 'partial' ? 'text-bad' : ''}>{STATUS[m.status]}</span>
                      <span>{m.storeCount} stores</span>
                      <span>{when(m.createdAt)}</span>
                    </span>
                  </Link>
                  {/* Edit and delete sit beside the link, not inside it; delete asked first; neither mid-run. */}
                  {!inFlight && confirmId !== m.id && (
                    <>
                      <Link
                        href={`/setup?market=${m.id}`}
                        aria-label={`Edit ${m.name}`}
                        title="Edit this market"
                        className="flex items-center px-3 text-muted hover:bg-panel hover:text-fg"
                      >
                        <Pencil size={16} />
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${m.name}`}
                        title="Delete this market"
                        onClick={() => setConfirmId(m.id)}
                        className="flex items-center px-3 text-muted hover:bg-panel hover:text-bad"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {confirmId === m.id && (
                    <div
                      role="alertdialog"
                      aria-label={`Delete ${m.name}?`}
                      className="flex flex-wrap items-center gap-2 border-l border-line px-3 py-2 text-sm"
                    >
                      <span>Delete, with everything found for it?</span>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.id, { onSuccess: () => setConfirmId(null) })}
                        className="rounded bg-bad px-3 py-1 font-semibold text-white disabled:opacity-60"
                      >
                        {remove.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="rounded border border-line px-3 py-1 font-medium">
                        Keep it
                      </button>
                      {remove.isError && (
                        <span role="alert" className="text-bad">
                          {isApiError(remove.error) ? remove.error.message : "Couldn't reach the service."}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
