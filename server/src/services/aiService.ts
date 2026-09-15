import { GoogleGenAI, Type } from '@google/genai';

import { env } from '../config/env';
import { classifyAiError } from '../utils/aiError';

/**
 * The only code in the project that talks to Gemini.
 *
 * It is called from exactly one place — the BullMQ worker — and never from a
 * route handler. An AI call takes seconds and can fail; holding an HTTP
 * request open for it would make the app feel broken and tie up a connection
 * for the duration. The queue exists precisely so this can be slow.
 */

/**
 * The system instruction, fixed by the specification.
 *
 * The last clause is the one doing real work: without it a model reliably
 * produces generic careers advice ("Docker is widely used in industry"), which
 * is worthless next to a specific posting. Asking for reasoning tied to *this*
 * role is the difference between a feature and a novelty.
 */
const SYSTEM_INSTRUCTION =
  "You are analyzing a candidate's resume against a job description. " +
  'Extract required and preferred skills from the JD, compare against the resume, ' +
  'and return ONLY valid JSON matching the exact schema provided. ' +
  'For each missing skill, the reasoning field should briefly explain why that skill ' +
  'matters for this specific role, not generic advice.';

/**
 * Appended on the retry after a response failed validation.
 *
 * Kept separate from the system instruction so the first attempt is not
 * cluttered with corrections for a mistake that usually does not happen.
 */
const STRICTER_REMINDER =
  '\n\nIMPORTANT: your previous response could not be parsed. Return ONLY a single ' +
  'JSON object matching the schema exactly. No markdown code fences, no commentary ' +
  'before or after, no trailing text. matchScore must be an integer between 0 and 100.';

/**
 * The response shape, declared to the API rather than only asked for in prose.
 *
 * Combined with `responseMimeType: 'application/json'`, this puts the model
 * into constrained decoding — it is structurally prevented from emitting
 * anything but JSON of this shape. That is what makes the malformed-response
 * path rare rather than routine. The Zod check afterwards still runs, because
 * "rare" is not "impossible" and this data is written to the database.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    matchedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    matchScore: { type: Type.INTEGER },
    atsKeywords: {
      type: Type.OBJECT,
      properties: {
        present: { type: Type.ARRAY, items: { type: Type.STRING } },
        missing: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['present', 'missing'],
    },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    reasoning: { type: Type.STRING },
  },
  required: [
    'requiredSkills',
    'preferredSkills',
    'matchedSkills',
    'missingSkills',
    'matchScore',
    'atsKeywords',
    'suggestions',
    'reasoning',
  ],
};

/**
 * Inputs are capped before being sent.
 *
 * A resume is rarely over a few thousand characters, but the job-description
 * field accepts 50,000 and someone will paste an entire careers page into it.
 * Every character costs tokens, latency, and free-tier quota. Truncating keeps
 * one pathological input from consuming the day's allowance — and the useful
 * content of both documents is near the start.
 */
const MAX_RESUME_CHARS = 20_000;
const MAX_JD_CHARS = 20_000;

/**
 * How long one call may take before we cancel it.
 *
 * Bounded on purpose: an unbounded request holds a worker slot forever, and
 * with a concurrency of 2 that is half the worker's capacity lost to a single
 * stuck job. A cancelled call is not a lost analysis — the timeout is
 * classified as retryable, so the queue backs off and tries again.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/** A single client, reused across jobs rather than constructed per call. */
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…[truncated]`;
}

/**
 * Asks Gemini to compare a resume against a job description.
 *
 * Returns the parsed JSON as `unknown` — deliberately. This function's job is
 * to get bytes back and turn them into a value; deciding whether that value is
 * *trustworthy* is the caller's, and the worker does it with Zod. Typing the
 * return as the expected shape here would be a lie, because nothing has
 * checked it yet.
 *
 * Throws on a network failure, an auth failure, a quota rejection, or a
 * response that is not JSON at all. The worker treats every one of those the
 * same way: retry once, then record FAILED.
 */
export async function analyzeResumeAgainstJD(
  resumeText: string,
  jobDescription: string,
  options: { stricter?: boolean } = {},
): Promise<unknown> {
  const prompt = [
    '## Resume',
    truncate(resumeText, MAX_RESUME_CHARS),
    '',
    '## Job description',
    truncate(jobDescription, MAX_JD_CHARS),
  ].join('\n');

  // A hung request would otherwise occupy a worker slot indefinitely.
  //
  // Raised from 60s after a real timeout in development. Two things eat the
  // budget that a napkin estimate misses: the SDK retries a 503 internally
  // before surfacing anything, and a reasoning-capable model spends time
  // thinking before its first output token. 60s was inside that range, so a
  // request that would have succeeded was being cancelled by us.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const startedAt = Date.now();

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: options.stricter
          ? SYSTEM_INSTRUCTION + STRICTER_REMINDER
          : SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Low, not zero. This is an extraction and comparison task where the
        // same inputs should give the same answer; creativity is not wanted
        // and would make the cache less meaningful.
        temperature: 0.2,
        abortSignal: controller.signal,
      },
    });

    const text = response.text;

    console.log(`[ai] ${env.GEMINI_MODEL} responded in ${Date.now() - startedAt}ms`);

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return JSON.parse(text) as unknown;
  } catch (err) {
    // The elapsed time is logged on the failure path too, because it is the
    // one number that separates the two failure stories that otherwise look
    // identical in a log: a request rejected immediately (a bad key, a bad
    // model name) and a request that ran until it was cancelled (the provider
    // being slow or overloaded). Without it, diagnosing means guessing.
    console.warn(`[ai] ${env.GEMINI_MODEL} failed after ${Date.now() - startedAt}ms`);

    // Every failure leaves here classified, so the worker can tell a transient
    // "the service is busy" apart from a permanent "this request is wrong"
    // without having to parse provider-specific error shapes itself.
    throw classifyAiError(err);
  } finally {
    clearTimeout(timeout);
  }
}
