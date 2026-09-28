import { useState, useRef } from "react";
import { uploadResume } from "../api/resumes";

// standalone file picker + upload button. Calls onUploaded once the resume
// is saved so the parent (MyResumes page, or the dropdown in AddApplication)
// can refresh its list.
export default function ResumeUpload({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    setError("");

    if (selected && selected.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      setFile(null);
      return;
    }
    if (selected && selected.size > 5 * 1024 * 1024) {
      setError("File is too big - 5MB max");
      setFile(null);
      return;
    }

    setFile(selected || null);
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      await uploadResume(file);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded();
    } catch (err: any) {
      setError(err.response?.data?.error || "Upload failed, try again");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-dashed border-teal-200 rounded-2xl p-5 bg-mint-bg">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="text-sm"
      />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-3 bg-teal-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload resume"}
      </button>
    </div>
  );
}
