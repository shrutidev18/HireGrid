import type { Job } from 'bullmq';
import request from 'supertest';

/**
 * Redis, the queue, Prisma and Gemini are all mocked here.
 *
 * The questions these tests ask are about *control flow*, and every one of
 * them is a rule the phase specification states explicitly: is the cache
 * always checked before Gemini; does a cache hit really avoid the API call;
 * does a malformed response get exactly one retry and then become FAILED
 * rather than crashing the worker; is every route scoped to the owner.
 *
 * None of those need a real Redis or a real model — and mocking Gemini is the
 * only way to test the malformed-response path at all, since a working model
 * cannot be asked to misbehave on demand.
 */
jest.mock('../config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
  createQueueConnection: jest.fn(),
  disconnectRedis: jest.fn(),
}));

jest.mock('../queues/analysisQueue', () => ({
  ANALYSIS_QUEUE_NAME: 'analysis-queue',
  enqueueAnalysis: jest.fn(),
  closeAnalysisQueue: jest.fn(),
}));

jest.mock('../services/aiService', () => ({ analyzeResumeAgainstJD: jest.fn() }));

jest.mock('../services/cacheService', () => ({
  getCachedAnalysis: jest.fn(),
  setCachedAnalysis: jest.fn(),
  ANALYSIS_CACHE_TTL_SECONDS: 2592000,
}));

jest.mock('../config/db', () => ({
  prisma: {
    application: { findFirst: jest.fn(), create: jest.fn() },
    analysisResult: { findUnique: jest.fn(), upsert: jest.fn() },
    resume: { findFirst: jest.fn() },
  },
  disconnectDb: jest.fn(),
}));

