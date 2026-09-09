import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/jwt';

/**
 * Teaches TypeScript that a Request may carry `userId`.
 *
 * Express's Request type is fixed, so middleware that attaches data to it has
 * to widen the interface. Declaring it here — in the module that actually sets
 * the property — keeps the declaration next to the code responsible for it.
 *
 * It is optional rather than required because it is genuinely absent on public
 * routes. That forces every protected handler to acknowledge the possibility,
 * instead of trusting a value the type system merely promised.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Gate for every route that needs a logged-in user.
 *
 * Reads the JWT from the httpOnly cookie, verifies its signature and expiry,
 * and puts the user id on the request for handlers downstream. Anything that
 * fails — no cookie, tampered payload, expired token — is one answer: 401.
 *
 * What it deliberately does *not* do is hit the database. Verifying a
 * signature is pure CPU and takes microseconds; a lookup on every single
 * authenticated request would add a query to every endpoint in the app. The
 * handlers that need the user record fetch it themselves.
 *
 * This is the middleware every protected route from here on is mounted
 * behind, and it is the mechanism behind the rule that a user can only ever
 * reach their own data: `req.userId` is derived from a signed token, never
 * from anything the client can set, and every query is scoped by it.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;

  if (!token) {
    next(new AppError('Unauthorized', 401));
    return;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    next(new AppError('Unauthorized', 401));
    return;
  }

  req.userId = payload.userId;
  next();
}
