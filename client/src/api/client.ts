import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  timeout: 15_000,
});
export interface ApiErrorBody {
  error: string;
  statusCode: number;
}
export function getApiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error) return body.error;

    // No response at all — the request never made it to the API.
    if (!err.response) {
      return 'Cannot reach the API server. Is it running?';
    }
    return err.message || fallback;
  }

  if (err instanceof Error) return err.message;
  return fallback;
}
