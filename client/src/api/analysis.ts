import { apiClient } from './client';
import type { AnalysisResult } from '../types/api';
export async function fetchAnalysis(applicationId: string): Promise<AnalysisResult | null> {
  const { data } = await apiClient.get<{ analysis: AnalysisResult | null }>(
    `/api/applications/${applicationId}/analysis`,
  );
  return data.analysis;
}
export async function reanalyze(applicationId: string): Promise<void> {
  await apiClient.post(`/api/applications/${applicationId}/reanalyze`);
}
