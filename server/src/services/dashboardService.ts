import { prisma } from '../config/db';
import { getCachedDashboard, setCachedDashboard } from './cacheService';
import { APPLICATION_STATUSES, type ApplicationStatusValue } from '../utils/validators';

/**
 * Everything the dashboard shows, computed in one place and returned in one
 * payload.
 *
 * One endpoint rather than one per widget. Six endpoints would mean six round
 * trips, six auth checks and six chances for the screen to show numbers from
 * six slightly different moments — a funnel that sums to 24 next to a total
 * that says 25, because an application was created between two of the
 * requests. One request means one consistent snapshot.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  totalApplications: number;
  activeApplications: number;
  interviewsThisWeek: number;
  avgMatchScore: number | null;
  offersReceived: number;
}

export interface StatusFunnelEntry {
  status: ApplicationStatusValue;
  count: number;
}

export interface MatchScoreTrendPoint {
  /** ISO date of the Monday that starts the week, e.g. "2026-09-14". */
  week: string;
  /** Null when no analysis completed that week — a gap, not a zero. */
  avgScore: number | null;
}

export interface SkillGapEntry {
  skill: string;
  count: number;
}

export interface NeedsAttentionEntry {
  id: string;
  companyName: string;
  jobTitle: string;
  daysSinceLastUpdate: number;
}

export interface RecentActivityEntry {
  id: string;
  applicationId: string;
  companyName: string;
  jobTitle: string;
  status: ApplicationStatusValue;
  note: string | null;
  changedAt: Date;
}

export interface DashboardPayload {
  summary: DashboardSummary;
  statusFunnel: StatusFunnelEntry[];
  matchScoreTrend: MatchScoreTrendPoint[];
  skillGapAggregation: SkillGapEntry[];
  needsAttention: NeedsAttentionEntry[];
  recentActivity: RecentActivityEntry[];
}

/** Exactly what the needs-attention query selects. */
interface StaleApplicationRow {
  id: string;
  companyName: string;
  jobTitle: string;
  updatedAt: Date;
  statusHistory: Array<{ changedAt: Date }>;
}

/** Exactly what the recent-activity query selects. */
interface ActivityRow {
  id: string;
  status: ApplicationStatusValue;
  note: string | null;
  changedAt: Date;
  application: { id: string; companyName: string; jobTitle: string };
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that mean the application is no longer in play. */
const TERMINAL_STATUSES: ApplicationStatusValue[] = ['OFFER', 'REJECTED'];

/** Statuses that count as "interviewing". */
const INTERVIEW_STATUSES: ApplicationStatusValue[] = ['TECH_INTERVIEW', 'HR_INTERVIEW'];

const TREND_WEEKS = 8;
const NEEDS_ATTENTION_DAYS = 10;
const RECENT_ACTIVITY_LIMIT = 5;
const SKILL_GAP_LIMIT = 10;

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * The Monday that starts the week a date falls in, at midnight.
 *
 * Monday rather than Sunday because a job search runs on working weeks, and
 * because grouping Sunday with the week *ahead* of it puts a weekend's
 * activity in a bucket that has otherwise not happened yet.
 */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  // getDay(): 0 = Sunday. Shifting Sunday back by 6 rather than 0 is what
  // makes Monday the first day instead of the last.
  const dayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - dayOffset);

  return result;
}

/** `YYYY-MM-DD` in local time — `toISOString()` would shift the date in any
 * timezone behind UTC, putting Monday's bucket on the previous Sunday. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Builds the funnel with **every** status present, including the ones at zero.
 *
 * `groupBy` only returns statuses that occur, so a user with nothing rejected
 * gets no REJECTED row. Charted directly, the bars would silently change
 * meaning as data arrived — a category appearing mid-week looks like a bug and
 * makes two screenshots incomparable. Filling the gaps keeps the axis fixed.
 */
function buildStatusFunnel(
  grouped: Array<{ status: ApplicationStatusValue; _count: { _all: number } }>,
): StatusFunnelEntry[] {
  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));

  return APPLICATION_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

