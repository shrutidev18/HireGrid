import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as applicationsApi from '../api/applications';
import type {
  ApplicationListQuery,
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

  /**
   * One cache entry per unique combination of search, filters, sort and page.
   *
   * The query object is part of the key, which is the whole mechanism. Without
   * it every filter combination would share one entry, so switching from
   * "Offer" to "Rejected" would show the previous filter's rows until the
   * refetch landed — and going back would refetch something already held.
   * With it, results are cached per combination, so returning to a filter you
   * used a moment ago is instant.
   *
   * It nests under `lists()` so `invalidateQueries({ queryKey: lists() })`
   * still invalidates every filtered view at once. A mutation does not need to
   * know which filters are currently on screen.
   */
  list: (query: ApplicationListQuery) => [...applicationKeys.lists(), query] as const,

  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
};

/**
 * One page of applications for the current search, filters and sort.
 *
 * `placeholderData: keepPreviousData` is what stops the table flashing empty
 * on every keystroke and page change. Without it each new key is a cache miss,
 * so the component re-renders with no data while the request is in flight and
 * the table collapses to its empty state and back. Keeping the previous page
 * visible while the next one loads turns that flicker into a quiet update.
 */
export function useApplicationsList(query: ApplicationListQuery) {
  return useQuery({
    queryKey: applicationKeys.list(query),
    queryFn: () => applicationsApi.fetchApplications(query),
    placeholderData: keepPreviousData,
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
