import { useHealth } from '../hooks/useHealth';
import { getApiErrorMessage } from '../api/client';

/**
 * Phase 0 scaffolding page.
 *
 * It exists to prove three things end to end before any feature is built:
 *   1. Tailwind's utility classes are compiled and applied (this page is
 *      entirely unstyled if the Tailwind Vite plugin is not wired up).
 *   2. React Query is mounted and driving component state.
 *   3. The browser can reach the API across origins with credentials enabled —
 *      i.e. CORS is configured correctly on the server.
 *
 * It is replaced by the real Dashboard in a later phase.
 */
export default function HealthCheckPage() {
  const { data, isPending, isError, error, refetch, isFetching } = useHealth();

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            HG
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              HireGrid
            </h1>
            <p className="text-sm text-slate-500">Phase 0 — scaffolding check</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            API connection
          </p>

          {isPending && (
            <p className="text-sm text-slate-600">Contacting the API…</p>
          )}

          {isError && (
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-red-700">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                  aria-hidden="true"
                />
                Unreachable
              </p>
              <p className="mt-1 text-sm text-red-600">
                {getApiErrorMessage(error)}
              </p>
            </div>
          )}

          {data && (
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                Connected
              </p>
              <p className="mt-1 font-mono text-sm text-slate-600">
                GET /api/health → {JSON.stringify(data)}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? 'Checking…' : 'Re-check connection'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          If this box is styled and shows &ldquo;Connected&rdquo;, Tailwind,
          React Query, and CORS are all working.
        </p>
      </div>
    </main>
  );
}
