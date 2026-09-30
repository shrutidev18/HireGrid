import { useState, useRef, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { uploadResume } from "../api/resumes";

// drag-and-drop (or click to browse) resume uploader. Validates type/size,
// then uploads right away - no separate "confirm" step, keeps this simple.
export default function ResumeUpload({ onUploaded }: { onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");

    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too big - 5MB max");
      return;
    }

    setUploading(true);
    try {
      await uploadResume(file);
      onUploaded();
    } catch (err: any) {
      setError(err.response?.data?.error || "Upload failed, try again");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
        dragging ? "border-blue-500 bg-app-bg" : "border-blue-200 bg-white"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="hidden"
        id="resume-file-input"
      />

      <div className="w-12 h-12 mx-auto mb-3 bg-app-bg rounded-full flex items-center justify-center text-blue-700">
        <UploadCloud size={22} />
      </div>

      {uploading ? (
        <p className="text-sm text-gray-500">Uploading...</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900">Drop your resume here</p>
          <p className="text-sm text-gray-500">
            or{" "}
            <label htmlFor="resume-file-input" className="text-blue-700 hover:underline cursor-pointer">
              browse your files
            </label>
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF only, up to 5MB</p>
        </>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
