// shared TS types used across the client

export interface User {
  id: string;
  name: string;
  email: string;
}

export type EmploymentType = "INTERNSHIP" | "FULL_TIME";

export type ApplicationStatus = "SAVED" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED";

export interface Resume {
  id: string;
  fileName: string;
  fileUrl: string;
  extractedText: string;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  status: ApplicationStatus;
  changedAt: string;
}

export interface AnalysisResult {
  id: string;
  matchedSkills: string[];
  missingSkills: string[];
  matchScore: number | null;
  suggestions: string[];
  createdAt: string;
}

export interface Application {
  id: string;
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  employmentType: EmploymentType;
  jobLink: string | null;
  jobDescription: string;
  resumeId: string | null;
  resume?: Resume | null;
  status: ApplicationStatus;
  dateApplied: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory?: StatusHistoryEntry[];
  analysisResult?: AnalysisResult | null;
}
