import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import ApplicationForm from '../components/ApplicationForm';
import { useCreateApplication } from '../hooks/useApplications';
import { getApiErrorMessage } from '../api/client';
import type { CreateApplicationPayload } from '../types/api';

export default function AddApplication() {
  const navigate = useNavigate();
  const createApplication = useCreateApplication();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: CreateApplicationPayload) {
    setError(null);
    try {
      const application = await createApplication.mutateAsync(payload);

      // Straight to the new application rather than back to the list: the user
      // has just described this job in detail, and the next thing they want is
      // to see it — and from there move its status.
      navigate(`/applications/${application.id}`, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save this application.'));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          to="/applications"
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          ← Applications
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Add an application
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track a job you have applied to, or one you are saving for later.
        </p>
      </div>

      <ApplicationForm
        submitLabel="Save application"
        submitting={createApplication.isPending}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/applications')}
      />
    </div>
  );
}
