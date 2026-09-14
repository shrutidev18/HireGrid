import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';

import { badRequest } from '../utils/AppError';

/** 5 MB. Comfortably more than any real resume, and a hard ceiling on abuse. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * MIME types a browser might attach to a PDF or DOCX.
 *
 * This list is generous on purpose — `application/octet-stream` appears here
 * because some browsers and operating systems send it for .docx files, and
 * rejecting on that alone would block legitimate uploads. The header is
 * treated as a weak hint, never as proof: the real check is the magic-byte
 * inspection in the resume service, which reads what the file *is* rather than
 * what the request claims.
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];

/**
 * Multer, configured to hold the upload in memory rather than write it to a
 * temp file.
 *
 * In-memory is right here because the buffer is needed three times in quick
 * succession — magic-byte check, text extraction, and the write to storage —
 * and the 5 MB cap bounds what one request can hold. For large-file uploads
 * (video, archives) this would be the wrong choice and disk streaming would
 * win.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    // Without this, a request could carry thousands of non-file fields and
    // make the server do work before any of the checks below run.
    fields: 5,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      callback(badRequest('Only .pdf and .docx files are accepted'));
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(badRequest('Only .pdf and .docx files are accepted'));
      return;
    }

    callback(null, true);
  },
});

/**
 * Runs the upload and converts Multer's own failures into the project's
 * standard error shape.
 *
 * Multer reports problems by calling back with a `MulterError` rather than by
 * throwing, so Express 5's automatic async error forwarding never sees them.
 * Left alone they surface as an unhandled 500 with an unhelpful message —
 * "File too large" would be reported to the user as "Internal server error".
 * Translating them here keeps the `{ error, statusCode }` contract intact for
 * uploads as much as for every other route.
 *
 * Registered before the controller, so an oversized or wrong-typed file is
 * rejected before any business logic — or any database query — runs.
 */
export function uploadResumeFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(badRequest('File must be 5MB or smaller'));
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(badRequest('Upload one file at a time, in a field named "file"'));
        return;
      }
      next(badRequest(`Upload failed: ${err.message}`));
      return;
    }

    // Errors raised by the fileFilter above are already AppErrors and pass
    // through unchanged.
    if (err) {
      next(err);
      return;
    }

    next();
  });
}
