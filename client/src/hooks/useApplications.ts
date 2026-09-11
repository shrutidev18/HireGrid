import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as applicationsApi from '../api/applications';
import type {
  CreateApplicationPayload,
  UpdateApplicationPayload,
  UpdateStatusPayload,
} from '../types/api';

/**
 * Query keys, built from one place rather than written as literal arrays at
 * each call site.
 *
 * The hierarchy is what makes invalidation precise: invalidating
 * `applicationKeys.all` clears both the list and every detail page, while
 * `applicationKeys.detail(id)` refreshes exactly one. Hand-written keys drift
 * — one typo and an invalidation silently stops matching, which shows up as
 * "the UI doesn't update" long after the change that caused it.
 */
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
};

/** Every application the signed-in user is tracking. */
export function useApplicationsList() {
  return useQuery({
    queryKey: applicationKeys.lists(),
    queryFn: applicationsApi.fetchApplications,
  });
}

/** One application with its history and analysis. */
export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ''),
    queryFn: () => applicationsApi.fetchApplication(id as string),

    // Without this the query would fire with an empty id while the route
    // parameter is still resolving, producing a guaranteed 400.
    enabled: Boolean(id),

    // A 404 means the application does not exist or is not this user's.
    // Retrying cannot change that, and the delay just makes the error screen
    // slower to appear.
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 400) return false;
      return failureCount < 1;
    },
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateApplicationPayload) =>
      applicationsApi.createApplication(payload),

    onSuccess: (application) => {
      // Seed the detail cache with the response we already have, so navigating
      // to the new application renders immediately instead of showing a
      // loading state while refetching data we were just handed.
      queryClient.setQueryData(applicationKeys.detail(application.id), application);

      // The list is now stale — a row was added.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateApplicationPayload) =>
      applicationsApi.updateApplication(id, payload),

    onSuccess: (application) => {
      queryClient.setQueryData(applicationKeys.detail(id), application);
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/**
 * Moving an application to a new stage.
 *
 * Kept as its own hook rather than folded into `useUpdateApplication` because
 * it hits a different endpoint and has a different consequence — the server
 * appends a history row, so the timeline on screen is stale the moment this
 * succeeds.
 */
export function useUpdateApplicationStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateStatusPayload) =>
      applicationsApi.updateApplicationStatus(id, payload),

    onSuccess: (result) => {
      // The response includes the application with its refreshed history, so
      // the detail view can be updated without a second request.
      queryClient.setQueryData(applicationKeys.detail(id), result.application);

      // The list shows the status, so it needs refreshing too. Later phases
      // add a dashboard whose counts depend on this; invalidating the whole
      // `applications` subtree keeps that correct without this hook needing to
      // know what else exists.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => applicationsApi.deleteApplication(id),

    onSuccess: (_data, id) => {
      // Drop the detail entry outright rather than invalidating it —
      // invalidating would trigger a refetch of a record that no longer
      // exists, producing a pointless 404.
      queryClient.removeQueries({ queryKey: applicationKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}
