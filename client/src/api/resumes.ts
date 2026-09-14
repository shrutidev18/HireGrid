import { apiClient } from './client';
import type { Resume, ResumeWithApplications } from '../types/api';

/**
 * Resume API calls.
 *
 * The upload is the only request in the app that sends something other than
 * JSON, and the only one that reports progress.
 */

export async function fetchResumes(): Promise<Resume[]> {
  const { data } = await apiClient.get<{ resumes: Resume[] }>('/api/resumes');
  return data.resumes;
}

export async function fetchResume(id: string): Promise<ResumeWithApplications> {
  const { data } = await apiClient.get<{ resume: ResumeWithApplications }>(
    `/api/resumes/${id}`,
  );
  return data.resume;
}

/**
 * Uploads a file as multipart/form-data.
 *
 * The field name — "file" — has to match what Multer's `upload.single('file')`
 * expects on the server. A mismatch is rejected as an unexpected field, which
 * is a confusing error to debug from the client side.
 *
 * No Content-Type is set: the browser generates a multipart boundary and only
 * it knows the value, so axios must be left to read it from the FormData.
 */
export async function uploadResume(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Resume> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiClient.post<{ resume: Resume }>('/api/resumes', formData, {
    onUploadProgress: (event) => {
      // `total` is absent when the size is unknown (chunked encoding), so the
      // progress bar is only driven when there is something real to show.
      if (event.total) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    },
  });

  return data.resume;
}

export async function deleteResume(id: string): Promise<void> {
  await apiClient.delete(`/api/resumes/${id}`);
}

/**
 * Downloads a resume through the API and hands it to the browser.
 *
 * A plain `<a href>` to the download URL would be simpler, but it would leave
 * the authenticated fetch to the browser's navigation rules rather than going
 * through the configured axios instance. Fetching as a blob keeps every
 * authenticated request on one path — the same instance, the same cookie
 * handling, the same error shape — and means a 401 or 404 surfaces as a normal
 * error instead of the browser navigating to a JSON error page.
 *
 * The object URL is revoked immediately after the click: it pins the blob in
 * memory until released, and a 5 MB leak per download adds up.
 */
export async function downloadResume(id: string, fileName: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/api/resumes/${id}/download`, {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(response.data);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
