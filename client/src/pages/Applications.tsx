import { Link } from 'react-router-dom';

import { useApplicationsList } from '../hooks/useApplications';
import { getApiErrorMessage } from '../api/client';
import {
  EMPLOYMENT_TYPE_LABELS,
  STATUS_LABELS,
  WORK_MODE_LABELS,
  type ApplicationStatus,
} from '../types/api';
import { formatDate, formatRelative } from '../utils/format';

/**
 * Colour per stage, so the list can be scanned without reading every label.
 * Rejected is the only one that is visually distinct rather than a shade of
 * progress.
 */
const statusStyles: Record<ApplicationStatus, string> = {
  SAVED: 'bg-slate-100 text-slate-600 ring-slate-200',
  APPLIED: 'bg-blue-50 text-blue-700 ring-blue-200',
  ONLINE_ASSESSMENT: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  TECH_INTERVIEW: 'bg-violet-50 text-violet-700 ring-violet-200',
  HR_INTERVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
  OFFER: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * Every application the user is tracking.
 *
 * A simple list for now. The sortable, searchable, filterable table that the
 * requirements describe is a later phase — this exists so applications can be
 * found and opened, which the create and delete flows both depend on.
 */
export default function Applications() {
  const { data: applications, isPending, isError, error } = useApplicationsList();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Applications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {applications ? `${applications.length} tracked` : 'Everything you are tracking'}
          </p>
        </div>

        <Link
          to="/applications/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Add application
        </Link>
      </div>

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {getApiErrorMessage(error, 'Could not load your applications.')}
        </div>
      )}

      {applications && applications.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No applications yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Add the first job you are tracking. You can save one you have not applied to yet.
          </p>
          <Link
            to="/applications/new"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Add application
          </Link>
        </div>
      )}

      {applications && applications.length > 0 && (
        <ul className="space-y-3">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                to={`/applications/${application.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-900">
                      {application.jobTitle}
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-slate-600">
                      {application.companyName} · {application.jobLocation}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusStyles[application.status]}`}
                  >
                    {STATUS_LABELS[application.status]}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{EMPLOYMENT_TYPE_LABELS[application.employmentType]}</span>
                  {application.workMode && <span>{WORK_MODE_LABELS[application.workMode]}</span>}
                  {application.dateApplied && (
                    <span>Applied {formatDate(application.dateApplied)}</span>
                  )}
                  {application.salary && <span>{application.salary}</span>}
                  <span className="ml-auto">Updated {formatRelative(application.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
