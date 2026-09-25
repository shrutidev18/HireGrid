import { apiClient } from './client';
import type { ChangePasswordPayload, Profile, UpdateProfilePayload } from '../types/api';

export async function fetchProfile(): Promise<Profile> {
  const { data } = await apiClient.get<{ profile: Profile }>('/api/profile');
  return data.profile;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<Profile> {
  const { data } = await apiClient.put<{ profile: Profile }>('/api/profile', payload);
  return data.profile;
}

/**
 * Separate call, separate endpoint — the password never travels alongside the
 * rest of the form, and a failed password change cannot roll back a successful
 * profile save.
 */
export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.put('/api/profile/password', payload);
}
