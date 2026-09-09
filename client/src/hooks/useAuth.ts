import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '../context/AuthContext';

/**
 * Reads the auth context.
 *
 * The throw is the point of wrapping `useContext` in a hook: the context's
 * default value is `undefined`, so a component rendered outside `AuthProvider`
 * would otherwise get `undefined` and fail later with "cannot read property
 * 'user' of undefined", far from the actual mistake. This fails immediately,
 * naming the cause.
 *
 * It also means the return type is `AuthContextValue`, never
 * `AuthContextValue | undefined`, so no consumer needs a null check.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }

  return context;
}