/**
 * Averages match scores into eight weekly buckets.
 *
 * Grouped in JavaScript rather than SQL because Prisma's `groupBy` cannot
 * group by a truncated date — that needs `date_trunc`, which means `$queryRaw`
 * and a query tied to PostgreSQL. The input here is one user's completed
 * analyses over eight weeks: tens of rows, not thousands. Reading them and
 * bucketing in memory is the same answer, testable without a database, and
 * does not put hand-written SQL in the codebase for the sake of an average.
 * If this were an admin view across every user, the trade would go the other
 * way.
 *
 * Every one of the eight weeks is emitted, including quiet ones, with a null
 * score. Null rather than 0 matters: 0 means "analyses ran and scored zero",
 * which is a different and much more alarming statement than "nothing ran".
 * The chart draws a gap for null and would draw a crash to the floor for 0.
 */
function buildMatchScoreTrend(
  analyses: Array<{ createdAt: Date; matchScore: number | null }>,
  now: Date,
): MatchScoreTrendPoint[] {
  const buckets = new Map<string, number[]>();

  for (const analysis of analyses) {
    if (analysis.matchScore === null) continue;

    const week = isoDate(startOfWeek(analysis.createdAt));
    const scores = buckets.get(week);

    if (scores) {
      scores.push(analysis.matchScore);
    } else {
      buckets.set(week, [analysis.matchScore]);
    }
  }

  const currentWeek = startOfWeek(now);
  const trend: MatchScoreTrendPoint[] = [];

  for (let i = TREND_WEEKS - 1; i >= 0; i -= 1) {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(weekStart.getDate() - i * 7);

    const week = isoDate(weekStart);
    const scores = buckets.get(week);

    trend.push({
      week,
      avgScore: scores
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
    });
  }

  return trend;
}

/**
 * Tallies missing skills across every completed analysis.
 *
 * Counted case-insensitively, displayed in the casing the model used most
 * often. A language model will write "Docker", "docker" and "DOCKER" across
 * three analyses of the same gap; counted literally those are three skills
 * with one mention each, and the one thing the user most needs to learn never
 * reaches the top ten. Folding case is what makes this chart mean anything.
 */
function buildSkillGapAggregation(
  analyses: Array<{ missingSkills: string[] }>,
): SkillGapEntry[] {
  const tally = new Map<string, { count: number; labels: Map<string, number> }>();

  for (const analysis of analyses) {
    for (const raw of analysis.missingSkills) {
      const label = raw.trim();
      if (!label) continue;

      const key = label.toLowerCase();
      const entry = tally.get(key) ?? { count: 0, labels: new Map<string, number>() };

      entry.count += 1;
      entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
      tally.set(key, entry);
    }
  }

  return [...tally.values()]
    .map((entry) => {
      const [label] = [...entry.labels.entries()].sort((a, b) => b[1] - a[1])[0]!;
      return { skill: label, count: entry.count };
    })
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, SKILL_GAP_LIMIT);
}

/**
 * Computes the whole payload.
 *
 * `now` is a parameter rather than being read from the clock inside, so the
 * time-window logic — this week, the last ten days, the last eight weeks — can
 * be tested at a fixed instant instead of against whenever the suite happens
 * to run. Date-dependent code tested against the real clock passes on a
 * Tuesday and fails on a Sunday.
 */
