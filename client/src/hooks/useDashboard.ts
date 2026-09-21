import { useQuery } from '@tanstack/react-query';

import * as dashboardApi from '../api/dashboard';

export const dashboardKeys = {
  all: ['dashboard'] as const,
};

/**
 * The dashboard payload.
 *
 * No polling and no aggressive refetching: the server already caches this for
 * five minutes and invalidates on every write, so asking more often would
 * mostly re-fetch a byte-identical payload. React Query's default refetch on
 * window focus is the right cadence — you look at the tab, you get current
 * numbers.
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: dashboardApi.fetchDashboard,
  });
}
