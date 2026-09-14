import { useState } from 'react';

import ResumeUpload from '../components/ResumeUpload';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDeleteResume, useResumesList } from '../hooks/useResumes';
import { downloadResume } from '../api/resumes';
import { getApiErrorMessage } from '../api/client';
import { formatDate, formatRelative } from '../utils/format';
import type { Resume } from '../types/api';

export default function MyResumes() {
  const { data: resumes, isPending, isError, error } = useResumesList();
  const deleteResume = useDeleteResume();

  const [confirming, setConfirming] = useState<Resume | null>(null);

  /**
   * Two separate error slots, because the two failures need to live in
   * different places on screen.
   *
   * `blockedError` is the "this resume is used in N applications" rejection —
   * an expected outcome that should stay visible next to the row after the
   * dialog closes. `dialogError` is an unexpected failure while the dialog is
   * still open.
   */
  const [blockedError, setBlockedError] = useState<{ id: string; message: string } | null>(
    null,
  );
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirming) return;

    setDialogError(null);
    try {
      await deleteResume.mutateAsync(confirming.id);
      setConfirming(null);
      setBlockedError(null);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not delete this resume.');
      const status = (err as { response?: { status?: number } })?.response?.status;

      if (status === 400) {
        // The server refused because applications still reference it. Close
        // the dialog and pin the reason to the row, where it makes sense.
        setBlockedError({ id: confirming.id, message });
        setConfirming(null);
      } else {
        setDialogError(message);
      }
    }
  }

  async function handleDownload(resume: Resume) {
    setDownloadError(null);
    try {
      await downloadResume(resume.id, resume.fileName);
    } catch (err) {
      setDownloadError(getApiErrorMessage(err, 'Could not download this file.'));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My resumes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload once and reuse across applications. The text is read at upload time so the
          AI analysis never has to re-open the file.
        </p>
      </div>

      <div className="mb-8">
        <ResumeUpload />
      </div>

      <h2 className="mb-3 text-sm font-medium text-slate-900">
        Uploaded {resumes ? `(${resumes.length})` : ''}
      </h2>

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {getApiErrorMessage(error, 'Could not load your resumes.')}
        </div>
      )}

      {downloadError && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {downloadError}
        </div>
      )}

      {resumes && resumes.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No resumes yet. Upload one above to attach it to an application.
        </p>
      )}

      {resumes && resumes.length > 0 && (
        <ul className="space-y-3">
          {resumes.map((resume) => (
            <li
              key={resume.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {resume.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Uploaded {formatDate(resume.createdAt)} · {formatRelative(resume.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownload(resume)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBlockedError(null);
                      setDialogError(null);
                      setConfirming(resume);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {blockedError?.id === resume.id && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  {blockedError.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this resume?"
        message={
          confirming
            ? `${confirming.fileName} will be removed permanently, along with its stored file. Resumes still attached to an application cannot be deleted.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={deleteResume.isPending}
        error={dialogError}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
