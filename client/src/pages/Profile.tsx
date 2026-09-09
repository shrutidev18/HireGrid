import PhasePlaceholder from '../components/PhasePlaceholder';
import { useAuth } from '../hooks/useAuth';

export default function Profile() {
  const { user } = useAuth();

  return (
    <div>
      <PhasePlaceholder
        title="Profile"
        description="Your personal details, target role, skills and experience level."
        phase="a later phase"
      />

      {/* Proof that the session is real: this data came from GET /api/auth/me,
          authenticated by the httpOnly cookie, not from anything stored in the
          browser by this app. */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-900">Signed in as</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-slate-500">Name</dt>
            <dd className="text-slate-800">{user?.name}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-slate-500">Email</dt>
            <dd className="text-slate-800">{user?.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-slate-500">User ID</dt>
            <dd className="font-mono text-xs text-slate-500">{user?.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
