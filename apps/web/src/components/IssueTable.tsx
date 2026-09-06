/** The API's FileIssue[] as the design's Row / Column / Problem table. Used wherever an error envelope carries issues. */
import type { FileIssue } from '@market-scope/shared';

export function IssueTable({ issues }: { issues: FileIssue[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="caption text-left"><th className="py-2 pr-4 font-normal">Row</th><th className="py-2 pr-4 font-normal">Column</th><th className="py-2 font-normal">Problem</th></tr>
        </thead>
        <tbody>
          {issues.map((issue, i) => (
            <tr key={i} className="border-t border-line align-top">
              <td className="py-2 pr-4 tabular-nums text-muted">{issue.row ?? '—'}</td>
              <td className="py-2 pr-4 font-mono text-xs">{issue.column ?? '—'}</td>
              <td className="py-2">{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}