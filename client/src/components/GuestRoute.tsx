import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

/**
 * The mirror of ProtectedRoute: for pages that only make sense when signed
 * *out*, namely login and signup.
 *
 * Without it, an already-authenticated user who navigates to /login sees an
 * empty login form, which reads as "you have been signed out". Sending them to
 * the dashboard instead is what every app they have used does.
 *
 * It waits on `loading` for the same reason ProtectedRoute does — deciding
 * before the session check has finished would show the login form to someone
 * who is already signed in.
 */
export default function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
