import { apiClient } from "./client";

export interface ProfileData {
  name: string;
  email: string;
  targetRole: string | null;
  experienceLevel: string | null;
  education: string | null;
  graduationYear: number | null;
  skills: string[];
}

export async function getProfile() {
  const res = await apiClient.get<ProfileData>("/profile");
  return res.data;
}

export async function updateProfile(data: ProfileData) {
  const res = await apiClient.put<ProfileData>("/profile", data);
  return res.data;
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  await apiClient.put("/profile/password", { currentPassword, newPassword });
}
