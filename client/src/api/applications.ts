import { apiClient } from './client';
import type {
  Application,
  ApplicationListItem,
  CreateApplicationPayload,
  UpdateApplicationPayload,
  UpdateStatusPayload,
  UpdateStatusResponse,
} from '../types/api';

/**
 * Application API calls.
 *
 * Plain async functions that return data and let errors throw. No React, no
 * caching — that belongs to the hooks in src/hooks, which wrap these. The
 * split keeps the network layer testable on its own and stops components from
 * knowing anything about axios.
 */

export async function fetchApplications(): Promise<ApplicationListItem[]> {
  const { data } = await apiClient.get<{ applications: ApplicationListItem[] }>(
    '/api/applications',
  );
  return data.applications;
}

export async function fetchApplication(id: string): Promise<Application> {
  const { data } = await apiClient.get<{ application: Application }>(`/api/applications/${id}`);
  return data.application;
}

export async function createApplication(
  payload: CreateApplicationPayload,
): Promise<Application> {
  const { data } = await apiClient.post<{ application: Application }>(
    '/api/applications',
    payload,
  );
  return data.application;
}

export async function updateApplication(
  id: string,
  payload: UpdateApplicationPayload,
): Promise<Application> {
  const { data } = await apiClient.put<{ application: Application }>(
    `/api/applications/${id}`,
    payload,
  );
  return data.application;
}

/**
 * Separate from `updateApplication` because it is a different operation on the
 * server: it also appends to the application's history, inside a transaction.
 * Keeping them separate here mirrors that and makes it impossible to change a
 * status by accident while editing a field.
 */
export async function updateApplicationStatus(
  id: string,
  payload: UpdateStatusPayload,
): Promise<UpdateStatusResponse> {
  const { data } = await apiClient.patch<UpdateStatusResponse>(
    `/api/applications/${id}/status`,
    payload,
  );
  return data;
}

export async function deleteApplication(id: string): Promise<void> {
  await apiClient.delete(`/api/applications/${id}`);
}
