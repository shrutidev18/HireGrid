import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Token lifetime. Seven days is a deliberate middle ground: short enough that
 * a leaked token expires on its own, long enough that a user tracking job
 * applications is not logged out between sessions.
 *
 * Declared once, in seconds, and reused for both the JWT's own `exp` claim and
 * the cookie's `maxAge`. If the two disagreed, the user would either keep a
 * cookie the server rejects (mystery 401s) or lose the cookie while the token
 * is still valid.
 */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** The cookie the token travels in. Referenced by name in exactly two places. */
export const AUTH_COOKIE_NAME = 'token';

/**
 * What we put inside the token.
 *
 * Only the user id. A JWT is signed, not encrypted — anyone holding it can
 * base64-decode the payload and read it, so nothing sensitive goes in. Nor
 * does anything mutable: embedding the name or email would mean the token
 * carries a stale copy the moment the user edits their profile. The id is
 * enough to look up whatever is needed, fresh.
 */
export interface JwtPayload {
  userId: string;
}

/** Signs a token for the given user. */
export function signAuthToken(userId: string): string {
  return jwt.sign({ userId } satisfies JwtPayload, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/**
 * Verifies a token's signature and expiry.
 *
 * Returns `null` rather than throwing, so callers handle "no valid token" as
 * an ordinary branch. `jwt.verify` throws for expired tokens, tampered
 * payloads and malformed strings alike; from the API's point of view those are
 * all the same answer — 401.
 *
 * The signature check is what makes this safe: the payload is readable by
 * anyone, but altering `userId` invalidates the signature, and forging a valid
 * one requires JWT_SECRET.
 */
export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // `verify` is typed as string | JwtPayload. A token we signed is always an
    // object with a string userId, but the check keeps a malformed token from
    // becoming an `undefined` userId that later code treats as valid.
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'userId' in decoded &&
      typeof decoded.userId === 'string'
    ) {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
}
