import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import AnalysisPanel from '../components/AnalysisPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusPipeline from '../components/StatusPipeline';
import Timeline from '../components/Timeline';
import {
  useApplication,
  useDeleteApplication,
  useUpdateApplication,
} from '../hooks/useApplications';
import { getApiErrorMessage } from '../api/client';
import {
  EMPLOYMENT_TYPE_LABELS,
  STATUS_LABELS,
  WORK_MODE_LABELS,
  type Application,
} from '../types/api';
import { formatDate } from '../utils/format';

/** One labelled fact in the header grid. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Notes, editable in place.
 *
 * Saves on blur rather than behind a Save button: notes are scratch text the
 * user adds while on the phone to a recruiter, and making them open an edit
 * form for it is friction out of proportion to the change.
 *
 * The guard that makes blur-to-save safe is the comparison against the last
 * saved value — without it, every click away would fire a PUT whether or not
 * anything changed.
 */
function NotesEditor({ application }: { application: Application }) {
  const updateApplication = useUpdateApplication(application.id);

  const [value, setValue] = useState(application.notes ?? '');
  const [saved, setSaved] = useState(application.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Keeps the textarea in step if the application is refetched or edited
  // elsewhere — but only when the user is not mid-edit, so a background
  // refetch cannot overwrite what they are typing.
  useEffect(() => {
    const incoming = application.notes ?? '';
    setSaved(incoming);
    setValue((current) => (current === saved ? incoming : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.notes]);

  async function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === saved.trim()) return; // nothing changed — no request

    setError(null);
    try {
      await updateApplication.mutateAsync({ notes: trimmed ? trimmed : null });
      setSaved(trimmed);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your notes.'));
      setValue(saved); // put the last known-good text back
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-900">Notes</h2>
        <span className="text-xs text-slate-400">
          {updateApplication.isPending ? 'Saving…' : justSaved ? 'Saved' : 'Saves when you click away'}
        </span>
      </div>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void handleBlur()}
        rows={5}
        placeholder="Anything worth remembering — a referral, a recruiter's name, what the interviewer asked."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

export default function ApplicationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: application, isPending, isError, error } = useApplication(id);
  const deleteApplication = useDeleteApplication();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!application) return;

    setDeleteError(null);
    try {
      await deleteApplication.mutateAsync(application.id);
      navigate('/applications', { replace: true });
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, 'Could not delete this application.'));
    }
  }

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (isError || !application) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-900">
          {getApiErrorMessage(error, 'Application not found')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          It may have been deleted, or it belongs to a different account.
        </p>
        <Link
          to="/applications"
          className="mt-4 inline-block text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
        >
          Back to applications
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/applications"
        className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
      >
        ← Applications
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {application.jobTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {application.companyName} · {application.jobLocation}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/applications/${application.id}/edit`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <dl className="grid gap-5 sm:grid-cols-3">
            <Fact label="Current status">
              <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                {STATUS_LABELS[application.status]}
              </span>
            </Fact>
            <Fact label="Employment type">
              {EMPLOYMENT_TYPE_LABELS[application.employmentType]}
            </Fact>
            <Fact label="Work mode">
              {application.workMode ? WORK_MODE_LABELS[application.workMode] : '—'}
            </Fact>
            <Fact label="Date applied">{formatDate(application.dateApplied)}</Fact>
            <Fact label="Salary">{application.salary ?? '—'}</Fact>
            <Fact label="Resume">{application.resume?.fileName ?? '—'}</Fact>
          </dl>

          {application.jobLink && (
            <a
              href={application.jobLink}
              target="_blank"
              // noreferrer prevents the opened page from reaching back through
              // window.opener; noopener is implied by it but stated for clarity.
              rel="noopener noreferrer"
              className="mt-5 inline-block text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              View the original posting ↗
            </a>
          )}
        </section>

        <StatusPipeline applicationId={application.id} currentStatus={application.status} />

        {/* Placed directly under the pipeline: after "where is this
            application", the next question is "how good a fit is it". */}
        <AnalysisPanel
          applicationId={application.id}
          hasResume={Boolean(application.resumeId)}
        />

        <NotesEditor application={application} />

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-slate-900">Job description</h2>
          {/* whitespace-pre-wrap preserves the line breaks of a pasted posting
              without trusting it as HTML — React escapes the text either way. */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {application.jobDescription}
          </p>
        </section>

        <Timeline entries={application.statusHistory} />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this application?"
        message="Its entire status history is deleted with it, and this cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleteApplication.isPending}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
