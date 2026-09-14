import { useRef, useState, type DragEvent } from 'react';

import { useUploadResume } from '../hooks/useResumes';
import { getApiErrorMessage } from '../api/client';
import {
  ACCEPTED_RESUME_EXTENSIONS,
  MAX_RESUME_BYTES,
  type Resume,
} from '../types/api';

/**
 * Drag-and-drop (or click-to-browse) resume upload with a progress bar.
 *
 * The same component serves the My Resumes page and the inline "upload a new
 * one" option on the application form — `onUploaded` is how the caller reacts,
 * which for the form means selecting the new resume straight away.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pre-flight checks, mirroring the server's Multer rules.
 *
 * These are a courtesy, not a control: the server enforces the same limits and
 * additionally inspects the file's magic bytes, because anything checked in
 * the browser can be bypassed. What they buy is not uploading 5 MB before
 * being told the format is wrong.
 */
function validateFile(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (!ACCEPTED_RESUME_EXTENSIONS.includes(extension as '.pdf' | '.docx')) {
    return 'Only PDF and Word (.docx) files are accepted';
  }

  if (file.size > MAX_RESUME_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is 5 MB.`;
  }

  if (file.size === 0) {
    return 'That file is empty';
  }

  return null;
}

export default function ResumeUpload({
  onUploaded,
  compact = false,
}: {
  onUploaded?: (resume: Resume) => void;
  compact?: boolean;
}) {
  const uploadResume = useUploadResume();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploadedName(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setProgress(0);
    try {
      const resume = await uploadResume.mutateAsync({ file, onProgress: setProgress });
      setUploadedName(resume.fileName);
      onUploaded?.(resume);
    } catch (err) {
      // Server-side rejections land here — wrong magic bytes, an unreadable
      // PDF, a scanned image with no text layer. Each has its own message
      // explaining what to do about it, so it is shown verbatim.
      setError(getApiErrorMessage(err, 'Could not upload this file.'));
    } finally {
      setProgress(0);
      // Clearing the input matters: without it, selecting the *same* file
      // again fires no change event, so a retry after a failure would appear
      // to do nothing.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  const busy = uploadResume.isPending;

  return (
    <div>
      <div
        onDragOver={(event) => {
          // Both handlers must preventDefault, or the browser navigates away
          // to open the dropped file instead of letting the app handle it.
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? 'border-brand-500 bg-brand-50'
            : busy
              ? 'border-slate-200 bg-slate-50'
              : 'border-slate-300 bg-white hover:border-brand-400'
        } ${compact ? 'py-5' : 'py-10'}`}
      >
        <input
          ref={inputRef}
          id="resume-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {busy ? (
          <div>
            <p className="text-sm font-medium text-slate-700">Uploading…</p>
            <div
              className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {/* Upload progress reaches 100% while the server is still
                  parsing the file, so the label says so rather than appearing
                  to stall at the end. */}
              {progress < 100 ? `${progress}%` : 'Reading the file…'}
            </p>
          </div>
        ) : (
          <div>
            <p className={`font-medium text-slate-700 ${compact ? 'text-sm' : 'text-base'}`}>
              Drop your resume here
            </p>
            <p className="mt-1 text-sm text-slate-500">
              or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-brand-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                browse your files
              </button>
            </p>
            <p className="mt-2 text-xs text-slate-400">PDF or Word (.docx), up to 5 MB</p>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {uploadedName && !error && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Uploaded <span className="font-medium">{uploadedName}</span>
        </div>
      )}
    </div>
  );
}
