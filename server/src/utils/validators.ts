import { z } from 'zod';

/**
 * Every request body and query string in the API is validated by a schema in
 * this file before a controller touches it.
 *
 * The pattern throughout: define the schema, then derive the TypeScript type
 * from it with `z.infer`. The runtime check and the compile-time type come
 * from one definition, so they cannot drift apart the way a hand-written
 * interface next to a hand-written validator eventually does.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** POST /api/auth/signup */
export const signupSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),

  email: z
    .email({ error: 'Enter a valid email address' })
    // Normalised before it reaches the database so that Shruti@x.com and
    // shruti@x.com cannot become two accounts. The @unique constraint
    // compares bytes, not intent — this is what makes it behave as expected.
    .toLowerCase()
    .trim(),

  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    // bcrypt silently truncates input beyond 72 bytes, so anything longer
    // would give a false sense of strength. Rejecting is more honest than
    // silently ignoring the tail.
    .max(72, 'Password must be 72 characters or fewer'),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** POST /api/auth/login */
export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }).toLowerCase().trim(),

  /**
   * Deliberately only `min(1)`, not `min(8)` like signup.
   *
   * If login enforced the signup password rules, a 7-character guess would
   * come back 400 "must be at least 8 characters" while a wrong 9-character
   * guess came back 401. That difference tells an attacker about the password
   * policy and splits failures into distinguishable buckets. Every wrong
   * credential should fail the same way.
   */
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Enum values
//
// These must stay identical to the enums in prisma/schema.prisma. They are
// written out rather than imported from the generated Prisma client so that
// the schemas type-check without a `prisma generate` having run first.
//
// The risk of them drifting is contained: PostgreSQL's own enum type is the
// backstop. A value that exists here but not in the database is rejected at
// write time with an immediate, loud error rather than a silently bad row.
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

export const EMPLOYMENT_TYPES = ['INTERNSHIP', 'FULL_TIME'] as const;

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;

export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * An optional free-text field that a form may submit as an empty string.
 *
 * HTML forms send `""` for an untouched optional input, never `undefined`.
 * Stored as-is, that would fill the database with empty strings that are not
 * null but carry no information, and every read would then have to check for
 * both. Normalising `""` to `null` at the boundary means the rest of the
 * codebase only ever deals with "a value" or "no value".
 */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => (value ? value : null));

