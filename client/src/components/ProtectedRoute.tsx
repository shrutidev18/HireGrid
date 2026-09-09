import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

/**
 * Gate for any page that requires a signed-in user.
 *
 * Three states, and the middle one is the reason this component exists:
 *
 *   loading  → the "who am I?" request is still in flight. Render a
 *              placeholder. Skipping this and treating "no user yet" as
 *              "not logged in" is the classic bug: a signed-in user refreshes
 *              the page, gets bounced to /login for a moment, then bounced
 *              back once the session resolves.
 *   no user  → redirect to /login.
 *   user     → render the page.
 *
 * This is convenience and UX, not security. It hides pages in the browser; it
 * does not protect data. The actual protection is `requireAuth` on the server,
 * which refuses to return anything without a valid token no matter what the
 * client renders.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600"
            role="status"
            aria-label="Checking your session"
          />
          <p className="text-sm text-slate-500">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // `replace` keeps the protected URL out of history, so the back button
    // does not bounce the visitor straight into another redirect. The path is
    // remembered in state so login can return them where they were headed.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
