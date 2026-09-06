/** Step 03 without a market: the design's notice, with the way to the setup screen. A market opens at /dashboard/<id>. */
import Link from 'next/link';
import { Info, ArrowRight } from 'lucide-react';

export default function Page() {
  return (
    <div className="m-4 flex flex-wrap items-center justify-between gap-4 border border-line bg-surface p-4 md:m-6">
      <p className="flex items-start gap-3">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" />
        <span><strong>No market created yet.</strong> Discovered stores and matches appear once the market is created.</span>
      </p>
      <Link href="/setup" className="flex items-center gap-2 rounded border border-line px-4 py-2 font-semibold">
        Back to market setup <ArrowRight size={16} />
      </Link>
    </div>
  );
}