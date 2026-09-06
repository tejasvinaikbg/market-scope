'use client';
/**
 * Brand, live API status, and the LIGHT / DARK toggle from the design header.
 * The status square carries meaning: muted + spinner while connecting, green when API and database answer,
 * red when either is down — and the label says which one.
 */
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { Sun, Moon, Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

type Health = { healthy: boolean; db: boolean; version: string };

/** 200 → healthy; 503 still carries a JSON body with db:false; a network failure throws and becomes `isError`. */
async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (res.status !== 200 && res.status !== 503) throw new Error(`health ${res.status}`);
  return res.json();
}

const STATUS = {
  connecting: { dot: 'bg-muted', text: 'text-muted', label: 'connecting' },
  online: { dot: 'bg-ok', text: 'text-ok', label: 'API online' },
  dbDown: { dot: 'bg-bad', text: 'text-bad', label: 'database offline' },
  apiDown: { dot: 'bg-bad', text: 'text-bad', label: 'API offline' },
} as const;

export function AppHeader() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000, retry: 0 });
  const state: keyof typeof STATUS =
    health.isPending ? 'connecting' : health.isError ? 'apiDown' : health.data?.db ? 'online' : 'dbDown';
  const ui = STATUS[state];

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);            // the theme is unknown during SSR; render the toggle only on the client

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-lg font-bold">MarketScope</span>
        <span className="caption">Portfolio universe &amp; store discovery</span>
      </div>
      <div className="flex items-center gap-4">
        <span className={`caption flex items-center gap-2 ${ui.text}`} role="status" aria-live="polite">
          {state === 'connecting'
            ? <Loader size={14} className="animate-spin" />
            : <span className={`inline-block h-2 w-2 ${ui.dot}`} />}
          {ui.label}
        </span>
        {mounted && (
          <div className="flex overflow-hidden rounded border border-line">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTheme(t)}
                className={`caption flex items-center gap-1.5 px-3 py-1.5 ${resolvedTheme === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}>
                {t === 'light' ? <Sun size={14} /> : <Moon size={14} />} {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}