/**
 * Shapes returned by the HireGrid API.
 *
 * These are hand-written and must stay in step with the server's responses.
 * Keeping them in one folder rather than inline in components means a response
 * shape changes in exactly one place.
 */

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The only user shape the API ever returns.
 *
 * Note there is no `password` or `passwordHash` field — not because they are
 * omitted here, but because the server never sends them.
 */
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: User;
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Enums
//
// Mirrors of the PostgreSQL enums in prisma/schema.prisma. The API sends and
// accepts the raw values (`ONLINE_ASSESSMENT`); the label maps below exist so
// no component has to build a human-readable string from one, and so changing
// the wording happens in one place.
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'ONLINE_ASSESSMENT',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFER',
  'REJECTED',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The stages an application moves *through*, in order.
 *
 * REJECTED is deliberately not in this list. It can happen at any point and is
 * an exit from the pipeline, not a position along it — forcing it into a
 * linear stepper would imply it comes after OFFER, which is nonsense. The UI
 * renders it as a separate branch.
 */
export const PIPELINE_STAGES = [
  'SAVED',
  'APPLIED',
  'ONLINE_ASSESSMENT',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFER',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  ONLINE_ASSESSMENT: 'Online Assessment',
  TECH_INTERVIEW: 'Tech Interview',
  HR_INTERVIEW: 'HR Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
};

export const EMPLOYMENT_TYPES = ['INTERNSHIP', 'FULL_TIME'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  INTERNSHIP: 'Internship',
  FULL_TIME: 'Full-time',
};

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'Onsite',
};

export type AnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * One entry in an application's history.
 *
 * Dates arrive as ISO strings: JSON has no date type, so anything that was a
 * `DateTime` in Prisma is a string by the time it reaches here. Components
 * parse it with `new Date(...)` at the point of display.
 */
export interface StatusHistoryEntry {
  id: string;
  applicationId: string;
  status: ApplicationStatus;
  changedAt: string;
  note: string | null;
}

/** Summary of an AI analysis. Filled in from Phase 5 onward. */
export interface AnalysisSummary {
  status: AnalysisStatus;
  matchScore: number | null;
}

/** The resume attached to an application, when there is one. */
export interface ResumeRef {
  id: string;
  fileName: string;
}

/** A row in the applications list — deliberately lighter than the full record. */
export interface ApplicationListItem {
  id: string;
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  employmentType: EmploymentType;
  workMode: WorkMode | null;
  status: ApplicationStatus;
  dateApplied: string | null;
  salary: string | null;
  createdAt: string;
  updatedAt: string;
  resume: ResumeRef | null;
  analysisResult: AnalysisSummary | null;
}

/** GET /api/applications/:id — the full record with its relations. */
export interface Application extends ApplicationListItem {
  jobLink: string | null;
  jobDescription: string;
  notes: string | null;
  resumeId: string | null;
  statusHistory: StatusHistoryEntry[];
  analysisResult: AnalysisSummary | null;
}

/** Body for POST /api/applications. */
export interface CreateApplicationPayload {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  employmentType: EmploymentType;
  workMode?: WorkMode | null;
  jobLink?: string | null;
  jobDescription: string;
  resumeId?: string | null;
  dateApplied?: string | null;
  salary?: string | null;
  notes?: string | null;
  status?: ApplicationStatus;
}

/**
 * Body for PUT /api/applications/:id.
 *
 * Every field optional, and `status` is absent entirely — it is not editable
 * through this endpoint, because a status change must also write a history
 * row. That is what `updateStatus` is for.
 */
export type UpdateApplicationPayload = Partial<Omit<CreateApplicationPayload, 'status'>>;

/** Body for PATCH /api/applications/:id/status. */
export interface UpdateStatusPayload {
  status: ApplicationStatus;
  note?: string | null;
}

/** Response of PATCH /api/applications/:id/status. */
export interface UpdateStatusResponse {
  application: Application;
  statusHistory: StatusHistoryEntry;
}

// ---------------------------------------------------------------------------
// Listing: search, filters, sorting, pagination
// ---------------------------------------------------------------------------

export const APPLICATION_SORT_FIELDS = ['companyName', 'dateApplied', 'updatedAt'] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];

export type SortOrder = 'asc' | 'desc';

/**
 * Every control on the applications screen, in one object.
 *
 * Kept as a single value rather than a dozen separate `useState` calls because
 * it is also the React Query cache key. One object means one place that
 * decides what makes a request distinct — add a filter here and it is
 * automatically part of the key, instead of being silently absent from it and
 * serving cached results for the wrong filter.
 *
 * Dates are `YYYY-MM-DD` strings, which is exactly what `<input type="date">`
 * produces and what the server's `z.coerce.date()` accepts. Converting to a
 * `Date` on the client would only mean converting back.
 */
export interface ApplicationListQuery {
  search?: string;
  status?: ApplicationStatus;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  resumeId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy: ApplicationSortField;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

/** One page of results, plus what the pager needs to render itself. */
export interface ApplicationListResponse {
  data: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

/**
 * A resume as the API returns it.
 *
 * There is no `extractedText` field — the server never sends it. It can be
 * tens of kilobytes, no screen displays it, and it exists only so the AI
 * analysis can read it server-side.
 */
export interface Resume {
  id: string;
  fileName: string;
  createdAt: string;
}

/** An application that uses a given resume, as shown on the resume page. */
export interface ResumeApplicationRef {
  id: string;
  companyName: string;
  jobTitle: string;
}

/** GET /api/resumes/:id — the resume plus what is using it. */
export interface ResumeWithApplications extends Resume {
  applications: ResumeApplicationRef[];
}

/** Accepted upload formats, mirrored from the server's Multer configuration. */
export const ACCEPTED_RESUME_EXTENSIONS = ['.pdf', '.docx'] as const;

/** 5 MB, matching MAX_UPLOAD_BYTES on the server. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// AI analysis
// ---------------------------------------------------------------------------

/**
 * The full analysis record.
 *
 * Note the shape difference from what the AI returns: the model produces a
 * nested `atsKeywords: { present, missing }`, which the worker flattens into
 * two database columns. The API returns the database shape, so the client sees
 * `atsKeywordsPresent` / `atsKeywordsMissing`.
 *
 * Every array is non-nullable and defaults to empty, so components can map
 * over them without a null check. `matchScore` is the exception — it is
 * genuinely unknown until the analysis completes, and defaulting it to 0 would
 * make a pending analysis look like a terrible match.
 */
export interface AnalysisResult {
  id: string;
  applicationId: string;
  status: AnalysisStatus;
  requiredSkills: string[];
  preferredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  matchScore: number | null;
  atsKeywordsPresent: string[];
  atsKeywordsMissing: string[];
  suggestions: string[];
  reasoning: string | null;
  createdAt: string;
  updatedAt: string;
}
