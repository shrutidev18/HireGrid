import type { Request, Response } from 'express';

import { getUserId } from '../middleware/authMiddleware';
import {
  createApplicationSchema,
  idParamSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
  updateStatusSchema,
} from '../utils/validators';
import * as applicationsService from '../services/applicationsService';

/**
 * Controllers here do exactly three things: read the request, call a service,
 * shape the response. No database access, no business rules, no branching on
 * anything but validation results.
 *
 * None of them use try/catch. Express 5 forwards a rejected promise to the
 * centralized error handler, and `.parse()` throws a ZodError the handler
 * turns into a 400 naming the offending field. That is what keeps every error
 * response in the API identical in shape.
 */

/**
 * GET /api/applications
 *
 * The one endpoint here that reads the query string. It uses `.parse()` like
 * the others, but the schema behind it never throws: invalid filters are
 * dropped rather than rejected, so a stale bookmarked URL still renders a
 * usable screen. See `listApplicationsQuerySchema` for why.
 */
export async function listApplications(req: Request, res: Response): Promise<void> {
  const query = listApplicationsQuerySchema.parse(req.query);

  const page = await applicationsService.listApplications(getUserId(req), query);

  // `{ data, total, page, pageSize }` rather than a bare array: a paginated
  // response has to carry the total, or the client cannot render a pager
  // without a second request to count.
  res.status(200).json(page);
}

/** POST /api/applications */
export async function createApplication(req: Request, res: Response): Promise<void> {
  const input = createApplicationSchema.parse(req.body);

  const application = await applicationsService.createApplication(getUserId(req), input);

  res.status(201).json({ application });
}

/** GET /api/applications/:id */
export async function getApplication(req: Request, res: Response): Promise<void> {
  // Params are validated too, not just bodies. A malformed id would otherwise
  // reach Prisma and surface as a 500 from a failed UUID cast instead of a
  // clean 400 — and it costs a database round trip to find that out.
  const { id } = idParamSchema.parse(req.params);

  const application = await applicationsService.getApplication(getUserId(req), id);

  res.status(200).json({ application });
}

/** PUT /api/applications/:id */
export async function updateApplication(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateApplicationSchema.parse(req.body);

  const application = await applicationsService.updateApplication(getUserId(req), id, input);

  res.status(200).json({ application });
}

/**
 * PATCH /api/applications/:id/status
 *
 * A separate endpoint from the general update, not a special case inside it.
 * A status change is a different operation with a different side effect — it
 * appends to the application's history — and giving it its own URL makes that
 * impossible to bypass by accident.
 */
export async function updateApplicationStatus(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateStatusSchema.parse(req.body);

  const result = await applicationsService.updateApplicationStatus(getUserId(req), id, input);

  res.status(200).json(result);
}

/** DELETE /api/applications/:id */
export async function deleteApplication(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);

  await applicationsService.deleteApplication(getUserId(req), id);

  res.status(200).json({ success: true });
}
