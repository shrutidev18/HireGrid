import { Router } from 'express';

import {
  deleteResume,
  downloadResume,
  getResume,
  listResumes,
  uploadResume,
} from '../controllers/resumesController';
import { requireAuth } from '../middleware/authMiddleware';
import { uploadResumeFile } from '../middleware/uploadMiddleware';

const router = Router();

/** Every resume route requires a session — including the file download. */
router.use(requireAuth);

/**
 * The upload middleware runs before the controller, so a file of the wrong
 * type or over 5 MB is rejected before any business logic — and before any
 * database query — happens.
 */
router.post('/', uploadResumeFile, uploadResume);

router.get('/', listResumes);
router.get('/:id', getResume);

/**
 * Declared before `/:id` would matter if the router matched in order; React
 * Router-style specificity does not apply here, but `/:id/download` is a
 * distinct path from `/:id` so both resolve unambiguously either way.
 */
router.get('/:id/download', downloadResume);

router.delete('/:id', deleteResume);

export default router;
