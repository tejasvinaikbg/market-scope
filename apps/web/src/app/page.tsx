'use client';
/**
 * Step 01 — Portfolio upload: the drop zone, the HEADER VALIDATION rail, and what came back — the stored summary
 * with its counts, or the problems as a Row / Column / Problem table. The API stores nothing unless the whole file
 * passes, so this screen shows a stored portfolio or a rejected one, never a half.
 */
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { Upload, TriangleAlert, Minus, Check, X, Loader, ArrowRight, FileText } from 'lucide-react';
import { REQUIRED_COLUMNS, OPTIONAL_COLUMNS, PORTFOLIO_LIMITS, type FileIssue } from '@market-scope/shared';
import { useUploadPortfolio } from '@/api/hooks';
import { isApiError } from '@/api/client';
import { IssueTable } from '@/components/IssueTable';

const MAX_MB = PORTFOLIO_LIMITS.maxFileBytes / 1024 / 1024;
const COLUMNS = [...REQUIRED_COLUMNS.map((c) => [c, 'required'] as const), ...OPTIONAL_COLUMNS.map((c) => [c, 'optional'] as const)];

export default function Page() {
  const upload = useUploadPortfolio();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const send = (file: File | undefined) => { if (file) upload.mutate(file); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files[0]); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { send(e.target.files?.[0]); e.target.value = ''; };   // reset, so the same file can be picked again

  // The rail's marks come from the result: crosses for the columns a header rejection named, checks once the header passed.
  const error = upload.error && isApiError(upload.error) ? upload.error : null;
  const issues = (error?.details as FileIssue[] | undefined) ?? [];
  const missing = new Set(error?.code === 'INVALID_HEADERS' ? issues.map((i) => i.column) : []);
  const headerPassed = upload.isSuccess || error?.code === 'INVALID_ROWS';

  return (
    <div className="grid grid-cols-1 md:min-h-[calc(100vh-8rem)] md:grid-cols-[1fr_300px]">
      <section className="p-4 md:p-8">
        <h1 className="text-3xl font-bold">Upload your portfolio</h1>
        <p className="mt-2 max-w-xl text-muted">A CSV or XLSX of your own stores. Headers are validated before anything is accepted — nothing is stored until the file passes.</p>

        {/* The drop zone. dragover must be prevented or the browser navigates to the file instead of dropping it. */}
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={`mt-6 border border-dashed bg-panel p-5 md:p-6 ${dragging ? 'border-accent' : 'border-line'}`}>
          <div className="caption flex items-center gap-2 text-accent"><Upload size={14} /> PF file</div>
          <div className="mt-3 text-lg font-bold">Drop a .csv or .xlsx here</div>
          <p className="mt-1 text-xs text-muted">Max {MAX_MB} MB. One row per store.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending}
              className="flex items-center gap-2 rounded bg-accent px-4 py-2 font-semibold text-accent-fg disabled:opacity-60">
              {upload.isPending ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />} {upload.isPending ? 'Validating…' : 'Choose file'}
            </button>
            <input ref={input} type="file" accept=".csv,.xlsx" className="hidden" onChange={onPick} />
          </div>
        </div>

        {/* A request that never got an answer (service down, rewrite broken) is not an ApiError: say so, in the user's words. */}
        {upload.isError && !error && (
          <div className="mt-6 border border-bad bg-surface p-4 md:p-6 font-semibold text-bad" role="alert">Couldn't reach the service. Check your connection and try again.</div>
        )}

        {error && (
          <div className="mt-6 border border-bad bg-surface p-4 md:p-6" role="alert">
            <div className="flex items-center gap-2 font-semibold text-bad"><TriangleAlert size={16} /> {error.message} — nothing was stored</div>
            {issues.length > 0 && <div className="mt-3"><IssueTable issues={issues} /></div>}
          </div>
        )}

        {upload.isSuccess && (
          <div className="mt-6 border border-line bg-surface p-4 md:p-6">
            <div className="caption flex items-center gap-2 text-ok"><Check size={14} /> Stored</div>
            <div className="mt-2 flex items-center gap-2 text-lg font-bold"><FileText size={18} /> {upload.data.name}</div>
            <p className="mt-1 text-muted">{upload.data.rowCount} stores · {upload.data.withCoords} with coordinates · {upload.data.withoutCoords} to locate from their address</p>
            {upload.data.warnings.length > 0 && (
              <ul className="mt-3 text-xs text-muted">{upload.data.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
            )}
            <Link href="/setup" className="mt-4 inline-flex items-center gap-2 rounded bg-accent px-4 py-2 font-semibold text-accent-fg">
              Continue to market setup <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>

      {/* The rail: the contract, drawn from the shared constants, with a mark per column once there is a result. */}
      <aside className="border-t border-line bg-panel p-4 md:border-l md:border-t-0 md:p-6">
        <div className="caption mb-3">Header validation</div>
        <ul>
          {COLUMNS.map(([col, kind]) => {
            const state = missing.has(col) ? 'bad' : headerPassed ? 'ok' : 'none';
            return (
              <li key={col} className="flex items-center justify-between border-b border-line py-2">
                <span className={`flex items-center gap-2 font-mono text-xs ${state === 'bad' ? 'text-bad' : state === 'ok' ? 'text-ok' : ''}`}>
                  {state === 'bad' ? <X size={14} /> : state === 'ok' ? <Check size={14} /> : <Minus size={14} className="text-muted" />}
                  {col}
                </span>
                <span className="caption">{kind}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Types are checked too: <code>latitude</code> and <code>longitude</code> must parse as decimal degrees when present.</p>
      </aside>
    </div>
  );
}
