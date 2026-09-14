import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as resumesApi from '../api/resumes';
import { applicationKeys } from './useApplications';

/** Query keys for resumes, built from one place — see useApplications. */
export const resumeKeys = {
  all: ['resumes'] as const,
  lists: () => [...resumeKeys.all, 'list'] as const,
  detail: (id: string) => [...resumeKeys.all, 'detail', id] as const,
};

/** Every resume the user has uploaded. */
export function useResumesList() {
  return useQuery({
    queryKey: resumeKeys.lists(),
    queryFn: resumesApi.fetchResumes,
  });
}

/** One resume, with the applications using it. */
export function useResume(id: string | undefined) {
  return useQuery({
    queryKey: resumeKeys.detail(id ?? ''),
    queryFn: () => resumesApi.fetchResume(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Uploads a resume.
 *
 * `onProgress` is threaded through the mutation rather than held in the hook,
 * because progress is per-upload UI state that belongs to the component
 * showing the bar — React Query tracks whether a mutation is running, not how
 * far along it is.
 */
export function useUploadResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (percent: number) => void;
    }) => resumesApi.uploadResume(file, onProgress),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
    },
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumesApi.deleteResume(id),

    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: resumeKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });

      // Applications carry the resume's name, so a deleted resume makes both
      // the list and any open detail page stale. Deleting a resume that is
      // still referenced is blocked by the server, but a resume can be removed
      // after the applications using it were themselves deleted.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}
