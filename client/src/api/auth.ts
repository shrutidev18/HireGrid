import { apiClient } from "./client";
import type { User } from "../types";

export async function signup(name: string, email: string, password: string) {
  const res = await apiClient.post<{ user: User }>("/auth/signup", { name, email, password });
  return res.data.user;
}

export async function login(email: string, password: string) {
  const res = await apiClient.post<{ user: User }>("/auth/login", { email, password });
  return res.data.user;
}

export async function logout() {
  await apiClient.post("/auth/logout");
}

export async function getMe() {
  const res = await apiClient.get<{ user: User }>("/auth/me");
  return res.data.user;
}
