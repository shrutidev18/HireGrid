import { AxiosError } from 'axios';

import { apiClient } from './client';
import type { AuthResponse, LoginPayload, SignupPayload, User } from '../types/api';

export async function signup(payload: SignupPayload): Promise<User> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/signup', payload);
  return data.user;
}

export async function login(payload: LoginPayload): Promise<User> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/login', payload);
  return data.user;
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}

export async function fetchMe(): Promise<User | null> {
  try {
    const { data } = await apiClient.get<AuthResponse>('/api/auth/me');
    return data.user;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 401) {
      return null;
    }
    throw err;
  }
}