import app from '../app';
import { prisma } from '../config/db';
import { analyzeResumeAgainstJD } from '../services/aiService';
import { getCachedAnalysis, setCachedAnalysis } from '../services/cacheService';
import { enqueueAnalysis } from '../queues/analysisQueue';
import { processAnalysisJob } from '../queues/analysisWorker';
import { analysisCacheKey } from '../utils/hash';
import { AiServiceError, classifyAiError } from '../utils/aiError';
import { signAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';
import type { AnalysisJobData } from '../queues/analysisQueue';

const db = prisma as unknown as {
  application: { findFirst: jest.Mock; create: jest.Mock };
  analysisResult: { findUnique: jest.Mock; upsert: jest.Mock };
  resume: { findFirst: jest.Mock };
};
const callGemini = analyzeResumeAgainstJD as jest.Mock;
const cacheGet = getCachedAnalysis as jest.Mock;
const cacheSet = setCachedAnalysis as jest.Mock;
const enqueue = enqueueAnalysis as jest.Mock;

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const APP_ID = 'cccccccc-0000-4000-8000-000000000003';
const cookie = [`${AUTH_COOKIE_NAME}=${signAuthToken(USER_ID)}`];

const RESUME_TEXT = 'TypeScript, Node.js, PostgreSQL, Express';
const JOB_DESCRIPTION = 'Backend engineer. Node, TypeScript, Docker, Kubernetes.';

/** A well-formed AI response. */
const validAiResponse = {
  requiredSkills: ['Node.js', 'TypeScript', 'Docker'],
  preferredSkills: ['Kubernetes'],
  matchedSkills: ['Node.js', 'TypeScript'],
  missingSkills: ['Docker', 'Kubernetes'],
  matchScore: 68,
  atsKeywords: { present: ['Node.js', 'TypeScript'], missing: ['Docker', 'CI/CD'] },
  suggestions: ['Add a line about containerising a project'],
  reasoning: 'Docker matters here because the team deploys every service as a container.',
};

const job = (data: Partial<AnalysisJobData> = {}) =>
  ({
    id: 'job-1',
    data: {
      applicationId: APP_ID,
      resumeText: RESUME_TEXT,
      jobDescription: JOB_DESCRIPTION,
      ...data,
    },
  }) as Job<AnalysisJobData>;

// ---------------------------------------------------------------------------

describe('analysisCacheKey', () => {
  it('is stable for the same inputs', () => {
    expect(analysisCacheKey(RESUME_TEXT, JOB_DESCRIPTION)).toBe(
      analysisCacheKey(RESUME_TEXT, JOB_DESCRIPTION),
    );
  });

  it('changes when either input changes', () => {
    const base = analysisCacheKey(RESUME_TEXT, JOB_DESCRIPTION);
    expect(analysisCacheKey(`${RESUME_TEXT} Docker`, JOB_DESCRIPTION)).not.toBe(base);
    expect(analysisCacheKey(RESUME_TEXT, `${JOB_DESCRIPTION} Remote.`)).not.toBe(base);
  });

  it('does not collide across the boundary between the two inputs', () => {
    // Without a separator, ("ab","c") and ("a","bc") concatenate identically
    // and would share a cache entry despite being different questions.
    expect(analysisCacheKey('ab', 'c')).not.toBe(analysisCacheKey('a', 'bc'));
  });
});

describe('analysis worker', () => {
  it('uses the cache and does NOT call Gemini on a hit', async () => {
    cacheGet.mockResolvedValue(validAiResponse);

    await processAnalysisJob(job());

    // The rule the whole phase is built around.
    expect(callGemini).not.toHaveBeenCalled();
    // A hit is not rewritten to the cache.
    expect(cacheSet).not.toHaveBeenCalled();

    const written = db.analysisResult.upsert.mock.calls[0][0];
    expect(written.where).toEqual({ applicationId: APP_ID });
    expect(written.update.status).toBe('COMPLETED');
    expect(written.update.matchScore).toBe(68);
  });

  it('checks the cache with a hash of the content, not the application id', async () => {
    cacheGet.mockResolvedValue(validAiResponse);

    await processAnalysisJob(job());

    // Hashing the content is what lets two different applications built from
    // the same posting and resume share one answer.
    expect(cacheGet).toHaveBeenCalledWith(analysisCacheKey(RESUME_TEXT, JOB_DESCRIPTION));
  });

  it('calls Gemini on a miss, caches the result, and marks it COMPLETED', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockResolvedValue(validAiResponse);

    await processAnalysisJob(job());

    expect(callGemini).toHaveBeenCalledTimes(1);
    expect(cacheSet).toHaveBeenCalledWith(
      analysisCacheKey(RESUME_TEXT, JOB_DESCRIPTION),
      validAiResponse,
    );

    const written = db.analysisResult.upsert.mock.calls[0][0].update;
    expect(written.status).toBe('COMPLETED');
    // The nested atsKeywords object is flattened into two database columns.
    expect(written.atsKeywordsPresent).toEqual(['Node.js', 'TypeScript']);
    expect(written.atsKeywordsMissing).toEqual(['Docker', 'CI/CD']);
  });

  it('retries once with a stricter prompt when the response fails validation', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini
      .mockResolvedValueOnce({ matchScore: 'quite good', notTheSchema: true })
      .mockResolvedValueOnce(validAiResponse);

    await processAnalysisJob(job());

    expect(callGemini).toHaveBeenCalledTimes(2);
    // The first attempt is clean; only the retry carries the reminder.
    expect(callGemini.mock.calls[0][2]).toEqual({ stricter: false });
    expect(callGemini.mock.calls[1][2]).toEqual({ stricter: true });
    expect(db.analysisResult.upsert.mock.calls[0][0].update.status).toBe('COMPLETED');
  });

  it('marks FAILED after a second invalid response — and does not throw', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockResolvedValue('I am prose, not JSON');

    // The worker must survive a misbehaving model. A throw here would kill the
    // process and take every queued analysis with it.
    await expect(processAnalysisJob(job())).resolves.toBeUndefined();

    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(cacheSet).not.toHaveBeenCalled(); // never cache a bad answer
    expect(db.analysisResult.upsert.mock.calls[0][0].update).toEqual({ status: 'FAILED' });
  });

  it('marks FAILED when the API call itself keeps throwing', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockRejectedValue(new Error('429 quota exceeded'));

    await expect(processAnalysisJob(job())).resolves.toBeUndefined();

    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(db.analysisResult.upsert.mock.calls[0][0].update).toEqual({ status: 'FAILED' });
  });

  it('rethrows a 503 so the queue can back off — instead of marking FAILED', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockRejectedValue(
      new AiServiceError('503 high demand', 503, true),
    );

    // The job must fail *loudly* so BullMQ retries it with backoff. Swallowing
    // it and recording FAILED would turn a momentary capacity spike into a
    // permanent failure on the user's screen.
    await expect(processAnalysisJob(job())).rejects.toThrow(/high demand/);

    // Only one immediate attempt — retrying in a tight loop would hit the same
    // overloaded model milliseconds later.
    expect(callGemini).toHaveBeenCalledTimes(1);
    // Crucially, the analysis stays PENDING so the UI keeps showing
    // "Analyzing…" while the queue waits.
    expect(db.analysisResult.upsert).not.toHaveBeenCalled();
  });

  it('rethrows a 429 rate limit for the same reason', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockRejectedValue(new AiServiceError('429 rate limited', 429, true));

    await expect(processAnalysisJob(job())).rejects.toThrow(/rate limited/);
    expect(db.analysisResult.upsert).not.toHaveBeenCalled();
  });

  it('does NOT retry a 400 — it fails fast after the stricter retry', async () => {
    cacheGet.mockResolvedValue(null);
    callGemini.mockRejectedValue(new AiServiceError('400 bad request', 400, false));

    // A malformed request will be just as malformed in thirty seconds, so
    // waiting only delays telling the user.
    await expect(processAnalysisJob(job())).resolves.toBeUndefined();
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(db.analysisResult.upsert.mock.calls[0][0].update).toEqual({ status: 'FAILED' });
  });

  it('rejects an out-of-range match score rather than storing it', async () => {
    cacheGet.mockResolvedValue(null);
    // A score of 150 would draw a progress ring past full and skew the
    // dashboard average.
    callGemini.mockResolvedValue({ ...validAiResponse, matchScore: 150 });

    await processAnalysisJob(job());

    expect(db.analysisResult.upsert.mock.calls[0][0].update).toEqual({ status: 'FAILED' });
  });
});

