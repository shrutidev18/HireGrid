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
