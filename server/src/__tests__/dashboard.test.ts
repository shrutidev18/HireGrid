import request from 'supertest';

/**
 * Prisma and Redis are both mocked.
 *
 * The questions this suite asks are about *aggregation logic and cache
 * behaviour*: does every query carry the user's id, does an empty status still
 * appear in the funnel, is a quiet week a gap rather than a zero, are skills
 * tallied case-insensitively, and — the one most likely to break silently —
 * does every write path actually drop the cached payload.
 *
 * None of those need a real database. Mocking is also what makes the cache
 * assertions possible at all: against a live Redis you can only observe that
 * the second request was fast. Here we can assert that Prisma was never
 * touched, which is the fact that matters.
 */
jest.mock('../config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  createQueueConnection: jest.fn(),
  disconnectRedis: jest.fn(),
}));

jest.mock('../queues/analysisQueue', () => ({
  ANALYSIS_QUEUE_NAME: 'analysis-queue',
  enqueueAnalysis: jest.fn(),
  closeAnalysisQueue: jest.fn(),
}));

jest.mock('../config/db', () => ({
  prisma: {
    application: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    analysisResult: { aggregate: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    statusHistory: { findMany: jest.fn(), create: jest.fn() },
    resume: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  disconnectDb: jest.fn(),
}));

import app from '../app';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import { computeDashboard } from '../services/dashboardService';
import { signAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';
import * as applicationsService from '../services/applicationsService';

const db = prisma as unknown as {
  application: {
    count: jest.Mock;
    groupBy: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  analysisResult: { aggregate: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  statusHistory: { findMany: jest.Mock; create: jest.Mock };
  resume: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const cache = redis as unknown as { get: jest.Mock; set: jest.Mock; del: jest.Mock };

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const APP_ID = 'cccccccc-0000-4000-8000-000000000003';
const cookie = [`${AUTH_COOKIE_NAME}=${signAuthToken(USER_ID)}`];

/** A Wednesday, so week boundaries are unambiguous in assertions. */
const NOW = new Date('2026-09-16T12:00:00.000Z');

/** Empty-but-valid responses for every query the dashboard runs. */
function stubEmptyDashboard() {
  db.application.count.mockResolvedValue(0);
  db.application.groupBy.mockResolvedValue([]);
  db.application.findMany.mockResolvedValue([]);
  db.analysisResult.aggregate.mockResolvedValue({ _avg: { matchScore: null } });
  db.analysisResult.findMany.mockResolvedValue([]);
  db.statusHistory.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockResolvedValue(null);
  cache.set.mockResolvedValue('OK');
  cache.del.mockResolvedValue(1);
  stubEmptyDashboard();
});

// ---------------------------------------------------------------------------

describe('GET /api/dashboard', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(401);
    expect(db.application.count).not.toHaveBeenCalled();
  });

  it('returns the whole screen in one payload', async () => {
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'matchScoreTrend',
      'needsAttention',
      'recentActivity',
      'skillGapAggregation',
      'statusFunnel',
      'summary',
    ]);
  });

  it('scopes every query to the requesting user', async () => {
    await request(app).get('/api/dashboard').set('Cookie', cookie);

    // Counts and groupBy filter on userId directly; the analysis queries reach
    // it through the relation. Either way, no query here can see another
    // user's rows.
    for (const call of db.application.count.mock.calls) {
      expect(call[0].where.userId).toBe(USER_ID);
    }
    expect(db.application.groupBy.mock.calls[0][0].where.userId).toBe(USER_ID);
    expect(db.analysisResult.aggregate.mock.calls[0][0].where.application.userId).toBe(
      USER_ID,
    );
    expect(db.statusHistory.findMany.mock.calls[0][0].where.application.userId).toBe(
      USER_ID,
    );
  });
});

