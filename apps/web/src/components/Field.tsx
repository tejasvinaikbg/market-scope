/** Caption with icon above a native select, styled like the design (chevron-down on the right). */
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export function Field({ icon, label, children, ...select }: { icon?: ReactNode; label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="caption mb-1.5 flex items-center gap-1.5">{icon}{label}</span>
      <span className="relative block">
        <select {...select} className="w-full appearance-none rounded border border-line bg-panel px-3 py-2.5 pr-9 text-fg disabled:opacity-50">{children}</select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}