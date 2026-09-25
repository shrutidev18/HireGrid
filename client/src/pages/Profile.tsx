import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { useChangePassword, useProfile, useUpdateProfile } from '../hooks/useProfile';
import { getApiErrorMessage } from '../api/client';
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  type ExperienceLevel,
  type Profile as ProfileData,
} from '../types/api';

/**
 * The profile page.
 *
 * Two forms, deliberately separate. The personal-details form writes to two
 * database tables in one transaction; the password form re-verifies the
 * current password before it does anything. Merging them would mean either
 * asking for a password to rename a target role, or letting a password change
 * through on a form that never proved who was typing it.
 */

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const labelClass = 'block text-sm font-medium text-slate-700';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A dismissable result banner shared by both forms. */
function Banner({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  const styles =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-red-200 bg-red-50 text-red-700';

  return (
    <div
      // `alert` for a failure so a screen reader announces it immediately;
      // `status` for a success, which is polite and does not interrupt.
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}

/**
 * A tag input for skills.
 *
 * Enter or comma commits the current text; Backspace on an empty box removes
 * the last tag. Both are what people already expect from a tag field, and the
 * Backspace behaviour in particular is the difference between "this feels like
 * a tag input" and "this is a text box with buttons".
 */
function SkillsInput({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const value = raw.trim();
    if (!value) return;

    // De-duplicated case-insensitively here as well as on the server. The
    // server is the one that matters for correctness; doing it here too means
    // the user sees the tag refuse to duplicate immediately rather than
    // discovering it silently vanished after a save.
    if (skills.some((skill) => skill.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }

    onChange([...skills, value]);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter inside a form submits it. A tag input that saves the whole page
      // every time you finish typing a skill would be maddening.
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key === 'Backspace' && draft === '' && skills.length > 0) {
      onChange(skills.slice(0, -1));
    }
  };

  return (
    <div className="rounded-lg border border-slate-300 p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      {skills.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={skill}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200"
            >
              {skill}
              <button
                type="button"
                onClick={() => onChange(skills.filter((s) => s !== skill))}
                aria-label={`Remove ${skill}`}
                className="rounded-full px-1 text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id="skills"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        // Committed on blur too: a user who types a skill and clicks Save
        // without pressing Enter means to keep it, and silently dropping it is
        // the kind of small betrayal that makes a form feel untrustworthy.
        onBlur={() => commit(draft)}
        placeholder={skills.length ? 'Add another…' : 'React, TypeScript, PostgreSQL…'}
        className="w-full border-0 px-1 py-1 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_FORM: ProfileData = {
  name: '',
  email: '',
  targetRole: null,
  skills: [],
  education: null,
  experienceLevel: null,
  graduationYear: null,
  phone: null,
  linkedinUrl: null,
  portfolioUrl: null,
};

export default function Profile() {
  const { data: profile, isPending, isError, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [form, setForm] = useState<ProfileData>(EMPTY_FORM);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  /**
   * Seed the form once the profile arrives.
   *
   * The form is local state, not the query cache, because a form the user is
   * halfway through typing must not be overwritten by a background refetch.
   * The dependency on `profile` means this runs when the data first loads and
   * again after a save, which re-syncs the fields with whatever the server
   * normalised them to — a lower-cased email, a trimmed name.
   */
  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const setField = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage(null);
  };

  /** Text inputs: "" means "cleared", which the API expects as null. */
  const setText = (key: keyof ProfileData) => (value: string) =>
    setField(key, (value.trim() === '' ? null : value) as ProfileData[typeof key]);

  const handleProfileSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSavedMessage(null);

    updateProfile.mutate(form, {
      onSuccess: () => setSavedMessage('Profile saved'),
    });
  };

  // -- password form --------------------------------------------------------

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handlePasswordSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    /**
     * The confirmation is checked here and only here.
     *
     * It is not sent to the server, because it is not a fact about the account
     * — it is a guard against the user mistyping a password they cannot see.
     * The server has no use for it and no way to check it that the browser
     * cannot do instantly.
     */
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setPasswordSaved(true);
          // Cleared on success so the fields are not left holding the real
          // password in the DOM after the change.
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
        onError: (err) =>
          setPasswordError(getApiErrorMessage(err, 'Could not change your password.')),
      },
    );
  };

  // -------------------------------------------------------------------------

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading your profile…</p>;
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {getApiErrorMessage(error, 'Could not load your profile.')}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your details, and the account you sign in with.
        </p>
      </div>

      {/* -- Personal info ------------------------------------------------- */}

      <form
        onSubmit={handleProfileSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-slate-900">Personal info</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Used across the app, and as context for your resume analyses.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Email" htmlFor="email" hint="This is what you sign in with.">
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Target role" htmlFor="targetRole">
            <input
              id="targetRole"
              type="text"
              value={form.targetRole ?? ''}
              onChange={(event) => setText('targetRole')(event.target.value)}
              placeholder="Backend Engineer"
              className={inputClass}
            />
          </Field>

          <Field label="Experience level" htmlFor="experienceLevel">
            <select
              id="experienceLevel"
              value={form.experienceLevel ?? ''}
              onChange={(event) =>
                setField('experienceLevel', (event.target.value || null) as ExperienceLevel | null)
              }
              className={inputClass}
            >
              <option value="">Not set</option>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EXPERIENCE_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Skills" htmlFor="skills" hint="Press Enter or comma after each one.">
              <SkillsInput
                skills={form.skills}
                onChange={(skills) => setField('skills', skills)}
              />
            </Field>
          </div>

          <Field label="Education" htmlFor="education">
            <input
              id="education"
              type="text"
              value={form.education ?? ''}
              onChange={(event) => setText('education')(event.target.value)}
              placeholder="B.Tech, Computer Science"
              className={inputClass}
            />
          </Field>

          <Field label="Graduation year" htmlFor="graduationYear">
            <input
              id="graduationYear"
              type="number"
              inputMode="numeric"
              value={form.graduationYear ?? ''}
              onChange={(event) =>
                setField(
                  'graduationYear',
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
              placeholder="2026"
              className={inputClass}
            />
          </Field>

          <Field label="Phone" htmlFor="phone">
            <input
              id="phone"
              type="tel"
              value={form.phone ?? ''}
              onChange={(event) => setText('phone')(event.target.value)}
              placeholder="+91 98765 43210"
              className={inputClass}
            />
          </Field>

          <Field label="LinkedIn" htmlFor="linkedinUrl">
            <input
              id="linkedinUrl"
              type="url"
              value={form.linkedinUrl ?? ''}
              onChange={(event) => setText('linkedinUrl')(event.target.value)}
              placeholder="https://linkedin.com/in/…"
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Portfolio" htmlFor="portfolioUrl">
              <input
                id="portfolioUrl"
                type="url"
                value={form.portfolioUrl ?? ''}
                onChange={(event) => setText('portfolioUrl')(event.target.value)}
                placeholder="https://your-site.dev"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </button>

          {savedMessage && !updateProfile.isError && (
            <span role="status" className="text-sm text-emerald-700">
              {savedMessage}
            </span>
          )}
        </div>

        {updateProfile.isError && (
          <div className="mt-4">
            <Banner tone="error">
              {getApiErrorMessage(updateProfile.error, 'Could not save your profile.')}
            </Banner>
          </div>
        )}
      </form>

      {/* -- Account security ----------------------------------------------- */}

      <form
        onSubmit={handlePasswordSubmit}
        /* Visually separated on purpose: a heavier top border and a clear gap,
           so changing a password never feels like part of editing a phone
           number. */
        className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-slate-900">Account security</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Changing your password requires your current one.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Current password" htmlFor="currentPassword">
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordError(null);
                  setPasswordSaved(false);
                }}
                className={`${inputClass} sm:max-w-sm`}
              />
            </Field>
          </div>

          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setPasswordError(null);
                setPasswordSaved(false);
              }}
              className={inputClass}
            />
          </Field>

          <Field label="Confirm new password" htmlFor="confirmPassword">
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setPasswordError(null);
                setPasswordSaved(false);
              }}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              changePassword.isPending || !currentPassword || !newPassword || !confirmPassword
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {changePassword.isPending ? 'Updating…' : 'Change password'}
          </button>
        </div>

        {(passwordError || passwordSaved) && (
          <div className="mt-4">
            {passwordError ? (
              <Banner tone="error">{passwordError}</Banner>
            ) : (
              <Banner tone="success">
                Password updated. You will stay signed in here — sign in with the new password
                next time.
              </Banner>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