describe('dashboard caching', () => {
  it('serves a cached payload without touching the database', async () => {
    const cached = { summary: { totalApplications: 42 } };
    cache.get.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get('/api/dashboard').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalApplications).toBe(42);

    // The whole point of the cache: on a hit, none of the six queries run.
    expect(db.application.count).not.toHaveBeenCalled();
    expect(db.application.groupBy).not.toHaveBeenCalled();
  });

  it('reads from a per-user key', async () => {
    await request(app).get('/api/dashboard').set('Cookie', cookie);

    expect(cache.get).toHaveBeenCalledWith(`dashboard:${USER_ID}`);
  });

  it('stores the computed payload with a 5-minute TTL', async () => {
    await request(app).get('/api/dashboard').set('Cookie', cookie);

    const [key, , mode, ttl] = cache.set.mock.calls[0];

    expect(key).toBe(`dashboard:${USER_ID}`);
    expect(mode).toBe('EX');
    expect(ttl).toBe(300);
  });

  it('still answers when Redis is down', async () => {
    // A cache that can take down the feature it optimises is a liability.
    cache.get.mockRejectedValue(new Error('Connection is closed'));
    cache.set.mockRejectedValue(new Error('Connection is closed'));

    const res = await request(app).get('/api/dashboard').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(db.application.count).toHaveBeenCalled();
  });
});

describe('cache invalidation', () => {
  const invalidationCalls = () => cache.del.mock.calls.map((call) => call[0]);

  it('drops the cache when an application is created', async () => {
    db.application.create.mockResolvedValue({ id: APP_ID, resumeId: null });

    await applicationsService.createApplication(USER_ID, {
      companyName: 'Acme',
      jobTitle: 'Backend Engineer',
      jobLocation: 'Pune',
      employmentType: 'FULL_TIME',
      jobDescription: 'Node and TypeScript.',
      status: 'SAVED',
    } as never);

    expect(invalidationCalls()).toContain(`dashboard:${USER_ID}`);
  });

  it('drops the cache when an application is updated', async () => {
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.update.mockResolvedValue({ id: APP_ID });

    await applicationsService.updateApplication(USER_ID, APP_ID, {
      companyName: 'Acme Renamed',
    });

    expect(invalidationCalls()).toContain(`dashboard:${USER_ID}`);
  });

  it('drops the cache when an application is deleted', async () => {
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.delete.mockResolvedValue({ id: APP_ID });

    await applicationsService.deleteApplication(USER_ID, APP_ID);

    expect(invalidationCalls()).toContain(`dashboard:${USER_ID}`);
  });

  it('drops the cache when a status changes — after the transaction commits', async () => {
    const tx = {
      application: {
        findFirst: jest.fn().mockResolvedValue({ id: APP_ID }),
        update: jest.fn().mockResolvedValue({ id: APP_ID }),
      },
      statusHistory: { create: jest.fn().mockResolvedValue({ id: 'h1' }) },
    };

    db.$transaction.mockImplementation(async (cb: (client: typeof tx) => Promise<unknown>) => {
      // Nothing may be invalidated while the transaction is still open: a
      // rollback would then have cleared the cache for a change that never
      // happened.
      expect(cache.del).not.toHaveBeenCalled();
      return cb(tx);
    });

    await applicationsService.updateApplicationStatus(USER_ID, APP_ID, {
      status: 'OFFER',
      note: null,
    });

    expect(invalidationCalls()).toContain(`dashboard:${USER_ID}`);
  });

  it('does not fail a write when the cache cannot be invalidated', async () => {
    cache.del.mockRejectedValue(new Error('Connection is closed'));
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.delete.mockResolvedValue({ id: APP_ID });

    // The cost of a failed invalidation is a dashboard up to five minutes
    // stale. The cost of letting it throw would be a user unable to delete an
    // application because a cache is down.
    await expect(
      applicationsService.deleteApplication(USER_ID, APP_ID),
    ).resolves.toBeUndefined();
  });
});

