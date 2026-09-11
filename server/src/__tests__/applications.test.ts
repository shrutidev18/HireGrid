import request from 'supertest';

/**
 * As in the auth suite, the Prisma client is mocked rather than connected to.
 *
 * The questions these tests ask are about *authorisation and orchestration* —
 * is every query scoped by userId, does a status change write history in a
 * transaction, does the update path refuse to touch status, does another
 * user's id return 404 rather than 403. None of those are questions about SQL.
 *
 * The mock also makes the important assertions possible at all: with a real
 * database you can only observe that a foreign user's request returned 404.
 * Here we can assert the far stronger fact that `userId` was actually part of
 * the WHERE clause — which is what makes the 404 correct rather than lucky.
 */
const tx = {
  application: { findFirst: jest.fn(), update: jest.fn() },
  statusHistory: { create: jest.fn() },
};

jest.mock('../config/db', () => ({
  prisma: {
    application: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    statusHistory: { create: jest.fn() },
    resume: { findFirst: jest.fn() },
    // An interactive transaction, simulated: run the callback with a client
    // whose calls we can inspect.
    $transaction: jest.fn(),
  },
  disconnectDb: jest.fn(),
}));

import app from '../app';
import { prisma } from '../config/db';
import { signAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';

const db = prisma as unknown as {
  application: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  statusHistory: { create: jest.Mock };
  resume: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const APP_ID = 'cccccccc-0000-4000-8000-000000000003';

/** A real, correctly-signed cookie for USER_ID. */
const cookie = [`${AUTH_COOKIE_NAME}=${signAuthToken(USER_ID)}`];

const validBody = {
  companyName: 'Acme Corp',
  jobTitle: 'Backend Intern',
  jobLocation: 'Bengaluru',
  employmentType: 'INTERNSHIP',
  workMode: 'HYBRID',
  jobDescription: 'Build APIs in Node and TypeScript.',
};

const savedApplication = {
  id: APP_ID,
  userId: USER_ID,
  ...validBody,
  status: 'SAVED',
  statusHistory: [{ id: 'h1', applicationId: APP_ID, status: 'SAVED', note: 'Application created' }],
  analysisResult: null,
  resume: null,
};

beforeEach(() => {
  db.$transaction.mockImplementation(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx));
  tx.application.findFirst.mockReset();
  tx.application.update.mockReset();
  tx.statusHistory.create.mockReset();
});

// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('rejects every application route without a valid cookie', async () => {
    // Listed explicitly rather than indexed by a method-name string, so the
    // calls are type-checked like any other.
    const calls: Array<[string, () => request.Test]> = [
      ['GET /api/applications', () => request(app).get('/api/applications')],
      ['POST /api/applications', () => request(app).post('/api/applications')],
      ['GET /api/applications/:id', () => request(app).get(`/api/applications/${APP_ID}`)],
      ['PUT /api/applications/:id', () => request(app).put(`/api/applications/${APP_ID}`)],
      [
        'PATCH /api/applications/:id/status',
        () => request(app).patch(`/api/applications/${APP_ID}/status`),
      ],
      ['DELETE /api/applications/:id', () => request(app).delete(`/api/applications/${APP_ID}`)],
    ];

    for (const [label, call] of calls) {
      const res = await call();
      expect([label, res.status]).toEqual([label, 401]);
      expect(res.body).toEqual({ error: 'Unauthorized', statusCode: 401 });
    }
  });
});

