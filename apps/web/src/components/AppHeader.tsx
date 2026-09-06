'use client';
/**
 * Brand and the LIGHT / DARK toggle from the design header. Nothing else: the design's "API online" badge was dropped —
 * a health check the browser runs tells the user nothing they can act on, and each screen already says, in its own words,
 * when its own request cannot reach the service.
 */
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is unknown during SSR: this is false on the server and during hydration, true once on the client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-lg font-bold">MarketScope</span>
        <span className="caption">Portfolio universe &amp; store discovery</span>
      </div>
      {mounted && (
        <div className="flex overflow-hidden rounded border border-line">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`caption flex items-center gap-1.5 px-3 py-1.5 ${resolvedTheme === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}
            >
              {t === 'light' ? <Sun size={14} /> : <Moon size={14} />} {t}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
