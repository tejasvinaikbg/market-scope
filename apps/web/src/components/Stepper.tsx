'use client';
/** The three-step navigation from the design. Every step is a link; the current one carries the accent underline. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Crosshair, Layers } from 'lucide-react';

const STEPS = [
  { href: '/', n: '01', title: 'Portfolio upload', hint: 'no file yet', Icon: FileText },
  { href: '/setup', n: '02', title: 'Market setup', hint: 'choose a city and categories', Icon: Crosshair },
  { href: '/dashboard', n: '03', title: 'Market dashboard', hint: 'create the market first', Icon: Layers },
];

export function Stepper() {
  const path = usePathname();
  return (
    <nav className="grid grid-cols-3 border-b border-line bg-panel">
      {STEPS.map(({ href, n, title, hint, Icon }) => {
        const active = path === href;
        return (
          <Link key={href} href={href}
            className={`border-r border-line px-3 py-2.5 last:border-r-0 md:px-6 md:py-3 ${active ? 'bg-surface border-b-2 border-b-accent' : ''}`}>
            <div className="caption">{n}</div>
            <div className={`flex items-center gap-2 text-sm font-semibold md:text-base ${active ? 'text-fg' : 'text-muted'}`}><Icon size={16} /> {title}</div>
            <div className="hidden text-xs text-muted md:block">{hint}</div>   {/* the hint is decoration on a phone */}
          </Link>
        );
      })}
    </nav>
  );
}