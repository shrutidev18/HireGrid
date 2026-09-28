import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { getResumes, deleteResume } from "../api/resumes";
import ResumeUpload from "../components/ResumeUpload";
import type { Resume } from "../types";

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
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">My Resumes</h1>

      <ResumeUpload onUploaded={loadResumes} />

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : resumes.length === 0 ? (
          <p className="text-sm text-gray-400">No resumes uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-teal-100 shadow-sm">
            {resumes.map((resume) => (
              <li key={resume.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{resume.fileName}</p>
                  <p className="text-xs text-gray-400">
                    Uploaded {new Date(resume.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(resume.id)}
                  className="flex items-center gap-1 text-sm text-red-600 hover:underline"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
