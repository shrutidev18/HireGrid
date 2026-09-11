import { useState } from 'react';

import ConfirmDialog from './ConfirmDialog';
import { useUpdateApplicationStatus } from '../hooks/useApplications';
import { getApiErrorMessage } from '../api/client';
import {
  PIPELINE_STAGES,
  STATUS_LABELS,
  type ApplicationStatus,
  type PipelineStage,
} from '../types/api';

/**
 * The application's position in the hiring pipeline, and the control for
 * moving it.
 *
 * The design problem this solves: REJECTED is not a stage. It can happen from
 * any point and it ends the process, so placing it in a linear stepper would
 * imply it comes after OFFER. Instead the six real stages form the track, and
 * a rejection is shown as a branch off it — which also matches how the data
 * models it, since StatusHistory records where the rejection happened *from*.
 */
export default function StatusPipeline({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
}) {
  const mutation = useUpdateApplicationStatus(applicationId);

  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isRejected = currentStatus === 'REJECTED';

  // -1 when rejected, so no stage on the track is marked current.
  const currentIndex = isRejected
    ? -1
    : PIPELINE_STAGES.indexOf(currentStatus as PipelineStage);

  function requestChange(status: ApplicationStatus) {
    if (status === currentStatus) return;
    setError(null);
    setNote('');
    setPendingStatus(status);
  }

  async function confirmChange() {
    if (!pendingStatus) return;

    setError(null);
    try {
      await mutation.mutateAsync({
        status: pendingStatus,
        note: note.trim() ? note.trim() : null,
      });
      setPendingStatus(null);
      setNote('');
    } catch (err) {
      // Kept open with the message visible, so a failed change does not look
      // like it silently worked.
      setError(getApiErrorMessage(err, 'Could not update the status.'));
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-slate-900">Status</h2>

        {isRejected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
            Rejected
          </span>
        ) : (
          <button
            type="button"
            onClick={() => requestChange('REJECTED')}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Mark as rejected
          </button>
        )}
      </div>

      {/* The track. Horizontal on wide screens, wrapping on narrow ones. */}
      <ol className="flex flex-wrap items-start gap-y-4">
        {PIPELINE_STAGES.map((stage, index) => {
          const isComplete = currentIndex > index;
          const isCurrent = currentIndex === index;
          const isLast = index === PIPELINE_STAGES.length - 1;

          return (
            <li key={stage} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <button
                  type="button"
                  onClick={() => requestChange(stage)}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={`Move to ${STATUS_LABELS[stage]}`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                    isCurrent
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : isComplete
                        ? 'border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'border-slate-300 bg-white text-slate-400 hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  {isComplete ? '✓' : index + 1}
                </button>

                <span
                  className={`mt-2 px-1 text-center text-[11px] leading-tight ${
                    isCurrent ? 'font-semibold text-brand-700' : 'text-slate-500'
                  }`}
                >
                  {STATUS_LABELS[stage]}
                </span>
              </div>

              {/* Connector between stages. aria-hidden because it is purely
                  decorative — the list order already conveys the sequence. */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className={`mt-4 h-0.5 w-full min-w-4 flex-1 ${
                    isComplete ? 'bg-brand-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {isRejected && (
        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          This application was rejected. Selecting a stage above moves it back into the
          pipeline and records that change in the timeline.
        </p>
      )}

      <ConfirmDialog
        open={pendingStatus !== null}
        title={
          pendingStatus === 'REJECTED'
            ? 'Mark this application as rejected?'
            : `Move to ${pendingStatus ? STATUS_LABELS[pendingStatus] : ''}?`
        }
        message="This is recorded in the timeline with a timestamp. Status history is never overwritten, so you can move stages freely."
        confirmLabel={pendingStatus === 'REJECTED' ? 'Mark as rejected' : 'Update status'}
        destructive={pendingStatus === 'REJECTED'}
        busy={mutation.isPending}
        error={error}
        onConfirm={() => void confirmChange()}
        onCancel={() => {
          setPendingStatus(null);
          setError(null);
        }}
      >
        <label htmlFor="status-note" className="mb-1.5 block text-sm font-medium text-slate-700">
          Add a note <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="status-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Recruiter said results in 2 weeks"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </ConfirmDialog>
    </section>
  );
}
