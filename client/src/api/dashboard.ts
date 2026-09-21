import { apiClient } from './client';
import type { DashboardPayload } from '../types/api';

/**
 * One request for the whole dashboard.
 *
 * Six widgets, one call. Separate endpoints per widget would mean six round
 * trips and six independently-timed snapshots — a funnel that sums to 24 beside
 * a total that says 25, because an application was created between two of the
 * requests.
 */
export async function fetchDashboard(): Promise<DashboardPayload> {
  const { data } = await apiClient.get<DashboardPayload>('/api/dashboard');
  return data;
}
