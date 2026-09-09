import { Router } from 'express';

import { login, logout, me, signup } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Public — these are how a user gets a session in the first place, so they
 * cannot require one. They are also the only routes in the entire API that
 * are reachable without authentication (along with /api/health).
 */
router.post('/signup', signup);
router.post('/login', login);

/**
 * Public by design. Logging out with an already-expired token should still
 * clear the stale cookie rather than answering 401 and leaving it behind.
 */
router.post('/logout', logout);

/**
 * Protected. `requireAuth` runs first and either attaches `req.userId` or
 * ends the request with 401 — the handler below never runs for an
 * unauthenticated caller.
 */
router.get('/me', requireAuth, me);

export default router;
