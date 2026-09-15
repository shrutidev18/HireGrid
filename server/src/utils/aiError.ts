/**
 * Classifies failures from the AI provider into "worth retrying later" and
 * "retrying will not help".
 *
 * The distinction matters because the two need opposite handling:
 *
 *   - A **503 "high demand"** or a **429 rate limit** says the request was
 *     fine and the service was momentarily unable to serve it. Retrying is
 *     exactly right — but not immediately, because the same overloaded model
 *     will still be overloaded a millisecond later. These need backoff.
 *
 *   - A **400 bad request**, a **401 invalid key**, or a response that is not
 *     valid JSON says something about the request or the model's output. The
 *     same request will fail the same way in thirty seconds, so backing off
 *     only delays telling the user.
 *
 * Treating both the same way is how a transient blip becomes a permanent
 * "analysis failed" on the user's screen.
 */
export class AiServiceError extends Error {
  /** HTTP status from the provider, when there was one. */
  public readonly status: number | undefined;

  /** Whether waiting and trying again could plausibly succeed. */
  public readonly retryable: boolean;

  constructor(message: string, status: number | undefined, retryable: boolean) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
    this.retryable = retryable;

    Object.setPrototypeOf(this, AiServiceError.prototype);
  }
}

/**
 * Statuses that mean "the service could not serve this right now".
 *
 * 429 — rate limited. 500/502/503/504 — the provider is overloaded or having
 * trouble. All of these are about capacity, not about the request.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Whether a value is plausibly an HTTP status code rather than some other number. */
function isHttpStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
}

/**
 * Digs the HTTP status out of whatever the SDK threw.
 *
 * The Gemini SDK reports errors inconsistently depending on where they come
 * from — sometimes a `status` property, sometimes a message that is a JSON
 * blob like `{"error":{"code":503,...}}`. Both are checked rather than
 * assuming one shape, because guessing wrong here silently reclassifies every
 * transient failure as permanent.
 */
function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };

  if (isHttpStatus(candidate.status)) return candidate.status;

  /**
   * `.code` is checked *after* a range guard, and the guard is the whole point.
   *
   * A `DOMException` carries a legacy numeric `code` — 20 for an abort. Read as
   * an HTTP status, 20 is not in the retryable set, so every timeout was
   * classified as a permanent failure. Node also puts string codes here
   * (`ECONNRESET`), which is why the type check alone was not enough.
   *
   * Nothing outside 100–599 is an HTTP status, so nothing outside that range
   * gets to pretend to be one.
   */
  if (isHttpStatus(candidate.code)) return candidate.code;

  if (typeof candidate.message === 'string') {
    // e.g. {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}
    const match = /"code"\s*:\s*(\d{3})/.exec(candidate.message);
    if (match?.[1]) return Number(match[1]);
  }

  return undefined;
}

/**
 * Patterns that mean "the network or the clock got in the way", not "the
 * request was wrong".
 *
 * `abort` is in here for a specific and initially misleading reason. When the
 * 60-second `AbortController` in aiService fires, the *underlying* cause is
 * almost always that the provider was slow or was internally retrying a 503 —
 * exactly the situation backoff exists for. But the error that surfaces is no
 * longer recognisable as a 503: the SDK re-wraps the DOMException as a plain
 * `Error` whose message is "This operation was aborted" and whose `name` is
 * just "Error", so neither a status code nor `name === 'AbortError'` survives.
 * Matching on the message is what keeps a timed-out call in the retry path
 * instead of failing the analysis on the first slow response.
 */
const TRANSIENT_MESSAGE_PATTERN =
  /abort|timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed|network/i;

/**
 * Reads `name` and `message` without relying on `instanceof Error`.
 *
 * Not every thrown value is an `Error`: a `DOMException` does not reliably
 * pass that check across Node versions, and an SDK may throw a plain object.
 * Falling back to `String(error)` in those cases loses the message, and a lost
 * message here means a transient failure gets classified as permanent.
 */
function describe(error: unknown): { name: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown };

    return {
      name: typeof candidate.name === 'string' ? candidate.name : '',
      message:
        typeof candidate.message === 'string' ? candidate.message : String(error),
    };
  }

  return { name: '', message: String(error) };
}

/** Turns any thrown value into a classified `AiServiceError`. */
export function classifyAiError(error: unknown): AiServiceError {
  const status = extractStatus(error);
  const { name, message } = describe(error);

  if (status !== undefined) {
    return new AiServiceError(message, status, RETRYABLE_STATUSES.has(status));
  }

  // No status at all: a socket error, a DNS failure, or our own 60s abort.
  // These are network-shaped problems, and a network-shaped problem is worth
  // trying again after a pause.
  const looksTransient =
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    TRANSIENT_MESSAGE_PATTERN.test(message);

  return new AiServiceError(message, undefined, looksTransient);
}
