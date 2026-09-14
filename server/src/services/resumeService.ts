import path from 'node:path';

import { prisma, type TransactionClient } from '../config/db';
import { badRequest, notFound } from '../utils/AppError';
import * as storage from './storageService';
import { extractText, sniffFileKind } from './textExtractionService';

/**
 * What the API returns for a resume.
 *
 * `extractedText` is deliberately absent. It is often tens of kilobytes and no
 * screen displays it — it exists for the AI analysis to read server-side.
 * Sending it would bloat every list response for nothing, so it is excluded by
 * the `select` on every query rather than deleted afterwards.
 */
export interface ResumeSummary {
  id: string;
  fileName: string;
  createdAt: Date;
}

const summarySelect = { id: true, fileName: true, createdAt: true } as const;

/** Content types for the download endpoint, keyed by extension. */
const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Stores an uploaded resume and extracts its text.
 *
 * Order of operations is deliberate, cheapest-and-most-likely-to-fail first:
 *
 *   1. Identify the file by its bytes. Rejects here cost nothing.
 *   2. Extract the text. Still nothing written anywhere.
 *   3. Write the file to storage.
 *   4. Create the database row.
 *
 * Doing it the other way round — write first, parse later — would leave a file
 * on disk every time an unreadable upload was rejected.
 */
export async function createResume(
  userId: string,
  file: { originalname: string; buffer: Buffer },
): Promise<ResumeSummary> {
  // The upload middleware already checked the extension and the declared MIME
  // type. Both come from the client, so this is the check that actually
  // decides: what do the file's own first bytes say it is?
  const kind = sniffFileKind(file.buffer);

  if (!kind) {
    throw badRequest('That file is not a readable PDF or Word document');
  }

  let extractedText: string;
  try {
    extractedText = await extractText(file.buffer, kind);
  } catch {
    // A corrupt PDF, a password-protected one, or a .docx that is really some
    // other zip. The underlying parser error is logged by the error handler
    // but not shown — it would mean nothing to the user.
    throw badRequest('Could not read this file. It may be corrupted or password-protected.');
  }

  if (!extractedText) {
    // The file parsed but has no text layer — almost always a scanned resume,
    // i.e. a photograph of a page. Rejecting it now, with a reason, is kinder
    // than accepting it and having the AI analysis silently find nothing to
    // compare. (Making this work would need OCR, which is a different feature.)
    throw badRequest(
      'No text could be read from this file. If it is a scanned image, upload a text-based PDF or Word file instead.',
    );
  }

  const stored = await storage.uploadFile(file.buffer, file.originalname);

  try {
    return await prisma.resume.create({
      data: {
        userId,
        fileName: file.originalname,
        // An opaque storage key, not a path or a URL — see storageService.
        fileUrl: stored.key,
        extractedText,
      },
      select: summarySelect,
    });
  } catch (err) {
    // The file is written but the row is not, so nothing references it and
    // nothing ever will. Clean it up rather than leaking a file per failure.
    await storage.deleteFile(stored.key).catch(() => undefined);
    throw err;
  }
}

/** Every resume the user has uploaded, newest first. */
export async function listResumes(userId: string): Promise<ResumeSummary[]> {
  return prisma.resume.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: summarySelect,
  });
}

/**
 * One resume, with the applications using it.
 *
 * The applications are what make the deletion rule understandable: rather than
 * only telling the user "this is used in 3 applications", the UI can show
 * which three.
 */
export async function getResume(userId: string, id: string) {
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: {
      ...summarySelect,
      applications: {
        select: { id: true, companyName: true, jobTitle: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!resume) {
    // 404 rather than 403 for someone else's resume, for the same reason as
    // applications: the API must not confirm that a record exists.
    throw notFound('Resume not found');
  }

  return resume;
}

/** The file itself, for the download endpoint. */
export async function getResumeFile(
  userId: string,
  id: string,
): Promise<{ fileName: string; contentType: string; buffer: Buffer }> {
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: { fileName: true, fileUrl: true },
  });

  if (!resume) {
    throw notFound('Resume not found');
  }

  const extension = path.extname(resume.fileName).toLowerCase();

  let buffer: Buffer;
  try {
    buffer = await storage.readFile(resume.fileUrl);
  } catch {
    // The row exists but the file does not — someone cleared the uploads
    // directory, or a restore went wrong. A 404 is honest: the thing being
    // asked for is genuinely not there.
    throw notFound('The stored file for this resume could not be found');
  }

  return {
    fileName: resume.fileName,
    contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
    buffer,
  };
}

/**
 * Deletes a resume, unless an application still uses it.
 *
 * The database would happily allow this — `Application.resumeId` is
 * `onDelete: SetNull`, so deleting a resume would quietly detach it from every
 * application referencing it. That is the right *fallback*, but it is the
 * wrong default: a user who deletes an old resume should be told it is in use,
 * not silently have twelve applications lose the record of which resume they
 * were sent with.
 *
 * The check and the delete run in one transaction so an application created
 * between them cannot slip through and be silently detached.
 */
export async function deleteResume(userId: string, id: string): Promise<void> {
  const storageKey = await prisma.$transaction(async (tx: TransactionClient) => {
    const resume = await tx.resume.findFirst({
      where: { id, userId },
      select: { id: true, fileUrl: true },
    });

    if (!resume) {
      throw notFound('Resume not found');
    }

    // Not scoped by userId on purpose. The question is "does *anything* still
    // point at this row?", and scoping the count would risk under-counting and
    // allowing a delete that breaks a reference.
    const referenceCount = await tx.application.count({ where: { resumeId: id } });

    if (referenceCount > 0) {
      throw badRequest(
        `This resume is used in ${referenceCount} application(s) and cannot be deleted`,
      );
    }

    await tx.resume.delete({ where: { id } });

    return resume.fileUrl;
  });

  // Outside the transaction: a filesystem write cannot be rolled back, so it
  // must not run until the database change has definitely committed. The worst
  // case here is an orphaned file that nothing references — untidy, but
  // harmless. The reverse order risks a row pointing at a file that is gone,
  // which breaks downloads.
  await storage.deleteFile(storageKey);
}
