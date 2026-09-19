import { apiClient } from './client';
import type {
  Application,
  ApplicationListQuery,
  ApplicationListResponse,
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

/**
 * One page of applications, filtered and sorted by the server.
 *
 * All of it happens server-side — the search, the filters, the sort and the
 * paging. Fetching every row and filtering in the browser would work fine with
 * thirty applications and fall over with three thousand, and it would send
 * every row to the client just to display twenty of them. Pushing the work to
 * the database is also what lets the indexes do their job.
 *
 * Empty values are stripped before the request, so a cleared filter disappears
 * from the URL rather than being sent as `status=`, which the server would
 * have to parse only to discard.
 */
export async function fetchApplications(
  query: ApplicationListQuery,
): Promise<ApplicationListResponse> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = String(value);
    }
  }

  const { data } = await apiClient.get<ApplicationListResponse>('/api/applications', {
    params,
  });

  return data;
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
