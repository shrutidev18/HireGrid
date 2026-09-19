import { useEffect, useState } from 'react';

/**
 * Returns `value` only once it has stopped changing for `delayMs`.
 *
 * Used for the search box. Typing "infosys" is seven state updates in about a
 * second, and without this each one would be a distinct React Query key and
 * therefore a distinct request — six of which are already obsolete by the time
 * they return. That is six unnecessary database queries per word, and it also
 * invites the out-of-order problem where a slower earlier request lands after
 * a faster later one and overwrites the correct results with stale ones.
 *
 * Debouncing rather than throttling because the useful moment is the *pause*.
 * A user searching does not want results for "inf"; they want results once
 * they have finished typing what they mean.
 *
 * The cleanup is the mechanism, not housekeeping: every change cancels the
 * timer the previous change started, so only the last one in a burst survives
 * to fire.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
