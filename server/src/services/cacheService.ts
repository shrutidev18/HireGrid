import { redis } from '../config/redis';
import { analysisResponseSchema, type AnalysisResponse } from '../utils/validators';

/**
 * Redis caching for AI analysis results.
 *
 * The rule this exists to enforce: **never call Gemini without checking here
 * first.** An analysis of the same resume against the same job description is
 * the same question, and asking twice costs a second or two of latency, a slice
 * of the free-tier quota, and — at any scale — money.
 */

/**
 * Namespaced so analysis entries are distinguishable from anything else stored
 * in the same Redis instance, which BullMQ is also using. Without a prefix,
 * `KEYS *` during debugging is unreadable and a careless `FLUSHDB` is
 * indiscriminate.
 */
const CACHE_PREFIX = 'hiregrid:analysis:';

/**
 * 30 days.
 *
 * The inputs are immutable — the key is a hash of the exact text — so a cached
 * answer can never become *wrong*. The expiry is not about correctness; it is
 * about not retaining data forever for analyses nobody will ask for again, and
 * about eventually picking up improvements from a newer model.
 */
export const ANALYSIS_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

function cacheKey(hashKey: string): string {
  return `${CACHE_PREFIX}${hashKey}`;
}

/**
 * Reads a cached analysis, or null if there is none.
 *
 * Never throws. Redis being unavailable, or holding something unparseable,
 * must not fail the job — it should fall through to a fresh AI call. A cache
 * is an optimisation, and an optimisation that can take down the feature it
 * optimises is a liability.
 *
 * The cached value is re-validated against the same Zod schema as a fresh
 * response. It was valid when written, but the schema may have changed since,
 * and an entry written by an older version of the code should be treated as a
 * miss rather than trusted on the strength of where it came from.
 */
export async function getCachedAnalysis(hashKey: string): Promise<AnalysisResponse | null> {
  try {
    const raw = await redis.get(cacheKey(hashKey));
    if (!raw) return null;

    const parsed = analysisResponseSchema.safeParse(JSON.parse(raw) as unknown);

    if (!parsed.success) {
      console.warn('[hiregrid] discarding cached analysis that no longer matches the schema');
      return null;
    }

    return parsed.data;
  } catch (err) {
    console.error(
      '[hiregrid] cache read failed, falling back to a fresh analysis:',
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Stores an analysis.
 *
 * Also never throws: a failed write means the next identical request costs an
 * AI call, which is a slower correct answer rather than an error.
 */
export async function setCachedAnalysis(
  hashKey: string,
  data: AnalysisResponse,
  ttlSeconds: number = ANALYSIS_CACHE_TTL_SECONDS,
): Promise<void> {
  try {
    // SET with EX in one command, rather than SET followed by EXPIRE. Two
    // commands leave a window where a crash between them would store the entry
    // with no expiry at all — a slow leak that only shows up months later.
    await redis.set(cacheKey(hashKey), JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    console.error('[hiregrid] cache write failed:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * The dashboard cache is a different kind of cache from the one above, and the
 * difference decides everything about how it is handled.
 *
 * The analysis cache is keyed by a hash of immutable inputs, so an entry can
 * never become wrong — only stale in the sense of "computed by an older
 * model". The dashboard is keyed by *user*, and every number in it changes the
 * moment that user touches an application. It can absolutely become wrong, so
 * it has both a short TTL and explicit invalidation on every write.
 */
const DASHBOARD_PREFIX = 'dashboard:';

/**
 * Five minutes.
 *
 * This is the backstop, not the mechanism. Every mutation deletes the key
 * outright, so in normal operation the cache is never stale at all. The TTL
 * exists for the paths invalidation cannot see — a row changed by a migration,
 * by Prisma Studio, or by a future service that forgets to call the
 * invalidator. Five minutes bounds how wrong the screen can get when that
 * happens, without making the cache pointless.
 */
export const DASHBOARD_CACHE_TTL_SECONDS = 5 * 60;

function dashboardKey(userId: string): string {
  return `${DASHBOARD_PREFIX}${userId}`;
}

/**
 * Reads a cached dashboard payload.
 *
 * Returns `unknown` deliberately: this module's job is to move bytes in and
 * out of Redis, not to vouch for their shape. The caller owns the type.
 *
 * Never throws, for the same reason as the analysis cache — Redis being down
 * should make the dashboard slower, not broken.
 */
export async function getCachedDashboard(userId: string): Promise<unknown | null> {
  try {
    const raw = await redis.get(dashboardKey(userId));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch (err) {
    console.error(
      '[hiregrid] dashboard cache read failed, recomputing:',
      (err as Error).message,
    );
    return null;
  }
}

/** Stores a dashboard payload with the 5-minute TTL. */
export async function setCachedDashboard(userId: string, payload: unknown): Promise<void> {
  try {
    await redis.set(
      dashboardKey(userId),
      JSON.stringify(payload),
      'EX',
      DASHBOARD_CACHE_TTL_SECONDS,
    );
  } catch (err) {
    console.error('[hiregrid] dashboard cache write failed:', (err as Error).message);
  }
}

/**
 * Drops one user's cached dashboard.
 *
 * Called from every path that changes something the dashboard counts. It is
 * deliberately a *delete* rather than a recompute-and-store: recomputing on
 * write would run six queries on every status change, most of them for a
 * dashboard nobody is about to look at. Deleting costs one Redis command and
 * moves the work to the next person who actually opens the page.
 *
 * Swallows its own errors, and that is the important part. An application must
 * still save when Redis is unavailable. The cost of a failed invalidation is a
 * dashboard that is up to five minutes stale; the cost of letting it throw
 * would be a user unable to update a status because a *cache* is down.
 */
export async function invalidateDashboard(userId: string): Promise<void> {
  try {
    await redis.del(dashboardKey(userId));
  } catch (err) {
    console.error(
      `[hiregrid] could not invalidate dashboard cache for ${userId}:`,
      (err as Error).message,
    );
  }
}
