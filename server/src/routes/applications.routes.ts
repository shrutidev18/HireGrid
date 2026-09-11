import { Router } from 'express';

import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
  updateApplicationStatus,
} from '../controllers/applicationsController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Applied once, at the top, rather than repeated on each route.
 *
 * Router-level middleware runs before every handler in this file, including
 * any added later. That is the point: a route added below cannot be forgotten
 * and end up publicly readable, because there is no per-route opt-in to
 * forget. Every application endpoint is authenticated by construction.
 */
router.use(requireAuth);

router.get('/', listApplications);
router.post('/', createApplication);

router.get('/:id', getApplication);
router.put('/:id', updateApplication);
router.delete('/:id', deleteApplication);

/**
 * Status changes have their own endpoint because they do more than write a
 * field: they append a row to the application's history. PATCH rather than PUT
 * because it modifies one attribute rather than replacing the resource.
 */
router.patch('/:id/status', updateApplicationStatus);

export default router;
