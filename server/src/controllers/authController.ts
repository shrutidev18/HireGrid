import type { CookieOptions, Request, Response } from 'express';

import { isProduction } from '../config/env';
import { AUTH_COOKIE_NAME, TOKEN_TTL_SECONDS, signAuthToken } from '../utils/jwt';
import { loginSchema, signupSchema } from '../utils/validators';
import { authenticateUser, createUser, getUserById } from '../services/authService';
import { unauthorized } from '../utils/AppError';

/**
 * How the auth cookie is written. Every flag here is doing a specific job.
 */
const authCookieOptions: CookieOptions = {
  /**
   * The single most important line in this file. `httpOnly` makes the cookie
   * unreadable from JavaScript — `document.cookie` simply does not include it.
   * That is why the token lives here and not in localStorage: a cross-site
   * scripting bug anywhere in the app can read localStorage and exfiltrate a
   * token, but it cannot read this cookie. The browser still attaches it to
   * every request automatically, so the app loses nothing.
   */
  httpOnly: true,

  /**
   * HTTPS-only in production. Left off in development because the dev server
   * is plain http://localhost, and a `secure` cookie there would simply never
   * be stored — auth would appear broken for no visible reason.
   */
  secure: isProduction,

  /**
   * CSRF defence. `lax` means the browser withholds this cookie on
   * cross-site POST requests, so a form on evil.com cannot make an
   * authenticated write to this API using the user's session.
   *
   * `lax` rather than `strict` because strict also withholds the cookie when
   * the user arrives by clicking a link from another site, which would make
   * them appear logged out on arrival. Note that localhost:5173 and
   * localhost:4000 are same-site — same-site is judged by domain, not port —
   * so this works in development. A production deployment on two different
   * domains would need `sameSite: 'none'` plus `secure: true`.
   */
  sameSite: 'lax',

  /**
   * Kept in step with the token's own expiry. Cookie maxAge is milliseconds,
   * the JWT's is seconds.
   */
  maxAge: TOKEN_TTL_SECONDS * 1000,

  /** Sent on every path, so the whole API is authenticated. */
  path: '/',
};

/**
 * Issues the session cookie.
 *
 * The token is written to the cookie and nowhere else — never into the JSON
 * body. Returning it in the body would invite the client to store it in
 * localStorage, which would undo the httpOnly protection above.
 */
function setAuthCookie(res: Response, userId: string): void {
  res.cookie(AUTH_COOKIE_NAME, signAuthToken(userId), authCookieOptions);
}

/**
 * POST /api/auth/signup
 *
 * No try/catch: Express 5 forwards a rejected promise to the centralized error
 * handler automatically, and `.parse()` throws a ZodError that the handler
 * turns into a 400 naming the offending field. Every handler in this file
 * relies on that, which is what keeps error responses identical everywhere.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const input = signupSchema.parse(req.body);

  const user = await createUser(input);

  setAuthCookie(res, user.id);

  // 201: a new resource was created. Signing up also logs you in, so the
  // client can go straight to the dashboard without a second round trip.
  res.status(201).json({ user });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);

  const user = await authenticateUser(input);

  setAuthCookie(res, user.id);

  res.status(200).json({ user });
}

/**
 * POST /api/auth/logout
 *
 * Clearing the cookie is the whole logout. The JWT itself remains
 * cryptographically valid until it expires — that is the trade-off of
 * stateless tokens: there is no server-side session to destroy. Revoking
 * before expiry would require a token blocklist in Redis, which is real work
 * for a threat model this app does not have.
 *
 * The options passed here must match those the cookie was set with (name,
 * path, sameSite, secure). A browser matches cookies for deletion on those
 * attributes, so a mismatch leaves the original cookie in place and the user
 * stays logged in.
 *
 * Deliberately not protected by auth middleware: logging out when your token
 * has already expired should still clear the stale cookie, not return 401.
 */
export function logout(_req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).json({ success: true });
}

/**
 * GET /api/auth/me
 *
 * How the frontend answers "am I logged in?" on page load. The browser sends
 * the cookie automatically; `requireAuth` has already verified it and set
 * `req.userId` by the time this runs.
 *
 * The user is re-read from the database rather than reconstructed from the
 * token, so an edited name or email shows up immediately instead of being
 * frozen until the token expires.
 */
export async function me(req: Request, res: Response): Promise<void> {
  // `requireAuth` guarantees this, but the check keeps the type honest and
  // fails safe if the route is ever mounted without the middleware.
  if (!req.userId) {
    throw unauthorized('Unauthorized');
  }

  const user = await getUserById(req.userId);

  // Valid signature, but the account is gone — a token can outlive its user.
  if (!user) {
    throw unauthorized('Unauthorized');
  }

  res.status(200).json({ user });
}
