import { Queue } from 'bullmq';

import { createQueueConnection } from '../config/redis';

/**
 * The queue that decouples "the user saved an application" from "the AI has
 * analysed it".
 *
 * Without it, creating an application would hold the HTTP request open for the
 * several seconds a Gemini call takes — the form would appear to hang, a
 * connection would be tied up per user, and a slow or failing API would make
 * the whole app feel broken. With it, the request returns immediately, the
 * work happens in a separate process, and the client polls for the result.
 *
 * The queue also survives restarts. Jobs live in Redis, not in memory, so a
 * worker crashing or being redeployed mid-analysis does not lose the work —
 * which is the argument for BullMQ over `setTimeout` or an in-process
 * background function.
 */

export const ANALYSIS_QUEUE_NAME = 'analysis-queue';

/**
 * What one job carries.
 *
 * The resume text and job description are copied into the job rather than
 * being looked up by id in the worker. That is deliberate: the job is a
 * snapshot of the question being asked. If the user edits the job description
 * a second after saving, the running analysis still answers the question that
 * was actually asked, and the cache key — a hash of this exact text — stays
 * consistent with the result it produces.
 */
export interface AnalysisJobData {
  applicationId: string;
  resumeText: string;
  jobDescription: string;
}

/**
 * The queue is created on first use, not when this module is imported.
 *
 * Constructing a BullMQ Queue opens a Redis connection. Doing that at import
 * time means anything that transitively imports this file — the Express app,
 * and therefore every test suite — connects to Redis just by being loaded,
 * whether or not it ever queues a job. Importing a module should not have
 * infrastructure side effects.
 */
let queue: Queue<AnalysisJobData> | null = null;

function getQueue(): Queue<AnalysisJobData> {
  if (queue) return queue;

  queue = new Queue<AnalysisJobData>(ANALYSIS_QUEUE_NAME, {
    connection: createQueueConnection('hiregrid-queue-producer'),

    defaultJobOptions: {
      /**
       * Attempts with backoff, for failures that are worth waiting out:
       * infrastructure blips, and — the common one in practice — the AI
       * provider answering 503 "high demand" or 429 "rate limited".
       *
       * The worker rethrows those so BullMQ does the waiting, because *when*
       * to retry is a scheduling problem and scheduling is what a queue is
       * for. Failures that retrying cannot fix — a malformed response, a bad
       * API key — are handled inside the worker and never reach here, so these
       * attempts can never multiply into repeated pointless Gemini calls.
       */
      attempts: 5,

      /**
       * Exponential: roughly 4s, 8s, 16s, 32s — about a minute of patience
       * before giving up, which comfortably outlasts a typical capacity spike.
       * The analysis stays PENDING throughout, so the user sees "Analyzing…"
       * rather than a failure that was only ever temporary.
       */
      backoff: { type: 'exponential', delay: 4000 },

      /**
       * Bound how much finished-job history Redis keeps. Left unbounded, every
       * job ever run accumulates forever in the same Redis that serves the
       * cache — a memory leak with a long fuse.
       */
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  return queue;
}

/** Adds one analysis job. */
export async function enqueueAnalysis(data: AnalysisJobData): Promise<void> {
  await getQueue().add('analyze', data);
}

/** Closes the producer connection during graceful shutdown. */
export async function closeAnalysisQueue(): Promise<void> {
  if (!queue) return;

  await queue.close();
  queue = null;
}
