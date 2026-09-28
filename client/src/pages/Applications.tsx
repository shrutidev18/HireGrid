import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { getApplications } from "../api/applications";
import StatusBadge from "../components/StatusBadge";
import type { Application, ApplicationStatus } from "../types";

const STATUS_OPTIONS: ApplicationStatus[] = ["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

export default function Applications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    // small debounce so we're not firing a request on every keystroke
    const timeout = setTimeout(() => {
      getApplications({ search: search || undefined, status: status || undefined })
        .then(setApplications)
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Applications</h1>
        <button
          onClick={() => navigate("/applications/new")}
          className="flex items-center gap-1.5 bg-teal-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-800"
        >
          <Plus size={16} />
          Add Application
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company or role..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-500 p-4">Loading...</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No applications match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-mint-bg text-left text-teal-800">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => navigate(`/applications/${app.id}`)}
                  className="cursor-pointer hover:bg-mint-bg"
                >
                  <td className="px-4 py-3 text-gray-900">{app.companyName}</td>
                  <td className="px-4 py-3 text-gray-700">{app.jobTitle}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.dateApplied ? new Date(app.dateApplied).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
