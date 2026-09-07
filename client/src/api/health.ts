import { apiClient } from './client';
import type { HealthResponse } from '../types/api';

/**
 * API functions are plain async functions that return data and let errors
 * throw. They contain no React and no caching logic — that belongs to the
 * React Query hooks in src/hooks. The split keeps the network layer testable
 * on its own and stops components from knowing anything about axios.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/api/health');
  return data;
}
