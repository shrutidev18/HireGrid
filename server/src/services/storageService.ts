import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * The only file-storage code in the project.
 *
 * Everything else — controllers, the resume service, the download endpoint —
 * knows nothing about where files live. They hold an opaque **storage key** and
 * call the four functions below. Files are on local disk today; moving to S3
 * means rewriting this file and nothing else, because no path, no `fs` call and
 * no `uploads/` string appears anywhere outside it.
 *
 * The key is what makes that swap possible. It is not a path and not a URL —
 * it is an identifier this module knows how to resolve. On disk it happens to
 * be a filename; on S3 it would be an object key. Callers must not try to
 * interpret it.
 */

/** Where uploads live, resolved from this file rather than the process cwd. */
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export interface StoredFile {
  /** Opaque handle to give back to `readFile` / `deleteFile` later. */
  key: string;
  size: number;
}

/**
 * Turns a key into an absolute path, refusing anything that could escape the
 * upload directory.
 *
 * Keys are generated here and are always a UUID plus an extension, so this can
 * never fire in practice — which is exactly why it is worth keeping. It is one
 * line standing between a future change ("let's use the original filename as
 * the key") and a path-traversal bug, where a key of `../../.env` would read a
 * file it has no business reading.
 */
function resolveKey(key: string): string {
  if (key.includes('/') || key.includes('\\') || key.includes('..')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }

  const resolved = path.resolve(UPLOAD_DIR, key);

  // Belt and braces: confirm the resolved path really is inside the directory.
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error(`Storage key resolved outside the upload directory: ${key}`);
  }

  return resolved;
}

/**
 * Writes a file and returns its key.
 *
 * The stored name is a freshly generated UUID plus the original extension —
 * the user's filename is **never** used on disk. Two reasons:
 *
 *   1. Security. A filename like `../../server/.env` or one containing a null
 *      byte is a path-traversal attempt, and sanitising filenames correctly
 *      across platforms is a problem best avoided rather than solved.
 *   2. Correctness. Two users both uploading `resume.pdf` would otherwise
 *      overwrite each other.
 *
 * The original name is kept in the database as `fileName`, which is what the
 * user sees and what the download endpoint sends back.
 */
export async function uploadFile(buffer: Buffer, originalName: string): Promise<StoredFile> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const extension = path.extname(originalName).toLowerCase();
  const key = `${randomUUID()}${extension}`;

  await fs.writeFile(resolveKey(key), buffer);

  return { key, size: buffer.byteLength };
}

/** Reads a stored file back. Throws if the key does not exist. */
export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

/**
 * Removes a stored file.
 *
 * A missing file is treated as success. Deletion runs after the database row
 * is already gone, so a file that has somehow vanished is not a reason to fail
 * the request — the user's intent (the resume should no longer exist) has been
 * satisfied either way.
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    await fs.unlink(resolveKey(key));
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ENOENT') return;
    throw err;
  }
}
