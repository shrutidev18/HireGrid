import { STATUS_LABELS, type StatusHistoryEntry } from '../types/api';
import { formatDateTime, formatRelative } from '../utils/format';

/**
 * The application's history, newest first.
 *
 * This is the payoff of making StatusHistory append-only rather than
 * overwriting a status column: the record of *when* each stage happened
 * exists, so it can be shown. An application that stores only its current
 * status can render a badge and nothing else.
 *
 * The API returns entries in chronological order; they are reversed here
 * because a reader wants the most recent change first. That reversal is a
 * display decision, which is why it lives in the component rather than in the
 * query.
 */
export default function Timeline({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-900">Timeline</h2>
        <p className="mt-3 text-sm text-slate-500">No status changes recorded yet.</p>
      </section>
    );
  }

  const newestFirst = [...entries].reverse();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-900">Timeline</h2>

      <ol className="relative">
        {newestFirst.map((entry, index) => {
          const isNewest = index === 0;
          const isLast = index === newestFirst.length - 1;

          return (
            <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
              {/* The vertical line, drawn per-item and omitted on the last so
                  it does not dangle past the final dot. */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute left-[7px] top-4 h-full w-px bg-slate-200"
                />
              )}

              <span
                aria-hidden="true"
                className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                  entry.status === 'REJECTED'
                    ? 'border-red-500 bg-red-100'
                    : isNewest
                      ? 'border-brand-600 bg-brand-600'
                      : 'border-slate-300 bg-white'
                }`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={`text-sm font-medium ${
                      entry.status === 'REJECTED' ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {STATUS_LABELS[entry.status]}
                  </span>
                  <span className="text-xs text-slate-400">{formatRelative(entry.changedAt)}</span>
                </div>

                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDateTime(entry.changedAt)}
                </p>

                {entry.note && (
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {entry.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
