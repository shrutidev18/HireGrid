import { useState, type FormEvent } from 'react';

import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  STATUS_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type Application,
  type CreateApplicationPayload,
} from '../types/api';
import { toDateInputValue } from '../utils/format';

/**
 * The form used to both create and edit an application.
 *
 * One component rather than two near-identical ones: the fields, the
 * validation rules and the layout are the same, and the only real differences
 * are the initial values, the submit label, and whether the status field is
 * offered. Duplicating it would guarantee the two drift — a field added to one
 * and forgotten in the other.
 */

/**
 * Form state is all strings, because that is what DOM inputs produce.
 *
 * The conversion to the API's shape — empty string to null, date string to
 * ISO — happens once, on submit, rather than being scattered through onChange
 * handlers. Keeping the form in "input language" also means a half-filled
 * field never has to be represented as an awkward `null | undefined | ''`.
 */
interface FormValues {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  employmentType: string;
  workMode: string;
  jobLink: string;
  jobDescription: string;
  resumeId: string;
  dateApplied: string;
  salary: string;
  notes: string;
  status: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function initialFormValues(application?: Application): FormValues {
  return {
    companyName: application?.companyName ?? '',
    jobTitle: application?.jobTitle ?? '',
    jobLocation: application?.jobLocation ?? '',
    employmentType: application?.employmentType ?? 'INTERNSHIP',
    workMode: application?.workMode ?? '',
    jobLink: application?.jobLink ?? '',
    jobDescription: application?.jobDescription ?? '',
    resumeId: application?.resumeId ?? '',
    dateApplied: toDateInputValue(application?.dateApplied),
    salary: application?.salary ?? '',
    notes: application?.notes ?? '',
    status: application?.status ?? 'SAVED',
  };
}

/**
 * Client-side validation — fast feedback only.
 *
 * Every rule here is enforced again by Zod on the server, which is the check
 * that counts. This one exists so the user is not waiting on a round trip to
 * be told the company name is blank.
 */
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.companyName.trim()) errors.companyName = 'Company name is required';
  if (!values.jobTitle.trim()) errors.jobTitle = 'Job title is required';
  if (!values.jobLocation.trim()) errors.jobLocation = 'Location is required';
  if (!values.jobDescription.trim()) errors.jobDescription = 'Job description is required';

  if (values.jobLink.trim()) {
    try {
      // The URL constructor is the browser's own parser — stricter and more
      // correct than any regular expression worth writing by hand.
      new URL(values.jobLink.trim());
    } catch {
      errors.jobLink = 'Enter a valid URL, including https://';
    }
  }

  return errors;
}

/** Turns form strings into the payload the API expects. */
function toPayload(values: FormValues, includeStatus: boolean): CreateApplicationPayload {
  const text = (value: string) => (value.trim() ? value.trim() : null);

  return {
    companyName: values.companyName.trim(),
    jobTitle: values.jobTitle.trim(),
    jobLocation: values.jobLocation.trim(),
    employmentType: values.employmentType as CreateApplicationPayload['employmentType'],
    workMode: (text(values.workMode) as CreateApplicationPayload['workMode']) ?? null,
    jobLink: text(values.jobLink),
    jobDescription: values.jobDescription.trim(),
    resumeId: text(values.resumeId),
    // Sent as a date-only string; the server coerces it to a DateTime.
    dateApplied: text(values.dateApplied),
    salary: text(values.salary),
    notes: text(values.notes),
    ...(includeStatus
      ? { status: values.status as CreateApplicationPayload['status'] }
      : {}),
  };
}

const inputClass =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function fieldClass(hasError: boolean): string {
  return `${inputClass} ${
    hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-brand-500'
  }`;
}

