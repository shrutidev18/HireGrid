import { Router } from 'express';

import { getAnalysis, reanalyze } from '../controllers/analysisController';
import { requireAuth } from '../middleware/authMiddleware';

/**
 * Analysis routes, nested under an application.
 *
 * They live in their own file rather than in applications.routes.ts because
 * they are a separate concern with their own controller and service — but they
 * are mounted at the same `/api/applications` path, because an analysis has no
 * meaning independent of the application it belongs to. That nesting is also
 * what makes the authorisation simple: ownership is checked on the parent
 * application, so there is no route by which an analysis can be reached
 * without owning the thing it describes.
 */
const router = Router();

router.use(requireAuth);

router.get('/:id/analysis', getAnalysis);
router.post('/:id/reanalyze', reanalyze);

export default router;
