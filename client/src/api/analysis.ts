import { apiClient } from './client';
import type { AnalysisResult } from '../types/api';

/**
 * Analysis API calls.
 *
 * Both endpoints are nested under an application, because an analysis has no
 * meaning apart from the application it describes — and that nesting is what
 * makes the server's ownership check straightforward.
 */

/**
 * The current analysis, in whatever state it is in.
 *
 * Returns `null` when no analysis has been requested — an application saved
 * without a resume. That is a normal state, not an error, so the server sends
 * 200 with a null body rather than a 404; the client renders a prompt.
 */
export async function fetchAnalysis(applicationId: string): Promise<AnalysisResult | null> {
  const { data } = await apiClient.get<{ analysis: AnalysisResult | null }>(
    `/api/applications/${applicationId}/analysis`,
  );
  return data.analysis;
}

/**
 * Resets the analysis to PENDING and queues a fresh job.
 *
 * Returns almost immediately — it only enqueues. The result arrives through
 * polling, which is the whole point of the queue.
 */
export async function reanalyze(applicationId: string): Promise<void> {
  await apiClient.post(`/api/applications/${applicationId}/reanalyze`);
}
