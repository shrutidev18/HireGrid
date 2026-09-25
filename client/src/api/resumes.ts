import { apiClient } from './client';
import type { Resume, ResumeWithApplications } from '../types/api';

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
