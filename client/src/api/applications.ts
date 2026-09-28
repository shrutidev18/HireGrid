import { apiClient } from "./client";
import type { Application, ApplicationStatus } from "../types";

// fields the create/edit form sends - basically Application minus the stuff
// the server generates itself (id, timestamps, status history, etc)
export interface ApplicationFormData {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  employmentType: string;
  jobLink?: string;
  jobDescription: string;
  resumeId?: string;
  status?: string;
  dateApplied?: string;
  notes?: string;
}

export async function createApplication(data: ApplicationFormData) {
  const res = await apiClient.post<{ application: Application }>("/applications", data);
  return res.data.application;
}

export async function getApplication(id: string) {
  const res = await apiClient.get<{ application: Application }>(`/applications/${id}`);
  return res.data.application;
}

export async function getApplications(params: { search?: string; status?: string } = {}) {
  const res = await apiClient.get<{ applications: Application[] }>("/applications", { params });
  return res.data.applications;
}

export async function updateApplication(id: string, data: ApplicationFormData) {
  const res = await apiClient.put<{ application: Application }>(`/applications/${id}`, data);
  return res.data.application;
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  const res = await apiClient.patch<{ application: Application }>(`/applications/${id}/status`, { status });
  return res.data.application;
}

export async function deleteApplication(id: string) {
  await apiClient.delete(`/applications/${id}`);
}