describe('summary', () => {
  it('counts active applications as everything not offered or rejected', async () => {
    await computeDashboard(USER_ID, NOW);

    const activeCall = db.application.count.mock.calls[1][0];
    expect(activeCall.where.status).toEqual({ notIn: ['OFFER', 'REJECTED'] });
  });

  it('counts interviews only when something happened in the last 7 days', async () => {
    await computeDashboard(USER_ID, NOW);

    const interviewCall = db.application.count.mock.calls[2][0];

    expect(interviewCall.where.status).toEqual({ in: ['TECH_INTERVIEW', 'HR_INTERVIEW'] });

    // Without the history condition this would count an application that
    // stalled at TECH_INTERVIEW in March as an interview "this week".
    const cutoff = interviewCall.where.statusHistory.some.changedAt.gte as Date;
    expect(NOW.getTime() - cutoff.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('averages only completed analyses, and rounds', async () => {
    db.analysisResult.aggregate.mockResolvedValue({ _avg: { matchScore: 67.4 } });

    const result = await computeDashboard(USER_ID, NOW);

    expect(db.analysisResult.aggregate.mock.calls[0][0].where.status).toBe('COMPLETED');
    expect(result.summary.avgMatchScore).toBe(67);
  });

  it('reports a null average rather than zero when nothing has completed', async () => {
    // 0 would say "your resumes score zero", which is a different and far more
    // alarming statement than "no analysis has finished yet".
    const result = await computeDashboard(USER_ID, NOW);

    expect(result.summary.avgMatchScore).toBeNull();
  });
});

describe('statusFunnel', () => {
  it('includes every status, including the ones at zero', async () => {
    db.application.groupBy.mockResolvedValue([
      { status: 'APPLIED', _count: { _all: 3 } },
      { status: 'OFFER', _count: { _all: 1 } },
    ]);

    const result = await computeDashboard(USER_ID, NOW);

    // groupBy only returns statuses that occur. Charted directly, categories
    // would appear and disappear as data arrived.
    expect(result.statusFunnel).toHaveLength(7);
    expect(result.statusFunnel.map((entry) => entry.status)).toEqual([
      'SAVED',
      'APPLIED',
      'ONLINE_ASSESSMENT',
      'TECH_INTERVIEW',
      'HR_INTERVIEW',
      'OFFER',
      'REJECTED',
    ]);

    expect(result.statusFunnel.find((e) => e.status === 'APPLIED')?.count).toBe(3);
    expect(result.statusFunnel.find((e) => e.status === 'REJECTED')?.count).toBe(0);
  });
});

describe('matchScoreTrend', () => {
  it('returns exactly 8 weekly buckets ending in the current week', async () => {
    const result = await computeDashboard(USER_ID, NOW);

    expect(result.matchScoreTrend).toHaveLength(8);

    // NOW is Wednesday 16 Sept 2026; that week starts Monday the 14th.
    expect(result.matchScoreTrend[7]!.week).toBe('2026-09-14');
    expect(result.matchScoreTrend[0]!.week).toBe('2026-07-27');
  });

  it('averages the scores that fall in a week', async () => {
    db.analysisResult.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-09-15T09:00:00.000Z'), matchScore: 60 },
      { createdAt: new Date('2026-09-16T09:00:00.000Z'), matchScore: 71 },
    ]);

    const result = await computeDashboard(USER_ID, NOW);
    const thisWeek = result.matchScoreTrend.find((p) => p.week === '2026-09-14');

    expect(thisWeek?.avgScore).toBe(66); // (60 + 71) / 2 = 65.5 → 66
  });

  it('reports a quiet week as null, not zero', async () => {
    db.analysisResult.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-09-15T09:00:00.000Z'), matchScore: 80 },
    ]);

    const result = await computeDashboard(USER_ID, NOW);

    // A zero would draw the line crashing to the floor for a week in which
    // simply nothing ran.
    expect(result.matchScoreTrend[0]!.avgScore).toBeNull();
    expect(result.matchScoreTrend[7]!.avgScore).toBe(80);
  });
});

