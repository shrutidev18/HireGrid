import { apiClient } from "./client";
import type { Resume } from "../types";

export async function uploadResume(file: File) {
  const formData = new FormData();
  formData.append("resume", file);

  const res = await apiClient.post<{ id: string; fileName: string; createdAt: string }>(
    "/resumes",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function getResumes() {
  const res = await apiClient.get<{ resumes: Resume[] }>("/resumes");
  return res.data.resumes;
}

export async function deleteResume(id: string) {
  await apiClient.delete(`/resumes/${id}`);
}