describe('POST /api/applications', () => {
  it('creates the application and its first status-history row together', async () => {
    db.application.create.mockResolvedValue(savedApplication);

    const res = await request(app).post('/api/applications').set('Cookie', cookie).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.application.id).toBe(APP_ID);

    const args = db.application.create.mock.calls[0][0];

    // The row is stamped with the id from the token, never from the body.
    expect(args.data.userId).toBe(USER_ID);

    // The history row is created as a *nested write*, which Prisma runs in the
    // same transaction as the application itself. Two separate create calls
    // could leave an application with no history if the second one failed.
    expect(args.data.statusHistory.create).toEqual({
      status: 'SAVED',
      note: 'Application created',
    });
  });

  it('ignores a userId supplied in the request body', async () => {
    db.application.create.mockResolvedValue(savedApplication);

    await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...validBody, userId: OTHER_USER_ID });

    // Zod strips unknown keys, so the attacker-supplied userId never reaches
    // Prisma — the one from the verified token is used instead.
    expect(db.application.create.mock.calls[0][0].data.userId).toBe(USER_ID);
  });

  it('defaults status to SAVED when none is given', async () => {
    db.application.create.mockResolvedValue(savedApplication);

    await request(app).post('/api/applications').set('Cookie', cookie).send(validBody);

    expect(db.application.create.mock.calls[0][0].data.status).toBe('SAVED');
  });

  it('accepts an explicit status and starts the history at that stage', async () => {
    db.application.create.mockResolvedValue({ ...savedApplication, status: 'APPLIED' });

    await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...validBody, status: 'APPLIED' });

    const args = db.application.create.mock.calls[0][0];
    expect(args.data.status).toBe('APPLIED');
    expect(args.data.statusHistory.create.status).toBe('APPLIED');
  });

  it('rejects a missing required field with a field-level 400', async () => {
    const { companyName: _omitted, ...withoutCompany } = validBody;

    const res = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send(withoutCompany);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/company/i);
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid enum value with 400', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...validBody, employmentType: 'CONTRACT' });

    expect(res.status).toBe(400);
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it('refuses a resume belonging to another user', async () => {
    db.resume.findFirst.mockResolvedValue(null); // not found *for this user*

    const res = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .send({ ...validBody, resumeId: 'dddddddd-0000-4000-8000-000000000004' });

    expect(res.status).toBe(400);
    // The ownership rule applies to every id the client sends, not just the
    // application's own.
    expect(db.resume.findFirst.mock.calls[0][0].where.userId).toBe(USER_ID);
    expect(db.application.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/applications/:id', () => {
  it('returns the application with history and analysis', async () => {
    db.application.findFirst.mockResolvedValue(savedApplication);

    const res = await request(app).get(`/api/applications/${APP_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.application.statusHistory).toHaveLength(1);

    const args = db.application.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: APP_ID, userId: USER_ID });
    // History arrives in chronological order; the client reverses it for
    // display, which is presentation, not data.
    expect(args.include.statusHistory.orderBy).toEqual({ changedAt: 'asc' });
  });

  it("returns 404 — not 403 — for another user's application", async () => {
    // The row exists in the database, but not for this user, so the scoped
    // query finds nothing.
    db.application.findFirst.mockResolvedValue(null);

    const res = await request(app).get(`/api/applications/${APP_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Application not found', statusCode: 404 });

    // The assertion that actually matters: userId was part of the query, so
    // the 404 is enforced by the database filter rather than by a check that
    // could be forgotten.
    expect(db.application.findFirst.mock.calls[0][0].where.userId).toBe(USER_ID);
  });

  it('rejects a malformed id with 400 before querying', async () => {
    const res = await request(app).get('/api/applications/not-a-uuid').set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(db.application.findFirst).not.toHaveBeenCalled();
  });
});

describe('PUT /api/applications/:id', () => {
  it('updates editable fields', async () => {
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.update.mockResolvedValue({ ...savedApplication, notes: 'Referred by Priya' });

    const res = await request(app)
      .put(`/api/applications/${APP_ID}`)
      .set('Cookie', cookie)
      .send({ notes: 'Referred by Priya' });

    expect(res.status).toBe(200);
    expect(db.application.update.mock.calls[0][0].data.notes).toBe('Referred by Priya');
  });

  it('cannot change status — the field is stripped, history stays intact', async () => {
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.update.mockResolvedValue(savedApplication);

    await request(app)
      .put(`/api/applications/${APP_ID}`)
      .set('Cookie', cookie)
      .send({ notes: 'sneaky', status: 'OFFER' });

    // This is the invariant the whole timeline depends on: a status can only
    // move through the endpoint that also records the change.
    expect(db.application.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(db.statusHistory.create).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's application and never updates", async () => {
    db.application.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/applications/${APP_ID}`)
      .set('Cookie', cookie)
      .send({ notes: 'nice try' });

    expect(res.status).toBe(404);
    expect(db.application.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/applications/:id/status', () => {
  it('updates the status and appends a history row in one transaction', async () => {
    tx.application.findFirst.mockResolvedValue({ id: APP_ID });
    tx.application.update.mockResolvedValue({ ...savedApplication, status: 'APPLIED' });
    tx.statusHistory.create.mockResolvedValue({
      id: 'h2',
      applicationId: APP_ID,
      status: 'APPLIED',
      note: 'Submitted on the portal',
    });

    const res = await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'APPLIED', note: 'Submitted on the portal' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('APPLIED');
    expect(res.body.statusHistory.status).toBe('APPLIED');

    // Both writes went through $transaction, so they commit together or not at
    // all. An application showing a stage its timeline has no record of is not
    // a state this can reach.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.application.update.mock.calls[0][0].data).toEqual({ status: 'APPLIED' });
    expect(tx.statusHistory.create.mock.calls[0][0].data).toEqual({
      applicationId: APP_ID,
      status: 'APPLIED',
      note: 'Submitted on the portal',
    });
  });

  it('writes the history row before re-reading the application', async () => {
    tx.application.findFirst.mockResolvedValue({ id: APP_ID });
    tx.application.update.mockResolvedValue({ ...savedApplication, status: 'APPLIED' });
    tx.statusHistory.create.mockResolvedValue({ id: 'h2', status: 'APPLIED' });

    await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'APPLIED' });

    // Ordering regression test. The update re-reads the application with its
    // statusHistory included, so the new row must already exist — otherwise
    // the response carries a timeline that is one entry behind the status it
    // reports, and the client caches that stale pairing.
    expect(tx.statusHistory.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.application.update.mock.invocationCallOrder[0] as number,
    );
  });

  it('records a history row even with no note', async () => {
    tx.application.findFirst.mockResolvedValue({ id: APP_ID });
    tx.application.update.mockResolvedValue({ ...savedApplication, status: 'OFFER' });
    tx.statusHistory.create.mockResolvedValue({ id: 'h3', status: 'OFFER', note: null });

    const res = await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'OFFER' });

    expect(res.status).toBe(200);
    expect(tx.statusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('allows REJECTED from any stage', async () => {
    tx.application.findFirst.mockResolvedValue({ id: APP_ID });
    tx.application.update.mockResolvedValue({ ...savedApplication, status: 'REJECTED' });
    tx.statusHistory.create.mockResolvedValue({ id: 'h4', status: 'REJECTED' });

    const res = await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'REJECTED' });

    expect(res.status).toBe(200);
  });

  it('rejects a status outside the enum with 400', async () => {
    const res = await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'GHOSTED' });

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's application and writes nothing", async () => {
    tx.application.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/applications/${APP_ID}/status`)
      .set('Cookie', cookie)
      .send({ status: 'APPLIED' });

    expect(res.status).toBe(404);
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(tx.statusHistory.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/applications/:id', () => {
  it('deletes the application and lets the database cascade the children', async () => {
    db.application.findFirst.mockResolvedValue({ id: APP_ID });
    db.application.delete.mockResolvedValue(savedApplication);

    const res = await request(app).delete(`/api/applications/${APP_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(db.application.delete).toHaveBeenCalledWith({ where: { id: APP_ID } });

    // StatusHistory and AnalysisResult are removed by the onDelete: Cascade
    // rules in schema.prisma, enforced by PostgreSQL. Deleting them here as
    // well would put the rule in two places and give it a chance to disagree
    // with itself.
    expect(db.statusHistory.create).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's application and deletes nothing", async () => {
    db.application.findFirst.mockResolvedValue(null);

    const res = await request(app).delete(`/api/applications/${APP_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(db.application.delete).not.toHaveBeenCalled();
  });
});

describe('GET /api/applications', () => {
  it('lists only the requesting user’s applications', async () => {
    db.application.findMany.mockResolvedValue([savedApplication]);

    const res = await request(app).get('/api/applications').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(db.application.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
  });
});