describe('skillGapAggregation', () => {
  it('tallies missing skills case-insensitively', async () => {
    db.analysisResult.findMany
      .mockResolvedValueOnce([]) // trend query
      .mockResolvedValueOnce([
        { missingSkills: ['Docker', 'Kubernetes'] },
        { missingSkills: ['docker', 'GraphQL'] },
        { missingSkills: ['DOCKER'] },
      ]);

    const result = await computeDashboard(USER_ID, NOW);

    // Counted literally these would be three separate skills with one mention
    // each, and the biggest real gap would never reach the top of the chart.
    expect(result.skillGapAggregation[0]).toEqual({ skill: 'Docker', count: 3 });
  });

  it('displays the casing the model used most often', async () => {
    db.analysisResult.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { missingSkills: ['kubernetes'] },
        { missingSkills: ['Kubernetes'] },
        { missingSkills: ['Kubernetes'] },
      ]);

    const result = await computeDashboard(USER_ID, NOW);

    expect(result.skillGapAggregation[0]!.skill).toBe('Kubernetes');
  });

  it('returns at most 10, highest first', async () => {
    const analyses = Array.from({ length: 15 }, (_, i) => ({
      missingSkills: Array.from({ length: 15 - i }, () => `skill-${i}`),
    }));

    db.analysisResult.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(analyses);

    const result = await computeDashboard(USER_ID, NOW);

    expect(result.skillGapAggregation).toHaveLength(10);
    expect(result.skillGapAggregation[0]!.count).toBe(15);

    const counts = result.skillGapAggregation.map((entry) => entry.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('ignores blank entries', async () => {
    db.analysisResult.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ missingSkills: ['', '   ', 'Redis'] }]);

    const result = await computeDashboard(USER_ID, NOW);

    expect(result.skillGapAggregation).toEqual([{ skill: 'Redis', count: 1 }]);
  });
});

describe('needsAttention', () => {
  it('asks for applied applications with no history inside 10 days', async () => {
    await computeDashboard(USER_ID, NOW);

    const where = db.application.findMany.mock.calls[0][0].where;

    expect(where.status).toBe('APPLIED');

    // `none` rather than fetching each application's history and filtering in
    // code, which would be one query per application.
    const cutoff = where.statusHistory.none.changedAt.gte as Date;
    expect(NOW.getTime() - cutoff.getTime()).toBe(10 * 24 * 60 * 60 * 1000);
  });

  it('measures days since the most recent history entry', async () => {
    db.application.findMany.mockResolvedValueOnce([
      {
        id: APP_ID,
        companyName: 'Acme',
        jobTitle: 'Backend Engineer',
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        statusHistory: [{ changedAt: new Date('2026-09-02T12:00:00.000Z') }],
      },
    ]);

    const result = await computeDashboard(USER_ID, NOW);

    expect(result.needsAttention[0]).toEqual({
      id: APP_ID,
      companyName: 'Acme',
      jobTitle: 'Backend Engineer',
      daysSinceLastUpdate: 14,
    });
  });

  it('falls back to updatedAt when an application has no history rows', async () => {
    db.application.findMany.mockResolvedValueOnce([
      {
        id: APP_ID,
        companyName: 'Acme',
        jobTitle: 'Backend Engineer',
        updatedAt: new Date('2026-09-06T12:00:00.000Z'),
        statusHistory: [],
      },
    ]);

    const result = await computeDashboard(USER_ID, NOW);

    expect(result.needsAttention[0]!.daysSinceLastUpdate).toBe(10);
  });
});

describe('recentActivity', () => {
  it('takes the 5 newest changes with their application', async () => {
    db.statusHistory.findMany.mockResolvedValue([
      {
        id: 'h1',
        status: 'OFFER',
        note: 'Verbal offer',
        changedAt: new Date('2026-09-15T10:00:00.000Z'),
        application: { id: APP_ID, companyName: 'Acme', jobTitle: 'Backend Engineer' },
      },
    ]);

    const result = await computeDashboard(USER_ID, NOW);

    const args = db.statusHistory.findMany.mock.calls[0][0];
    expect(args.take).toBe(5);
    expect(args.orderBy).toEqual({ changedAt: 'desc' });

    expect(result.recentActivity[0]).toMatchObject({
      applicationId: APP_ID,
      companyName: 'Acme',
      status: 'OFFER',
      note: 'Verbal offer',
    });
  });
});
