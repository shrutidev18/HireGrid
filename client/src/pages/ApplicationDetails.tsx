import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { getApplication, updateApplicationStatus, deleteApplication } from "../api/applications";
import StatusBadge from "../components/StatusBadge";
import StatusHistoryList from "../components/StatusHistoryList";
import AnalysisResult from "../components/AnalysisResult";
import type { Application, ApplicationStatus } from "../types";

const STATUS_OPTIONS: ApplicationStatus[] = ["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

export default function ApplicationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);

  function loadApplication() {
    if (!id) return;
    getApplication(id)
      .then(setApplication)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(newStatus: ApplicationStatus) {
    if (!id) return;
    setChangingStatus(true);
    try {
      const updated = await updateApplicationStatus(id, newStatus);
      setApplication(updated);
      loadApplication(); // refresh so status history shows the new entry
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Delete this application? This can't be undone.")) return;
    await deleteApplication(id);
    navigate("/dashboard");
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  if (!application) {
    return <p className="text-sm text-gray-500">Application not found.</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{application.jobTitle}</h1>
            <p className="text-gray-500">{application.companyName}</p>
          </div>
          <StatusBadge status={application.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
          <div>
            <span className="text-gray-400">Location</span>
            <p className="text-gray-800">{application.jobLocation}</p>
          </div>
          <div>
            <span className="text-gray-400">Type</span>
            <p className="text-gray-800">
              {application.employmentType === "INTERNSHIP" ? "Internship" : "Full-time"}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Date applied</span>
            <p className="text-gray-800">
              {application.dateApplied ? new Date(application.dateApplied).toLocaleDateString() : "-"}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Resume</span>
            <p className="text-gray-800">{application.resume?.fileName || "-"}</p>
          </div>
        </div>

        {application.jobLink && (
          <a
            href={application.jobLink}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-teal-700 hover:underline block mt-3"
          >
            View job posting
          </a>
        )}

        <div className="mt-4">
          <span className="text-sm text-gray-400">Job description</span>
          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{application.jobDescription}</p>
        </div>

        {application.notes && (
          <div className="mt-4">
            <span className="text-sm text-gray-400">Notes</span>
            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{application.notes}</p>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <span className="text-sm text-gray-500">Change status:</span>
          <select
            value={application.status}
            disabled={changingStatus}
            onChange={(e) => handleStatusChange(e.target.value as ApplicationStatus)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate(`/applications/${application.id}/edit`)}
            className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-sm border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-6 mt-4">
        <h2 className="font-semibold text-gray-900 mb-3">Status History</h2>
        <StatusHistoryList history={application.statusHistory || []} />
      </div>

      {application.analysisResult && <AnalysisResult analysis={application.analysisResult} />}
    </div>
  );
}
