import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api/health';

/**
 * All server state in this app is read through React Query hooks like this one
 * — never through useState + useEffect fetch chains. React Query gives us
 * caching, deduplication of identical in-flight requests, retries, and the
 * `isPending / isError / data` state machine for free, and it is the mechanism
 * the AI-analysis polling in a later phase will be built on.
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,

    // Connectivity is worth re-checking; it is not expensive and it is the
    // thing most likely to change while the page is open.
    staleTime: 10_000,
    retry: 1,
  });
}
