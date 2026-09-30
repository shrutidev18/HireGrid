import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  MapPin,
  Users,
  Link2,
  FileText,
  Upload,
  Calendar,
  StickyNote,
  Send,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
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
    "w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600";

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">
          {isEditMode ? "Edit Application" : "Add Application"}
        </h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-7">
        {isEditMode
          ? "Update the details of this application."
          : "Keep track of your job applications and never miss an opportunity."}
      </p>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="flex-1 w-full bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-5"
        >
          {/* just a little header inside the card so the form doesn't start cold */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-app-bg rounded-xl flex items-center justify-center text-blue-700">
              <Briefcase size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Job Details</h2>
              <p className="text-xs text-gray-500">Tell us about the job you're applying for.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Google, Microsoft, TCS..."
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
              <div className="relative">
                <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  placeholder="e.g. Bangalore, Remote, New York"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment type</label>
              <div className="relative">
                <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job link (optional)</label>
            <div className="relative">
              <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job description</label>
            <div className="relative">
              <FileText size={16} className="absolute left-3 top-3 text-gray-400" />
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="Paste the job description or key details here..."
                className={inputClass}
              />
            </div>
            <p className="text-xs text-gray-400 text-right mt-1">{jobDescription.length}/2000</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
            <div className="relative">
              <Upload size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className={inputClass}>
                <option value="">-- none --</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              No resumes yet?{" "}
              <Link to="/resumes" className="text-blue-700 hover:underline">
                Upload one
              </Link>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date applied (optional)</label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={dateApplied}
                  onChange={(e) => setDateApplied(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <div className="relative">
              <StickyNote size={16} className="absolute left-3 top-3 text-gray-400" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional notes..."
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {submitting && !isEditMode && resumeId && (
            <p className="text-sm text-blue-700">Analyzing your resume against this job description...</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
            >
              {!submitting && <Send size={14} />}
              {submitting
                ? !isEditMode && resumeId
                  ? "Analyzing..."
                  : "Saving..."
                : isEditMode
                  ? "Save changes"
                  : "Save Application"}
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

        {/* just a small tips panel so this page doesn't feel so bare - purely static, no logic */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900">Quick Tips</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Keep your resume updated and tailored to the role.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Include relevant skills and experience in your job description.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Track your application status regularly.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Be consistent - progress takes time.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
