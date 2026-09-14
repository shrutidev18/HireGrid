import type { Request, Response } from 'express';

import { getUserId } from '../middleware/authMiddleware';
import { badRequest } from '../utils/AppError';
import { resumeIdParamSchema } from '../utils/validators';
import * as resumeService from '../services/resumeService';

/** POST /api/resumes */
export async function uploadResume(req: Request, res: Response): Promise<void> {
  // Multer puts the parsed upload here. It is absent when the request carried
  // no file at all — a different failure from "wrong type" or "too large",
  // which the upload middleware has already rejected by this point.
  const file = req.file;

  if (!file) {
    throw badRequest('Select a file to upload');
  }

  const resume = await resumeService.createResume(getUserId(req), {
    originalname: file.originalname,
    buffer: file.buffer,
  });

  // Note what comes back: id, fileName, createdAt. Not the extracted text —
  // it is large, the client has no use for it, and it is only ever read
  // server-side by the AI analysis.
  res.status(201).json({ resume });
}

/** GET /api/resumes */
export async function listResumes(req: Request, res: Response): Promise<void> {
  const resumes = await resumeService.listResumes(getUserId(req));

  res.status(200).json({ resumes });
}

/** GET /api/resumes/:id */
export async function getResume(req: Request, res: Response): Promise<void> {
  const { id } = resumeIdParamSchema.parse(req.params);

  const resume = await resumeService.getResume(getUserId(req), id);

  res.status(200).json({ resume });
}

/**
 * GET /api/resumes/:id/download
 *
 * The one endpoint in the API that does not return JSON. It still goes through
 * `requireAuth` and the same ownership check as everything else — a file is
 * not public just because it is a file.
 */
export async function downloadResume(req: Request, res: Response): Promise<void> {
  const { id } = resumeIdParamSchema.parse(req.params);

  const { fileName, contentType, buffer } = await resumeService.getResumeFile(
    getUserId(req),
    id,
  );

  /**
   * Content-Disposition is written twice, and the reason is worth knowing.
   *
   * The plain `filename=` parameter is ASCII-only, so a resume called
   * "Résumé.pdf" cannot be expressed in it. `filename*=UTF-8''...` (RFC 5987)
   * can, and modern browsers prefer it — the ASCII version is the fallback for
   * anything that does not understand it.
   *
   * Quotes, backslashes and control characters are stripped from the ASCII
   * form because the filename originates from the user: left in, they could
   * terminate the quoted string early and inject further header parameters.
   */
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.setHeader('Content-Length', buffer.byteLength);

  // Stops a browser from second-guessing the declared type and, say, rendering
  // an uploaded file as HTML — which would turn file storage into a
  // cross-site-scripting vector.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.status(200).send(buffer);
}

/** DELETE /api/resumes/:id */
export async function deleteResume(req: Request, res: Response): Promise<void> {
  const { id } = resumeIdParamSchema.parse(req.params);

  await resumeService.deleteResume(getUserId(req), id);

  res.status(200).json({ success: true });
}