describe('GET /api/applications/:id/analysis', () => {
  it('returns the analysis for an owned application', async () => {
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: { extractedText: RESUME_TEXT },
    });
    db.analysisResult.findUnique.mockResolvedValue({ status: 'COMPLETED', matchScore: 68 });

    const res = await request(app)
      .get(`/api/applications/${APP_ID}/analysis`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.analysis.status).toBe('COMPLETED');
    expect(db.application.findFirst.mock.calls[0][0].where).toEqual({
      id: APP_ID,
      userId: USER_ID,
    });
  });

  it('returns null — not 404 — when no analysis has been requested', async () => {
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: null,
    });
    db.analysisResult.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/applications/${APP_ID}/analysis`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.analysis).toBeNull();
  });

  it("returns 404 for another user's application", async () => {
    db.application.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/applications/${APP_ID}/analysis`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(db.analysisResult.findUnique).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/api/applications/${APP_ID}/analysis`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/applications/:id/reanalyze', () => {
  it('resets the result to PENDING and queues a job', async () => {
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: { extractedText: RESUME_TEXT },
    });

    const res = await request(app)
      .post(`/api/applications/${APP_ID}/reanalyze`)
      .set('Cookie', cookie);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'PENDING' });

    // Old values are cleared, so the UI cannot show a stale score next to a
    // spinner claiming to be working on it.
    const update = db.analysisResult.upsert.mock.calls[0][0].update;
    expect(update.status).toBe('PENDING');
    expect(update.matchScore).toBeNull();
    expect(update.missingSkills).toEqual([]);

    expect(enqueue).toHaveBeenCalledWith({
      applicationId: APP_ID,
      resumeText: RESUME_TEXT,
      jobDescription: JOB_DESCRIPTION,
    });
  });

  it('refuses when the application has no resume attached', async () => {
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: null,
    });

    const res = await request(app)
      .post(`/api/applications/${APP_ID}/reanalyze`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/attach a resume/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's application", async () => {
    db.application.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/applications/${APP_ID}/reanalyze`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('analysis is triggered when an application is created', () => {
  const body = {
    companyName: 'Acme Corp',
    jobTitle: 'Backend Intern',
    jobLocation: 'Bengaluru',
    employmentType: 'INTERNSHIP',
    jobDescription: JOB_DESCRIPTION,
  };

  it('queues an analysis when the application has both a resume and a JD', async () => {
    const resumeId = 'eeeeeeee-0000-4000-8000-000000000005';
    db.resume.findFirst.mockResolvedValue({ id: resumeId });
    db.application.create.mockResolvedValue({
      id: APP_ID,
      resumeId,
      jobDescription: JOB_DESCRIPTION,
      statusHistory: [],
    });
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: { extractedText: RESUME_TEXT },
    });

    const res = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...body, resumeId });

    expect(res.status).toBe(201);
    // The PENDING row exists before the response returns, so the client's
    // first poll finds "starting" rather than "nothing here".
    expect(db.analysisResult.upsert.mock.calls[0][0].update.status).toBe('PENDING');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not queue an analysis when no resume is attached', async () => {
    db.application.create.mockResolvedValue({
      id: APP_ID,
      resumeId: null,
      jobDescription: JOB_DESCRIPTION,
      statusHistory: [],
    });

    const res = await request(app).post('/api/applications').set('Cookie', cookie).send(body);

    expect(res.status).toBe(201);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('still creates the application when queueing fails', async () => {
    const resumeId = 'eeeeeeee-0000-4000-8000-000000000005';
    db.resume.findFirst.mockResolvedValue({ id: resumeId });
    db.application.create.mockResolvedValue({
      id: APP_ID,
      resumeId,
      jobDescription: JOB_DESCRIPTION,
      statusHistory: [],
    });
    db.application.findFirst.mockResolvedValue({
      id: APP_ID,
      jobDescription: JOB_DESCRIPTION,
      resume: { extractedText: RESUME_TEXT },
    });
    enqueue.mockRejectedValue(new Error('Redis is down'));

    const res = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...body, resumeId });

    // A queue outage must not stop the core feature of the product working.
    // The analysis is an enhancement the user can retry from the details page.
    expect(res.status).toBe(201);
  });
});


