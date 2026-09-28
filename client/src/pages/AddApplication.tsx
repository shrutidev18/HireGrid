import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createApplication, getApplication, updateApplication } from "../api/applications";
import { getResumes } from "../api/resumes";
import type { Resume } from "../types";

// this page doubles as both "add" and "edit" - if there's an :id in the
// url we're editing an existing application, otherwise we're creating one.
// keeps us from having to build a near-identical second page.
export default function AddApplication() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("INTERNSHIP");
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [dateApplied, setDateApplied] = useState("");
  const [notes, setNotes] = useState("");

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);

  useEffect(() => {
    getResumes().then(setResumes);
  }, []);

  // in edit mode, load the existing application and prefill the form
  useEffect(() => {
    if (!id) return;
    getApplication(id).then((app) => {
      setCompanyName(app.companyName);
      setJobTitle(app.jobTitle);
      setJobLocation(app.jobLocation);
      setEmploymentType(app.employmentType);
      setJobLink(app.jobLink || "");
      setJobDescription(app.jobDescription);
      setResumeId(app.resumeId || "");
      setDateApplied(app.dateApplied ? app.dateApplied.slice(0, 10) : "");
      setNotes(app.notes || "");
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!companyName || !jobTitle || !jobLocation || !jobDescription) {
      setError("Company, job title, location and job description are required");
      return;
    }

    const formData = {
      companyName,
      jobTitle,
      jobLocation,
      employmentType,
      jobLink: jobLink || undefined,
      jobDescription,
      resumeId: resumeId || undefined,
      dateApplied: dateApplied || undefined,
      notes: notes || undefined,
    };

    setSubmitting(true);
    try {
      if (isEditMode && id) {
        await updateApplication(id, formData);
        navigate(`/applications/${id}`);
      } else {
        // if a resume is attached, the server runs the Gemini match analysis
        // as part of this same request, so this call can take a few seconds -
        // the button below shows "Analyzing..." while that's happening
        const application = await createApplication(formData);
        navigate(`/applications/${application.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Something went wrong, try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600";

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">
        {isEditMode ? "Edit Application" : "Add Application"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-2xl border border-teal-100 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employment type</label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className={inputClass}
            >
              <option value="INTERNSHIP">Internship</option>
              <option value="FULL_TIME">Full-time</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job link (optional)</label>
          <input
            value={jobLink}
            onChange={(e) => setJobLink(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job description</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={6}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
          <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className={inputClass}>
            <option value="">-- none --</option>
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fileName}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            No resumes yet?{" "}
            <Link to="/resumes" className="text-teal-700 hover:underline">
              Upload one
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date applied (optional)</label>
            <input
              type="date"
              value={dateApplied}
              onChange={(e) => setDateApplied(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {submitting && !isEditMode && resumeId && (
          <p className="text-sm text-teal-700">Analyzing your resume against this job description...</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-teal-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {submitting
              ? !isEditMode && resumeId
                ? "Analyzing..."
                : "Saving..."
              : isEditMode
                ? "Save changes"
                : "Add application"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
