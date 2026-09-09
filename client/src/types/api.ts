/**
 * Shapes returned by the HireGrid API.
 *
 * These are hand-written and must stay in step with the server's responses.
 * Keeping them in one folder rather than inline in components means a response
 * shape changes in exactly one place.
 */

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
}

/**
 * The only user shape the API ever returns.
 *
 * Note there is no `password` or `passwordHash` field — not because they are
 * omitted here, but because the server never sends them. If one ever appeared
 * in a response, this type would make it invisible to the app rather than
 * silently available.
 */
export interface User {
  id: string;
  name: string;
  email: string;
}

/** Response of signup, login and /me. */
export interface AuthResponse {
  user: User;
}

/** POST /api/auth/signup */
export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

/** POST /api/auth/login */
export interface LoginPayload {
  email: string;
  password: string;
}