/** An optional URL that may also arrive as an empty string. */
const optionalUrl = z
  .union([z.literal(''), z.url({ error: 'Enter a valid URL, including https://' }), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

/**
 * An optional date arriving from an `<input type="date">` (which submits
 * "2026-09-11") or as a full ISO timestamp.
 *
 * `z.coerce.date()` accepts both. Nullable so the user can clear a date they
 * set previously — `undefined` would mean "leave unchanged" on an update,
 * which is a different intention.
 */
const optionalDate = z.coerce
  .date({ error: 'Enter a valid date' })
  .nullish()
  .transform((value) => value ?? null);

/**
 * Fields that describe an application. Shared by create and update so the two
 * cannot disagree about what a valid company name is.
 *
 * `status` is deliberately absent. It is not an editable field on this object:
 * it changes only through PATCH /:id/status, because every change has to be
 * recorded in StatusHistory at the same time. Allowing it here would let a
 * status change slip through without a history row, which would quietly break
 * the timeline, the stale-application report and the activity feed.
 */
const applicationFields = {
  companyName: z
    .string({ error: 'Company name is required' })
    .trim()
    .min(1, 'Company name is required')
    .max(200, 'Company name must be 200 characters or fewer'),

  jobTitle: z
    .string({ error: 'Job title is required' })
    .trim()
    .min(1, 'Job title is required')
    .max(200, 'Job title must be 200 characters or fewer'),

  jobLocation: z
    .string({ error: 'Location is required' })
    .trim()
    .min(1, 'Location is required')
    .max(200, 'Location must be 200 characters or fewer'),

  employmentType: z.enum(EMPLOYMENT_TYPES, {
    error: 'Select an employment type',
  }),

  workMode: z.enum(WORK_MODES, { error: 'Select a valid work mode' }).nullish(),

  jobLink: optionalUrl,

  jobDescription: z
    .string({ error: 'Job description is required' })
    .trim()
    .min(1, 'Job description is required')
    // Generous, because the AI analysis in a later phase needs the whole
    // posting, but bounded so one request cannot push a megabyte into the
    // database.
    .max(50_000, 'Job description must be 50,000 characters or fewer'),

  resumeId: z.uuid({ error: 'Invalid resume' }).nullish(),

  dateApplied: optionalDate,

  // Free text, not a number: real postings say "8-12 LPA", "Competitive",
  // "₹45,000/month".
  salary: optionalText(100, 'Salary'),

  notes: optionalText(10_000, 'Notes'),
};

/**
 * POST /api/applications
 *
 * `status` is accepted here — and only here — because an application can be
 * created at any stage. Someone tracking a job they applied to last week
 * should not have to create it as SAVED and then move it. The create path
 * writes the matching first StatusHistory row in the same transaction, so the
 * invariant still holds.
 */
export const createApplicationSchema = z.object({
  ...applicationFields,
  status: z.enum(APPLICATION_STATUSES, { error: 'Select a valid status' }).default('SAVED'),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/**
 * PUT /api/applications/:id
 *
 * Every field optional, so the client can send only what changed. Note the
 * distinction the schema relies on:
 *   - a field that is absent   → leave it alone (Prisma skips `undefined`)
 *   - a field explicitly null  → clear it
 * Those are genuinely different intentions and the API keeps them separate.
 */
export const updateApplicationSchema = z
  .object(applicationFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update',
  });

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

/** PATCH /api/applications/:id/status */
export const updateStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES, { error: 'Select a valid status' }),

  /** Optional context recorded with the change, e.g. "recruiter called". */
  note: optionalText(500, 'Note'),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/**
 * Route parameters that carry a resource id.
 *
 * Validating the id's *shape* before querying means a malformed id returns a
 * clean 400 instead of reaching Prisma and surfacing as a 500 from a failed
 * UUID cast — and it keeps obviously-bogus input from costing a database
 * round trip at all.
 */
export const idParamSchema = z.object({
  id: z.uuid({ error: 'Invalid application id' }),
});

/** Route parameter for resume endpoints. */
export const resumeIdParamSchema = z.object({
  id: z.uuid({ error: 'Invalid resume id' }),
});

// ---------------------------------------------------------------------------
// AI analysis
// ---------------------------------------------------------------------------

/**
 * The shape the AI is asked to return, and the gate everything it says has to
 * pass before it is trusted.
 *
 * This is the most important validation in the project. Everywhere else the
 * untrusted input is a user, who is at least sending structured form data. Here
 * it is a language model: it can return prose instead of JSON, invent fields,
 * omit required ones, or answer a score of 150. Writing that into the database
 * unchecked would put malformed data in front of every later reader — the
 * dashboard's average score, the skill-gap aggregation — with no way to tell
 * where it came from.
 *
 * The worker validates against this and, on failure, retries once with a
 * stricter reminder before marking the analysis FAILED. A bad response is a
 * recorded outcome, never a crashed worker.
 */
export const analysisResponseSchema = z.object({
  requiredSkills: z.array(z.string()).max(50),
  preferredSkills: z.array(z.string()).max(50),
  matchedSkills: z.array(z.string()).max(50),
  missingSkills: z.array(z.string()).max(50),

  // Clamped to the range the UI draws. A model that returns 150 would render a
  // progress ring past full and poison the dashboard average.
  matchScore: z.number().int().min(0).max(100),

  atsKeywords: z.object({
    present: z.array(z.string()).max(50),
    missing: z.array(z.string()).max(50),
  }),

  suggestions: z.array(z.string()).max(20),
  reasoning: z.string().max(10_000),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
