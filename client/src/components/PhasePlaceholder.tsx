/**
 * Stand-in for a page that a later phase builds.
 *
 * It exists so the routes it occupies are real from Phase 2 onward — routing,
 * the protected-route wrapper and the navigation can all be exercised and
 * verified now, rather than being written blind and first tested when the real
 * page lands. Each one is replaced wholesale by its actual page.
 */
export default function PhasePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-700">Coming in {phase}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          You are seeing this because you are signed in — which is exactly what this
          page is here to prove for now.
        </p>
      </div>
    </div>
  );
}
