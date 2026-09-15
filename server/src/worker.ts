import { env } from './config/env';
import { disconnectDb } from './config/db';
import { disconnectRedis } from './config/redis';
import { startAnalysisWorker } from './queues/analysisWorker';

/**
 * Entry point for the analysis worker process.
 *
 * Run alongside the API with `npm run worker`. It is a separate process on
 * purpose:
 *
 *   - A slow or stuck AI call cannot affect the API's responsiveness.
 *   - The worker can be restarted or deployed independently.
 *   - Throughput scales by running more worker processes, without touching the
 *     API.
 *
 * In development this means one more terminal. That cost is the architecture
 * being real rather than implied — running the worker inside the API would
 * work locally and then have to be untangled the moment it mattered.
 */
const worker = startAnalysisWorker();

console.log('[worker] analysis worker started');
console.log(`[worker] environment: ${env.NODE_ENV}`);
console.log(`[worker] model: ${env.GEMINI_MODEL}`);

/**
 * Graceful shutdown.
 *
 * `worker.close()` waits for jobs already in progress to finish before
 * returning, instead of severing them mid-analysis. A killed job would be
 * retried by BullMQ — repeating a Gemini call that may already have succeeded
 * — so letting it finish is both faster and cheaper.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[worker] ${signal} received, finishing in-flight jobs...`);

  const forceExit = setTimeout(() => {
    console.error('[worker] shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  try {
    await worker.close();
    await disconnectDb();
    await disconnectRedis();
    console.log('[worker] closed cleanly');
    process.exit(0);
  } catch (err) {
    console.error('[worker] error during shutdown:', (err as Error).message);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
