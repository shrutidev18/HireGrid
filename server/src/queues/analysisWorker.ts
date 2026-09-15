import { Worker, type Job } from 'bullmq';

import { prisma } from '../config/db';
import { createQueueConnection } from '../config/redis';
import { analyzeResumeAgainstJD } from '../services/aiService';
import { getCachedAnalysis, setCachedAnalysis } from '../services/cacheService';
import { analysisCacheKey } from '../utils/hash';
import { AiServiceError, classifyAiError } from '../utils/aiError';
import { analysisResponseSchema, type AnalysisResponse } from '../utils/validators';
import { ANALYSIS_QUEUE_NAME, type AnalysisJobData } from './analysisQueue';

/**
 * The only place in the codebase that calls Gemini.
 *
 * Runs as its own process (`npm run worker`), not inside the API. That is the
 * point of using a queue rather than a background function: the worker can be
 * restarted, scaled to several instances, or crash entirely without the API
 * noticing, and a slow AI call never occupies an HTTP connection.
 */

/** Writes a successful analysis to PostgreSQL. */
async function writeCompleted(
  applicationId: string,
  result: AnalysisResponse,
): Promise<void> {
  const fields = {
    status: 'COMPLETED' as const,
    requiredSkills: result.requiredSkills,
    preferredSkills: result.preferredSkills,
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    matchScore: result.matchScore,
    atsKeywordsPresent: result.atsKeywords.present,
    atsKeywordsMissing: result.atsKeywords.missing,
    suggestions: result.suggestions,
    reasoning: result.reasoning,
  };

  // Upsert rather than update: the PENDING row is created when the job is
  // enqueued, but a job could outlive it (a database restored from a backup,
  // a row deleted by hand). Upsert makes the worker's outcome the source of
  // truth either way instead of throwing on a missing row.
  await prisma.analysisResult.upsert({
    where: { applicationId },
    update: fields,
    create: { applicationId, ...fields },
  });
}

/**
 * Records that the analysis could not be produced.
 *
 * A FAILED row is important: without it the client polls a PENDING analysis
 * forever, showing a spinner for something that will never arrive. Recording
 * the failure is what lets the UI offer a Retry button instead.
 */
async function markFailed(applicationId: string): Promise<void> {
  await prisma.analysisResult.upsert({
    where: { applicationId },
    update: { status: 'FAILED' },
    create: { applicationId, status: 'FAILED' },
  });
}

/**
 * Calls Gemini, validates the reply, and retries **once** with a stricter
 * prompt if it did not validate.
 *
 * Returns null when both attempts fail, which the caller records as FAILED.
 * A language model returning prose instead of JSON is an expected outcome, not
 * an exception, and it must never take the worker down.
 *
 * The one thing it *does* throw is a retryable provider error (503, 429, a
 * network fault). Those are not "the model gave a bad answer" — they are "ask
 * again shortly" — and BullMQ, not this loop, is the right place to wait.
 *
 * Two immediate attempts, not more. If a model ignores a schema twice in a row
 * the third attempt is unlikely to differ, and each one costs latency and
 * free-tier quota.
 */
async function analyseWithOneRetry(
  resumeText: string,
  jobDescription: string,
): Promise<AnalysisResponse | null> {
  for (const stricter of [false, true]) {
    try {
      const raw = await analyzeResumeAgainstJD(resumeText, jobDescription, { stricter });
      const parsed = analysisResponseSchema.safeParse(raw);

      if (parsed.success) {
        return parsed.data;
      }

      console.warn(
        `[worker] AI response failed validation${stricter ? ' (retry)' : ''}:`,
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
    } catch (err) {
      const aiError = err instanceof AiServiceError ? err : classifyAiError(err);

      /**
       * A retryable failure is not this function's problem to solve.
       *
       * 503 "high demand" and 429 "rate limited" mean the request was fine and
       * the service could not serve it *at that moment*. Retrying immediately
       * — which is what looping here would do — hits the same overloaded model
       * milliseconds later and fails identically. That is how a capacity blip
       * turns into a permanent "analysis failed" on the user's screen.
       *
       * Rethrowing hands it to BullMQ, which already knows how to wait:
       * exponential backoff over about a minute. The analysis stays PENDING
       * while that happens, so the user keeps seeing "Analyzing…" rather than
       * a failure that was only ever temporary.
       */
      if (aiError.retryable) {
        console.warn(
          `[worker] Gemini unavailable (${aiError.status ?? 'timeout/network'}) — ` +
            `backing off and retrying via the queue: ${aiError.message}`,
        );
        throw aiError;
      }

      // Not retryable: a bad key, a malformed request, a reply that was not
      // JSON. The same call will fail the same way in thirty seconds, so try
      // once more with the stricter prompt and then give up cleanly.
      console.warn(
        `[worker] Gemini call failed${stricter ? ' (retry)' : ''}:`,
        aiError.message,
      );
    }
  }

  return null;
}

/**
 * Processes one job: cache first, AI second, database last.
 *
 * The cache check is not an optimisation bolted on the side — it is the first
 * step of the flow, and the AI is only reached on a miss.
 */
export async function processAnalysisJob(job: Job<AnalysisJobData>): Promise<void> {
  const { applicationId, resumeText, jobDescription } = job.data;

  // 1. The key is a hash of the *content*, so two different applications built
  //    from the same posting and resume share an entry.
  const key = analysisCacheKey(resumeText, jobDescription);

  // 2. Cache first, always.
  const cached = await getCachedAnalysis(key);

  if (cached) {
    console.log(`[worker] cache HIT for application ${applicationId} — no Gemini call`);
    await writeCompleted(applicationId, cached);
    return;
  }

  console.log(`[worker] cache MISS for application ${applicationId} — calling Gemini`);

  // 3 & 4. Call, validate, retry once on failure.
  const result = await analyseWithOneRetry(resumeText, jobDescription);

  if (!result) {
    console.error(`[worker] analysis FAILED for application ${applicationId}`);
    await markFailed(applicationId);

    // Returning rather than throwing: the outcome has been recorded, so this
    // job is finished. Throwing would make BullMQ retry it and repeat the two
    // Gemini calls that already failed.
    return;
  }

  // 5. Only fresh results are cached — a cache hit is not rewritten.
  await setCachedAnalysis(key, result);

  // 6. Persist.
  await writeCompleted(applicationId, result);

  console.log(`[worker] analysis COMPLETED for application ${applicationId}`);
}

/**
 * Starts the worker.
 *
 * Exported as a function rather than run on import, so that importing this
 * module in a test does not start consuming a real queue.
 */
export function startAnalysisWorker(): Worker<AnalysisJobData> {
  const worker = new Worker<AnalysisJobData>(ANALYSIS_QUEUE_NAME, processAnalysisJob, {
    connection: createQueueConnection('hiregrid-queue-worker'),

    /**
     * Two jobs at a time. Each is mostly spent waiting on a network call, so
     * some concurrency is free throughput — but the free tier has a
     * requests-per-minute limit, and an unbounded worker would hit it and turn
     * every analysis into a quota rejection.
     */
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} done`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} threw:`, err.message);

    // This fires for *unexpected* errors — the database being unreachable, a
    // bug — not for a failed AI call, which is handled above. Once BullMQ has
    // exhausted its attempts, record the failure so the client stops polling a
    // PENDING row that will never complete.
    const attemptsExhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);

    if (job && attemptsExhausted) {
      void markFailed(job.data.applicationId).catch((markErr: Error) => {
        console.error('[worker] could not mark analysis as failed:', markErr.message);
      });
    }
  });

  return worker;
}
