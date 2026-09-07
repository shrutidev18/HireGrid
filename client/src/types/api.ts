/**
 * Shapes returned by the HireGrid API.
 *
 * These are hand-written for now and must stay in step with the server's
 * responses. Keeping them in one folder rather than inline in components means
 * a response shape changes in exactly one place.
 */

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
}
