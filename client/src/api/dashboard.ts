import { apiClient } from "./client";
import type { Application, ApplicationStatus } from "../types";

export interface DashboardData {
  totalApplications: number;
  statusCounts: Record<ApplicationStatus, number>;
  recentApplications: Application[];
}

export async function getDashboard() {
  const res = await apiClient.get<DashboardData>("/dashboard");
  return res.data;
}
