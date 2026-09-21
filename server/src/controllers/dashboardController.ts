import type { Request, Response } from 'express';

import { getUserId } from '../middleware/authMiddleware';
import * as dashboardService from '../services/dashboardService';

/**
 * GET /api/dashboard
 *
 * One endpoint for the whole screen. No query parameters, no request body —
 * the only input is the user id from the verified token, which is why there is
 * nothing here to validate.
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const dashboard = await dashboardService.getDashboard(getUserId(req));

  res.status(200).json(dashboard);
}