export default function ApplicationForm({
  application,
  submitLabel,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  /** Present when editing; absent when creating. */
  application?: Application;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: CreateApplicationPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = Boolean(application);
  const [values, setValues] = useState<FormValues>(() => initialFormValues(application));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function set<K extends keyof FormValues>(key: K, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // `status` is only sent when creating. On edit it is omitted entirely,
    // because a status change has to go through the status endpoint so that a
    // history row is written alongside it.
    await onSubmit(toPayload(values, !isEdit));
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-900">The role</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="companyName" className="mb-1.5 block text-sm font-medium text-slate-700">
              Company <span className="text-red-500">*</span>
            </label>
            <input
              id="companyName"
              value={values.companyName}
              onChange={(event) => set('companyName', event.target.value)}
              className={fieldClass(Boolean(fieldErrors.companyName))}
              placeholder="Acme Corp"
            />
            {fieldErrors.companyName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.companyName}</p>
            )}
          </div>

          <div>
            <label htmlFor="jobTitle" className="mb-1.5 block text-sm font-medium text-slate-700">
              Job title <span className="text-red-500">*</span>
            </label>
            <input
              id="jobTitle"
              value={values.jobTitle}
              onChange={(event) => set('jobTitle', event.target.value)}
              className={fieldClass(Boolean(fieldErrors.jobTitle))}
              placeholder="Backend Engineer Intern"
            />
            {fieldErrors.jobTitle && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.jobTitle}</p>
            )}
          </div>

          <div>
            <label htmlFor="jobLocation" className="mb-1.5 block text-sm font-medium text-slate-700">
              Location <span className="text-red-500">*</span>
            </label>
            <input
              id="jobLocation"
              value={values.jobLocation}
              onChange={(event) => set('jobLocation', event.target.value)}
              className={fieldClass(Boolean(fieldErrors.jobLocation))}
              placeholder="Bengaluru"
            />
            {fieldErrors.jobLocation && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.jobLocation}</p>
            )}
          </div>

          <div>
            <label htmlFor="jobLink" className="mb-1.5 block text-sm font-medium text-slate-700">
              Job link
            </label>
            <input
              id="jobLink"
              value={values.jobLink}
              onChange={(event) => set('jobLink', event.target.value)}
              className={fieldClass(Boolean(fieldErrors.jobLink))}
              placeholder="https://careers.acme.com/123"
            />
            {fieldErrors.jobLink && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.jobLink}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="employmentType"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Employment type <span className="text-red-500">*</span>
            </label>
            <select
              id="employmentType"
              value={values.employmentType}
              onChange={(event) => set('employmentType', event.target.value)}
              className={fieldClass(false)}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="workMode" className="mb-1.5 block text-sm font-medium text-slate-700">
              Work mode
            </label>
            <select
              id="workMode"
              value={values.workMode}
              onChange={(event) => set('workMode', event.target.value)}
              className={fieldClass(false)}
            >
              {/* Empty option because not every posting says. The field is
                  nullable in the database for the same reason. */}
              <option value="">Not specified</option>
              {WORK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {WORK_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-900">Job description</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste the full posting. The AI analysis in a later phase compares it against your
          resume, so the more complete it is, the better that works.
        </p>

        <textarea
          id="jobDescription"
          value={values.jobDescription}
          onChange={(event) => set('jobDescription', event.target.value)}
          rows={10}
          className={`${fieldClass(Boolean(fieldErrors.jobDescription))} font-mono text-xs leading-relaxed`}
          placeholder="Responsibilities, required skills, qualifications…"
        />
        {fieldErrors.jobDescription && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.jobDescription}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-900">Tracking</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Status is offered only when creating. On an existing application
              it changes through the pipeline on the details page, which also
              records the change in the timeline. */}
          {!isEdit && (
            <div>
              <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                id="status"
                value={values.status}
                onChange={(event) => set('status', event.target.value)}
                className={fieldClass(false)}
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Defaults to Saved. Change it later from the application page.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="dateApplied" className="mb-1.5 block text-sm font-medium text-slate-700">
              Date applied
            </label>
            <input
              id="dateApplied"
              type="date"
              value={values.dateApplied}
              onChange={(event) => set('dateApplied', event.target.value)}
              className={fieldClass(false)}
            />
          </div>

          <div>
            <label htmlFor="salary" className="mb-1.5 block text-sm font-medium text-slate-700">
              Salary
            </label>
            <input
              id="salary"
              value={values.salary}
              onChange={(event) => set('salary', event.target.value)}
              className={fieldClass(false)}
              placeholder="8-12 LPA"
            />
            <p className="mt-1 text-xs text-slate-500">
              Free text — record whatever the posting says.
            </p>
          </div>

          <div>
            <label htmlFor="resumeId" className="mb-1.5 block text-sm font-medium text-slate-700">
              Resume used
            </label>
            {/* Disabled until resume upload exists. Shown rather than hidden so
                the form's final shape is visible now, and so it is obvious
                that the field is coming rather than missing. */}
            <select id="resumeId" disabled className={`${fieldClass(false)} bg-slate-50`}>
              <option>No resumes uploaded yet</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Resume upload arrives in a later phase.</p>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
            Notes
          </label>
          <textarea
            id="notes"
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            rows={4}
            className={fieldClass(false)}
            placeholder="Referred by Priya. Recruiter mentioned a take-home round."
          />
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
