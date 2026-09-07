import axios, { AxiosError } from 'axios';

/**
 * The single axios instance every API call in the app goes through.
 *
 * Nothing else in the codebase imports axios directly. One instance means the
 * base URL, the credential policy, and (from the auth phase onward) the 401
 * handling are configured in exactly one place instead of being repeated — and
 * misconfigured — at each call site.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,

  /**
   * Sends and accepts cookies on cross-origin requests. This is the single
   * most important line in this file: the JWT lives in an httpOnly cookie the
   * browser must attach automatically, because JavaScript deliberately cannot
   * read it. Without `withCredentials`, the browser silently drops that cookie
   * and every authenticated request comes back 401 with no visible cause.
   *
   * It only works because the server names an exact CORS origin and sets
   * `credentials: true` — the two settings are a matched pair.
   */
  withCredentials: true,

  headers: {
    'Content-Type': 'application/json',
  },

  // A request that hangs forever leaves the UI stuck in a loading state with
  // no way out. Failing after 15s at least produces an error to render.
  timeout: 15_000,
});

/** The error body shape the API returns for every failed request. */
export interface ApiErrorBody {
  error: string;
  statusCode: number;
}

/**
 * Pulls a human-readable message out of whatever axios threw.
 *
 * Three cases have to be told apart, because they mean different things to the
 * user: the server answered with an error body, the server was never reached
 * (offline, wrong port, API not running), or something non-axios failed.
 */
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
