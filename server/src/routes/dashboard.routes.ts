import { Router } from 'express';

import { getDashboard } from '../controllers/dashboardController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Router-level, as everywhere else: a route added below cannot forget to
 * authenticate, because there is no per-route opt-in to forget.
 */
router.use(requireAuth);

router.get('/', getDashboard);

export default router;
