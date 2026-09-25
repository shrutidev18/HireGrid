import { Router } from 'express';

import { changePassword, getProfile, updateProfile } from '../controllers/profileController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Router-level, so a route added below cannot forget to authenticate. It
 * matters more here than anywhere else in the API: these routes read and write
 * the account's own credentials.
 */
router.use(requireAuth);

router.get('/', getProfile);
router.put('/', updateProfile);

/**
 * A separate endpoint from the profile form, not a field on it.
 *
 * Changing a password requires proving you know the old one, and that check
 * has no business running on a request that is only renaming a target role.
 * Two endpoints keep the credential path narrow and independently testable.
 */
router.put('/password', changePassword);

export default router;
