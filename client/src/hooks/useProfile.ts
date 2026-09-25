import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as profileApi from '../api/profile';
import { AUTH_QUERY_KEY } from '../context/AuthContext';
import type { ChangePasswordPayload, UpdateProfilePayload } from '../types/api';

export const profileKeys = {
  all: ['profile'] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: profileApi.fetchProfile,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => profileApi.updateProfile(payload),

    onSuccess: (profile) => {
      queryClient.setQueryData(profileKeys.all, profile);

      /**
       * The header greets the user by name, and that name comes from
       * `/api/auth/me` — a different cache entry. Without this invalidation,
       * renaming yourself updates the form and leaves the old name in the
       * navbar until a full page reload.
       */
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => profileApi.changePassword(payload),
  });
}
