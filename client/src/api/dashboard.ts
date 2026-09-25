import { apiClient } from './client';
import type { DashboardPayload } from '../types/api';
export async function fetchDashboard(): Promise<DashboardPayload> {
  const { data } = await apiClient.get<DashboardPayload>('/api/dashboard');
  return data;
}
