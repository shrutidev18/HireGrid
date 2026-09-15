import Redis from 'ioredis';

import { env } from './env';

/**
 * Redis is used for two unrelated jobs in this project, and they need
 * different connections:
 *
 *   1. **Caching** AI analysis results — ordinary get/set traffic.
 *   2. **BullMQ**, as the job queue's backing store.
 *
 * They cannot share a client. A BullMQ worker issues *blocking* commands
 * (`BRPOPLPUSH` and friends) that occupy a connection until a job arrives, so
 * a cache read on the same client would sit behind them and appear to hang.
 */

/**
 * The client used for caching.
 *
 * `maxRetriesPerRequest` is left at its default here: if Redis is unreachable,
 * a cache read should fail quickly so the caller can carry on without it. A
 * cache is an optimisation, and an unavailable one must not become an outage.
 */
export const redis = new Redis(env.REDIS_URL, {
  // Named so it is obvious which connection is which in `CLIENT LIST` and in
  // Redis's slow log — otherwise every connection looks identical when
  // diagnosing a problem.
  connectionName: 'hiregrid-cache',

  /**
   * Do not open a socket until something actually uses the client.
   *
   * Importing a module should not be what connects to Redis. Without this,
   * anything that transitively imports this file — including a test suite that
   * never touches the cache — opens a connection on import and then hangs
   * waiting for a Redis that may not be running.
   */
  lazyConnect: true,
});

/**
 * Turns ioredis's error events into one readable line instead of a repeating
 * wall of stack traces.
 *
 * ioredis reconnects on a timer, so an unreachable Redis emits an error every
 * couple of seconds, forever. Printed raw, each one is a multi-line
 * `AggregateError` with an IPv6 and an IPv4 attempt inside it — within a minute
 * the terminal holds nothing but stack traces, and the one useful fact ("Redis
 * is not running") is buried.
 *
 * So: say it once, name the cause and the fix, then stay quiet until the
 * situation changes. `ECONNREFUSED` has exactly one meaning in development —
 * nothing is listening — and the stack trace adds nothing, since it only ever
 * points into Node's own socket code.
 *
 * Logged rather than thrown, because an unhandled 'error' event on an ioredis
 * client terminates the process. A Redis blip must not take down the API.
 */
function attachErrorLogging(client: Redis, label: string): void {
  let reportedDown = false;

  client.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'ECONNREFUSED') {
      if (!reportedDown) {
        reportedDown = true;
        console.error(
          `[hiregrid] cannot reach Redis at ${env.REDIS_URL} (${label}). ` +
            'Is it running? Start it with: docker compose up -d',
        );
        console.error('[hiregrid] retrying in the background — this message will not repeat.');
      }
      return;
    }

    console.error(`[hiregrid] redis error (${label}):`, error.message);
  });

  client.on('ready', () => {
    if (reportedDown) {
      reportedDown = false;
      console.log(`[hiregrid] reconnected to Redis (${label})`);
    }
  });
}

attachErrorLogging(redis, 'cache');

/**
 * Creates a connection for BullMQ.
 *
 * `maxRetriesPerRequest: null` is **required** by BullMQ, not a preference —
 * it refuses to start otherwise. The reason is the blocking commands above: a
 * blocking read legitimately waits a long time for a job, and ioredis's
 * default retry limit would abort it as a failure and cause the worker to drop
 * connections in a loop.
 *
 * A factory rather than a single shared instance because the Queue and the
 * Worker each need their own — sharing one would let a blocked worker read
 * stall the producer's writes.
 */
export function createQueueConnection(connectionName: string): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName,
  });

  // Without this, BullMQ's connections emit raw ECONNREFUSED errors every
  // couple of seconds while Redis is down — the worker's terminal fills with
  // stack traces and nothing else.
  attachErrorLogging(connection, connectionName);

  return connection;
}

/** Closes the cache connection during graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  // `quit` on a lazy client that never connected rejects rather than being a
  // no-op, so a process that shut down without ever touching the cache would
  // report a spurious error.
  if (redis.status === 'end' || redis.status === 'wait') return;
  await redis.quit();
}
