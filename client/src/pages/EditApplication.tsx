import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import ApplicationForm from '../components/ApplicationForm';
import { useApplication, useUpdateApplication } from '../hooks/useApplications';
import { getApiErrorMessage } from '../api/client';
import type { CreateApplicationPayload } from '../types/api';

/**
 * Editing reuses `ApplicationForm` in full — same fields, same validation,
 * same layout. The only differences are that it is pre-filled and that the
 * status field is not offered, because a status change has to go through the
 * pipeline so a history row is written with it.
 */
export default function EditApplication() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: application, isPending, isError, error: loadError } = useApplication(id);
  const updateApplication = useUpdateApplication(id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: CreateApplicationPayload) {
    setError(null);
    try {
      // `status` never reaches here — ApplicationForm omits it in edit mode —
      // but it is stripped explicitly as well, so a future change to the form
      // cannot quietly start sending it.
      const { status: _ignored, ...editable } = payload;

      await updateApplication.mutateAsync(editable);
      navigate(`/applications/${id}`, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your changes.'));
    }
  }

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (isError || !application) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-900">
          {getApiErrorMessage(loadError, 'Application not found')}
        </p>
        <Link
          to="/applications"
          className="mt-3 inline-block text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
        >
          Back to applications
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          to={`/applications/${application.id}`}
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          ← {application.companyName}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Edit application
        </h1>
      </div>

      <ApplicationForm
        application={application}
        submitLabel="Save changes"
        submitting={updateApplication.isPending}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/applications/${application.id}`)}
      />
    </div>
  );
}