describe('classifyAiError', () => {
  it('reads the status out of the SDK\'s JSON-in-a-message errors', () => {
    // This is the shape Gemini actually produced in practice.
    const raw = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    );

    const classified = classifyAiError(raw);
    expect(classified.status).toBe(503);
    expect(classified.retryable).toBe(true);
  });

  it('reads a plain status property too', () => {
    expect(classifyAiError(Object.assign(new Error('nope'), { status: 429 })).retryable).toBe(
      true,
    );
  });

  it.each([400, 401, 403, 404])('treats %i as not retryable', (status) => {
    expect(classifyAiError(Object.assign(new Error('bad'), { status })).retryable).toBe(false);
  });

  it.each([429, 500, 502, 503, 504])('treats %i as retryable', (status) => {
    expect(classifyAiError(Object.assign(new Error('busy'), { status })).retryable).toBe(true);
  });

  it('treats a network fault or an abort as retryable', () => {
    expect(classifyAiError(new Error('fetch failed')).retryable).toBe(true);
    expect(classifyAiError(Object.assign(new Error('aborted'), { name: 'AbortError' })).retryable).toBe(
      true,
    );
  });

  it('treats a plain Error carrying the abort message as retryable', () => {
    // The regression this locks in. The SDK re-wraps the DOMException thrown
    // by our AbortController, so what actually reaches this function is a
    // plain Error with name "Error" — no status, no AbortError name, nothing
    // but the message. Classified as permanent (as it was), a single slow
    // response killed the analysis instead of being retried.
    const wrapped = new Error('This operation was aborted');
    expect(wrapped.name).toBe('Error');

    const classified = classifyAiError(wrapped);
    expect(classified.status).toBeUndefined();
    expect(classified.retryable).toBe(true);
  });

  it('classifies a non-Error throwable without losing its message', () => {
    // A DOMException does not reliably pass `instanceof Error` across Node
    // versions. Reading the properties directly keeps the message — and a
    // message is the only thing left to classify on when there is no status.
    const domLike = { name: 'AbortError', message: 'This operation was aborted' };

    const classified = classifyAiError(domLike);
    expect(classified.message).toBe('This operation was aborted');
    expect(classified.retryable).toBe(true);
  });

  it('ignores a non-HTTP numeric code (the DOMException abort trap)', () => {
    // A DOMException carries a legacy numeric `code` — 20 for an abort. Read
    // as an HTTP status it is not in the retryable set, so every timeout was
    // being classified as a permanent failure. Only 100–599 counts.
    const abortLike = { name: 'AbortError', code: 20, message: 'This operation was aborted' };

    const classified = classifyAiError(abortLike);
    expect(classified.status).toBeUndefined();
    expect(classified.retryable).toBe(true);
  });

  it('ignores a string error code without mistaking it for a status', () => {
    const socketError = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });

    expect(classifyAiError(socketError).status).toBeUndefined();
    expect(classifyAiError(socketError).retryable).toBe(true);
  });

  it('treats an unrecognised error as NOT retryable', () => {
    // Fail fast by default: retrying something we do not understand burns
    // quota for an outcome we cannot predict.
    expect(classifyAiError(new Error('something odd')).retryable).toBe(false);
  });
});
