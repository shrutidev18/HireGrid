import { createContext, useCallback, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as authApi from '../api/auth';
import type { LoginPayload, SignupPayload, User } from '../types/api';

/**
 * The one piece of state in this app that genuinely belongs in Context.
 *
 * Everything else — applications, resumes, analyses — is server state and is
 * read through React Query hooks where it is needed. Auth is different only
 * because *every* part of the tree needs to know whether someone is signed in,
 * and passing that down by props would mean threading it through every
 * component in between.
 *
 * Under the hood this is still React Query, not a hand-rolled
 * useState + useEffect fetch. The Context is a thin, convenient face over a
 * cached query, so the session benefits from the same deduplication and cache
 * behaviour as the rest of the app's data.
 */
export interface AuthContextValue {
  /** The signed-in user, or null when nobody is signed in. */
  user: User | null;

  /**
   * True only during the initial "who am I?" check on page load.
   *
   * This is what stops the app flashing the login page for a moment before
   * realising the visitor already has a valid session.
   */
  loading: boolean;

  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Cache key for the current session. */
export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  /**
   * The session. Runs once when the app mounts and asks the server who the
   * cookie belongs to — which is the entire mechanism behind "refresh the page
   * and you are still logged in". Nothing is persisted client-side; the cookie
   * is the session, and the server is the authority on it.
   */
  const { data, isPending } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: authApi.fetchMe,

    // `fetchMe` returns null for a 401 rather than throwing, so a retry would
    // only ever repeat a network failure. One attempt is right.
    retry: false,

    // The session does not go stale on a timer; it changes only through the
    // mutations below, which update this cache entry directly.
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      // Write the user straight into the cache instead of invalidating and
      // refetching: the login response already contains it, so a second
      // round trip to /me would tell us nothing new.
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
  });

  const signupMutation = useMutation({
    mutationFn: authApi.signup,
    onSuccess: (user) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Drop every cached query, not just the session.
      //
      // This matters: if one user logs out and another logs in on the same
      // browser, any applications, resumes or dashboard data still sitting in
      // the cache would be rendered to the second user before their own data
      // arrives. Clearing on logout makes that impossible.
      queryClient.clear();

      // Then set the session explicitly, so the UI switches to logged-out
      // immediately rather than flickering through a refetch of /me.
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    },
  });

  // `mutateAsync` rather than `mutate` so callers can `await` the result and
  // catch failures — the forms need to know whether to show an error.
  const login = useCallback(
    async (payload: LoginPayload) => {
      await loginMutation.mutateAsync(payload);
    },
    [loginMutation],
  );

  const signup = useCallback(
    async (payload: SignupPayload) => {
      await signupMutation.mutateAsync(payload);
    },
    [signupMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  // Memoised so the context value is not a brand-new object on every render,
  // which would re-render every consumer in the tree for no reason.
  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      loading: isPending,
      login,
      signup,
      logout,
    }),
    [data, isPending, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
