/**
 * An error the server raised deliberately, with a message that is safe to show
 * the client and an HTTP status to send with it.
 *
 * The distinction that matters: an `AppError` is *expected* ("Application not
 * found", "Invalid credentials"). Anything else reaching the error handler is
 * *unexpected* — a bug, a dropped database connection — and the client is told
 * only "Internal server error" while the real detail goes to the server log.
 * That split is what keeps internal information from leaking in responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  /** Marks this as a known, handled condition rather than a crash. */
  public readonly isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;

    // Without this, `instanceof AppError` breaks when targeting ES5/ES6 class
    // downlevelling, and the stack trace points at this constructor instead of
    // the call site.
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — the request itself was malformed or failed validation. */
export const badRequest = (message: string): AppError => new AppError(message, 400);

/** 401 — not authenticated: no token, expired token, bad credentials. */
export const unauthorized = (message = 'Not authenticated'): AppError =>
  new AppError(message, 401);

/**
 * 403 — authenticated, but not allowed to perform this action.
 *
 * Note: for resources owned by another user we deliberately return 404 via
 * `notFound()` instead, so the API never confirms that someone else's record
 * exists. 403 is reserved for cases where the user's own permission level is
 * the problem.
 */
export const forbidden = (message = 'Not authorized'): AppError =>
  new AppError(message, 403);

/** 404 — the resource does not exist, or does not belong to this user. */
export const notFound = (message = 'Resource not found'): AppError =>
  new AppError(message, 404);

/** 409 — the request conflicts with existing state (e.g. email already used). */
export const conflict = (message: string): AppError => new AppError(message, 409);
