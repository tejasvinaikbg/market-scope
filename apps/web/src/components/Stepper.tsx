'use client';
/** The three-step navigation from the design. Every step is a link; the current one carries the accent underline. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Crosshair, Layers } from 'lucide-react';
import { useCurrentPortfolio } from '@/app/providers';

const STEPS = [
  { href: '/', n: '01', title: 'Portfolio upload', Icon: FileText },
  { href: '/setup', n: '02', title: 'Market setup', Icon: Crosshair },
  { href: '/dashboard', n: '03', title: 'Market dashboard', Icon: Layers },
];

export function Stepper() {
  const path = usePathname();
  const { portfolio } = useCurrentPortfolio();                    // null until this session uploads one

  // The captions say where the user stands, not what the page is called.
  const hint = (href: string) =>
    href === '/' ? (portfolio ? `${portfolio.name} · ${portfolio.rowCount} stores` : 'no file yet')
    : href === '/setup' ? 'choose a city and categories'
    : 'create the market first';

  return (
    <nav className="grid grid-cols-3 border-b border-line bg-panel">
      {STEPS.map(({ href, n, title, Icon }) => {
        const active = path === href;
        return (
          <Link key={href} href={href}
            className={`border-r border-line px-3 py-2.5 last:border-r-0 md:px-6 md:py-3 ${active ? 'bg-surface border-b-2 border-b-accent' : ''}`}>
            <div className="caption">{n}</div>
            <div className={`flex items-center gap-2 text-sm font-semibold md:text-base ${active ? 'text-fg' : 'text-muted'}`}><Icon size={16} /> {title}</div>
            <div className="hidden text-xs text-muted md:block">{hint(href)}</div>   {/* the hint is decoration on a phone */}
          </Link>
        );
      })}
    </nav>
  );
}
