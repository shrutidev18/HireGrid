import { AxiosError } from 'axios';

import { apiClient } from './client';
import type { AuthResponse, LoginPayload, SignupPayload, User } from '../types/api';

/**
 * Auth API calls.
 *
 * Notice what is missing from every function here: any handling of a token.
 * The server sets it as an httpOnly cookie and the browser attaches it
 * automatically on subsequent requests, because the shared axios instance is
 * configured with `withCredentials: true`. There is nothing for the app to
 * store, pass around, or accidentally leak.
 */

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

/**
 * Asks the server who the current user is, based on the cookie the browser
 * sends. This is how a page refresh restores the session: there is no client
 * state to rehydrate, so the app asks the server on mount.
 *
 * A 401 here is not an error — it is the expected answer for a visitor who is
 * not logged in. Returning `null` instead of throwing keeps that out of React
 * Query's error state, so the app can distinguish "not logged in" (null) from
 * "the API is unreachable" (a thrown error).
 */
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
