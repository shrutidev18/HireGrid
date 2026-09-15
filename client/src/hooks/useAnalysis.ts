import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as analysisApi from '../api/analysis';
import { applicationKeys } from './useApplications';

export const analysisKeys = {
  all: ['analysis'] as const,
  detail: (applicationId: string) => [...analysisKeys.all, applicationId] as const,
};

/** How often to ask again while an analysis is still running. */
const POLL_INTERVAL_MS = 3000;

/**
 * The current analysis, polled **only while it is running**.
 *
 * This is the client half of the async pipeline. The server returns
 * immediately after queueing a job, so the browser has to find out when the
 * answer is ready. Two ways to do that: the server pushes (WebSockets), or the
 * client asks again (polling). Polling was chosen deliberately — the build
 * rules rule out a WebSocket library, and for an event that happens once per
 * application and takes a few seconds, a persistent connection per user is a
 * lot of machinery for very little.
 *
 * The important detail is that `refetchInterval` is a **function**, not a
 * number. A fixed interval would keep asking forever, including for analyses
 * that finished an hour ago, on every open tab — steady pointless load on the
 * API for the entire time a page is left open. Returning `false` once the
 * status is terminal stops it dead the moment there is nothing left to wait
 * for.
 */
export function useAnalysis(applicationId: string | undefined) {
  return useQuery({
    queryKey: analysisKeys.detail(applicationId ?? ''),
    queryFn: () => analysisApi.fetchAnalysis(applicationId as string),
    enabled: Boolean(applicationId),

    refetchInterval: (query) => {
      const analysis = query.state.data;

      // Keep asking only while the worker is still working. COMPLETED,
      // FAILED, and "no analysis at all" are all final as far as polling is
      // concerned.
      return analysis?.status === 'PENDING' ? POLL_INTERVAL_MS : false;
    },

    // Polling continues while the tab is in the background. Without this the
    // user switches away to read the job posting, comes back, and finds the
    // spinner exactly where they left it.
    refetchIntervalInBackground: true,

    // The result changes underneath us by design, so a cached value should not
    // be treated as fresh.
    staleTime: 0,
  });
}

/** Re-runs the analysis — used by the Retry button and by manual re-analysis. */
export function useReanalyze(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => analysisApi.reanalyze(applicationId),

    onSuccess: () => {
      // Invalidate rather than write a value: the server has just reset the
      // row to PENDING, and refetching picks that up — which is also what
      // restarts polling, since the interval function keys off the status.
      void queryClient.invalidateQueries({ queryKey: analysisKeys.detail(applicationId) });

      // The application list shows the match score, so it is stale too.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}
