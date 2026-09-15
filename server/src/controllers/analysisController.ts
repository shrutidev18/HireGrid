import type { Request, Response } from 'express';

import { getUserId } from '../middleware/authMiddleware';
import { idParamSchema } from '../utils/validators';
import * as analysisService from '../services/analysisService';

/**
 * GET /api/applications/:id/analysis
 *
 * Returns whatever state the analysis is in — PENDING, COMPLETED or FAILED.
 * This is the endpoint the client polls, so it has to answer the same way
 * regardless of outcome; the *status field* is the answer, not the HTTP code.
 */
export async function getAnalysis(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);

  const analysis = await analysisService.getAnalysis(getUserId(req), id);

  // `null` when no analysis has ever been requested — an application saved
  // without a resume. A normal state, not an error, and the client renders a
  // prompt rather than a failure.
  res.status(200).json({ analysis });
}

/**
 * POST /api/applications/:id/reanalyze
 *
 * Resets the result to PENDING and queues a fresh job. Used by the Retry
 * button after a failure, and whenever the user wants the analysis re-run
 * against an edited resume or job description.
 *
 * Note this can legitimately return in milliseconds having done no AI work at
 * all: if the resume and job description are unchanged, the worker will find
 * the cached result and complete almost immediately.
 */
export async function reanalyze(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);

  await analysisService.requestAnalysis(getUserId(req), id);

  // The literal shape the specification asks for. It tells the client what to
  // expect on its next poll rather than making it guess.
  res.status(202).json({ status: 'PENDING' });
}
