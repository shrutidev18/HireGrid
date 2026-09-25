import type { Request, Response } from 'express';

import { getUserId } from '../middleware/authMiddleware';
import { changePasswordSchema, updateProfileSchema } from '../utils/validators';
import * as profileService from '../services/profileService';
import * as authService from '../services/authService';

/**
 * As everywhere in this codebase: read the request, call a service, shape the
 * response. No database access, no business rules, and no try/catch — Express 5
 * forwards a rejected promise to the centralized error handler, which turns a
 * ZodError into a 400 naming the offending field.
 */

/** GET /api/profile */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const profile = await profileService.getProfile(getUserId(req));

  res.status(200).json({ profile });
}

/** PUT /api/profile */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const input = updateProfileSchema.parse(req.body);

  const profile = await profileService.updateProfile(getUserId(req), input);

  res.status(200).json({ profile });
}

/**
 * PUT /api/profile/password
 *
 * Returns a bare confirmation rather than the user. Nothing about the account
 * changed that the client does not already know, and a response body is one
 * more place a password field could accidentally be echoed back.
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  const input = changePasswordSchema.parse(req.body);

  await authService.changePassword(getUserId(req), input);

  res.status(200).json({ message: 'Password updated' });
}