export async function computeDashboard(
  userId: string,
  now: Date = new Date(),
): Promise<DashboardPayload> {
  const weekAgo = daysAgo(7, now);
  const attentionCutoff = daysAgo(NEEDS_ATTENTION_DAYS, now);
  const trendStart = startOfWeek(new Date(now.getTime() - (TREND_WEEKS - 1) * 7 * DAY_MS));

  /**
   * Every query runs concurrently. They are independent reads, so issuing them
   * in sequence would make the endpoint as slow as their sum for no reason.
   *
   * Each one carries `userId` — either directly or through the relation filter
   * `application: { userId }`. There is no query here that could return another
   * user's row.
   */
  const [
    totalApplications,
    activeApplications,
    interviewsThisWeek,
    offersReceived,
    scoreAggregate,
    funnelGroups,
    trendAnalyses,
    skillAnalyses,
    staleApplications,
    activity,
  ] = await Promise.all([
    prisma.application.count({ where: { userId } }),

    prisma.application.count({
      where: { userId, status: { notIn: TERMINAL_STATUSES } },
    }),

    /**
     * "Interviewing, and something happened recently."
     *
     * `statusHistory: { some: ... }` is a relation filter — it becomes an
     * EXISTS subquery rather than loading the history rows. Without the
     * history condition this would count every application sitting at
     * TECH_INTERVIEW forever, including one that stalled in March.
     */
    prisma.application.count({
      where: {
        userId,
        status: { in: INTERVIEW_STATUSES },
        statusHistory: { some: { changedAt: { gte: weekAgo } } },
      },
    }),

    prisma.application.count({ where: { userId, status: 'OFFER' } }),

    prisma.analysisResult.aggregate({
      _avg: { matchScore: true },
      where: { status: 'COMPLETED', application: { userId } },
    }),

    prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    }),

    prisma.analysisResult.findMany({
      where: {
        status: 'COMPLETED',
        application: { userId },
        createdAt: { gte: trendStart },
      },
      select: { createdAt: true, matchScore: true },
    }),

    prisma.analysisResult.findMany({
      where: { status: 'COMPLETED', application: { userId } },
      select: { missingSkills: true },
    }),

    /**
     * Applied, and nothing has happened for ten days.
     *
     * `none` rather than `some` with a negation: "has no history entry newer
     * than the cutoff" is one EXISTS check the database can answer, where
     * fetching each application's history and filtering in code would be N+1
     * queries to reach the same conclusion.
     *
     * The single history row loaded alongside is the most recent one, which is
     * what "days since last update" is measured from.
     */
    prisma.application.findMany({
      where: {
        userId,
        status: 'APPLIED',
        statusHistory: { none: { changedAt: { gte: attentionCutoff } } },
      },
      select: {
        id: true,
        companyName: true,
        jobTitle: true,
        updatedAt: true,
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 1,
          select: { changedAt: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    }),

    prisma.statusHistory.findMany({
      where: { application: { userId } },
      orderBy: { changedAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        status: true,
        note: true,
        changedAt: true,
        application: { select: { id: true, companyName: true, jobTitle: true } },
      },
    }),
  ]);

  const avgMatchScore = scoreAggregate._avg.matchScore;

  return {
    summary: {
      totalApplications,
      activeApplications,
      interviewsThisWeek,
      // Rounded here rather than in the component. A score is a whole number
      // everywhere else in the product, and sending 67.33333333333333 invites
      // each consumer to round it differently.
      avgMatchScore: avgMatchScore === null ? null : Math.round(avgMatchScore),
      offersReceived,
    },

    statusFunnel: buildStatusFunnel(funnelGroups),
    matchScoreTrend: buildMatchScoreTrend(trendAnalyses, now),
    skillGapAggregation: buildSkillGapAggregation(skillAnalyses),

    /**
     * The callbacks below annotate their parameter rather than relying on
     * inference. Prisma infers these element types precisely from the `select`
     * — but only where the client has been generated, and this code is also
     * type-checked in an environment where it has not. Writing the shape out
     * is the honest fix: it documents exactly what each query returns, and it
     * still fails to compile if a `select` and its consumer drift apart.
     */
    needsAttention: staleApplications.map((application: StaleApplicationRow) => {
      const lastChange = application.statusHistory[0]?.changedAt ?? application.updatedAt;

      return {
        id: application.id,
        companyName: application.companyName,
        jobTitle: application.jobTitle,
        daysSinceLastUpdate: Math.floor(
          (now.getTime() - new Date(lastChange).getTime()) / DAY_MS,
        ),
      };
    }),

    recentActivity: activity.map((entry: ActivityRow) => ({
      id: entry.id,
      applicationId: entry.application.id,
      companyName: entry.application.companyName,
      jobTitle: entry.application.jobTitle,
      status: entry.status,
      note: entry.note,
      changedAt: entry.changedAt,
    })),
  };
}

/**
 * The dashboard, from cache when possible.
 *
 * Cache-aside: look, compute on a miss, store. The alternative — writing the
 * dashboard on every mutation — would recompute six queries every time a
 * status changed, overwhelmingly for dashboards nobody opens. Computing lazily
 * puts the cost where the demand is.
 */
export async function getDashboard(userId: string): Promise<DashboardPayload> {
  const cached = await getCachedDashboard(userId);

  if (cached) {
    return cached as DashboardPayload;
  }

  const payload = await computeDashboard(userId);

  await setCachedDashboard(userId, payload);

  return payload;
}
