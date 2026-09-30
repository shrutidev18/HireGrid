import { useEffect, useState } from "react";
import { FileText, Download, Trash2, Lightbulb, CheckCircle2 } from "lucide-react";
import { getResumes, deleteResume } from "../api/resumes";
import ResumeUpload from "../components/ResumeUpload";
import type { Resume } from "../types";

// the backend stores fileUrl as a relative path (e.g. /uploads/xyz.pdf), which
// only works while frontend and backend share an origin in dev. in production
// they're on different domains, so we build the full download url ourselves
// by stripping the "/api" suffix off VITE_API_URL to get the backend's origin.
const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

// small helper for "3 days ago" style text next to the actual upload date.
// nothing fancy, just the common cases.
function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export default function MyResumes() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);

  function loadResumes() {
    setLoading(true);
    getResumes()
      .then(setResumes)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadResumes();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this resume?")) return;
    await deleteResume(id);
    loadResumes();
  }

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 w-full">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-gray-900">My Resumes</h1>
            {!loading && resumes.length > 0 && (
              <span className="text-xs font-medium text-blue-700 bg-app-bg px-2 py-0.5 rounded-full">
                {resumes.length}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Upload resumes here so you can attach them when you add a job application.
          </p>

          <ResumeUpload onUploaded={loadResumes} />

          <div className="mt-6">
            {loading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : resumes.length === 0 ? (
              <p className="text-sm text-gray-400">No resumes uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-blue-100 shadow-sm">
                {resumes.map((resume) => (
                  <li key={resume.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 bg-app-bg rounded-lg flex items-center justify-center text-blue-700">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{resume.fileName}</p>
                        <p className="text-xs text-gray-400">
                          Uploaded {new Date(resume.createdAt).toLocaleDateString()} · {timeAgo(resume.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={`${API_ORIGIN}${resume.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
                      >
                        <Download size={14} />
                        Download
                      </a>
                      <button
                        onClick={() => handleDelete(resume.id)}
                        className="flex items-center gap-1 text-sm text-red-600 hover:underline"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* same quick tips pattern used on the Add Application and Application
            Details pages, so this side of the page doesn't sit empty */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900">Quick Tips</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Only PDF files are supported, up to 5MB each.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Keep your resume current - it's what gets matched against each job description.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Upload a few versions if you're applying to different types of roles.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Delete old ones you no longer use to keep this list tidy.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
