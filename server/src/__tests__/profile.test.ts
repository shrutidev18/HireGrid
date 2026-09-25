import request from 'supertest';

/**
 * Prisma is mocked; **bcrypt is not.**
 *
 * That split is deliberate. The questions here are about orchestration — does
 * the update really run in one transaction, is the Profile row upserted rather
 * than updated, does a duplicate email become a 409 — and those are answered
 * by inspecting the calls.
 *
 * But the password check is the one piece of this phase where the *cryptography
 * itself* is the behaviour under test. Mocking `bcrypt.compare` would leave a
 * test that passes whether or not the real comparison works, which is precisely
 * the assurance worth having. So the tests below hash real passwords with real
 * bcrypt and let the service verify them.
 */
jest.mock('../config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(1) },
  createQueueConnection: jest.fn(),
  disconnectRedis: jest.fn(),
}));

jest.mock('../queues/analysisQueue', () => ({
  ANALYSIS_QUEUE_NAME: 'analysis-queue',
  enqueueAnalysis: jest.fn(),
  closeAnalysisQueue: jest.fn(),
}));

const tx = {
  user: { update: jest.fn() },
  profile: { upsert: jest.fn() },
};

jest.mock('../config/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    profile: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
  disconnectDb: jest.fn(),
}));

import bcrypt from 'bcrypt';

import app from '../app';
import { prisma } from '../config/db';
import { signAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  profile: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const cookie = [`${AUTH_COOKIE_NAME}=${signAuthToken(USER_ID)}`];

const CURRENT_PASSWORD = 'correct-horse-battery';
let currentHash: string;

const profileRow = {
  targetRole: 'Backend Engineer',
  skills: ['TypeScript', 'PostgreSQL'],
  education: 'B.Tech, Computer Science',
  experienceLevel: 'FRESHER',
  graduationYear: 2026,
  phone: '+91 98765 43210',
  linkedinUrl: 'https://linkedin.com/in/shruti',
  portfolioUrl: 'https://shruti.dev',
};

const validBody = {
  name: 'Shruti Dev',
  email: 'shruti@example.com',
  ...profileRow,
};

beforeAll(async () => {
  // A real hash of a real password — the password tests below verify against
  // this exactly as the login flow would.
  currentHash = await bcrypt.hash(CURRENT_PASSWORD, 10);
});

beforeEach(() => {
  jest.clearAllMocks();

  db.$transaction.mockImplementation(async (cb: (client: typeof tx) => Promise<unknown>) =>
    cb(tx),
  );
  tx.user.update.mockResolvedValue({ name: validBody.name, email: validBody.email });
  tx.profile.upsert.mockResolvedValue(profileRow);
});

// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('rejects every profile route without a valid cookie', async () => {
    const calls: Array<[string, () => request.Test]> = [
      ['GET /api/profile', () => request(app).get('/api/profile')],
      ['PUT /api/profile', () => request(app).put('/api/profile')],
      ['PUT /api/profile/password', () => request(app).put('/api/profile/password')],
    ];

    for (const [label, call] of calls) {
      const res = await call();
      expect([label, res.status]).toEqual([label, 401]);
    }

    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/profile', () => {
  it('merges the User and Profile rows into one flat object', async () => {
    db.user.findUnique.mockResolvedValue({
      name: 'Shruti Dev',
      email: 'shruti@example.com',
      profile: profileRow,
    });

    const res = await request(app).get('/api/profile').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(validBody);
  });

  it('returns nulls, not missing keys, when no Profile row exists yet', async () => {
    // Every user is in this state the first time they open the page.
    db.user.findUnique.mockResolvedValue({
      name: 'Shruti Dev',
      email: 'shruti@example.com',
      profile: null,
    });

    const res = await request(app).get('/api/profile').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({
      name: 'Shruti Dev',
      email: 'shruti@example.com',
      targetRole: null,
      skills: [],
      education: null,
      experienceLevel: null,
      graduationYear: null,
      phone: null,
      linkedinUrl: null,
      portfolioUrl: null,
    });

    // A React form bound to `undefined` renders an uncontrolled input that
    // flips to controlled on the first keystroke. Explicit nulls prevent it.
    for (const key of Object.keys(res.body.profile)) {
      expect(res.body.profile[key]).toBeDefined();
    }
  });

  it('is scoped to the authenticated user', async () => {
    db.user.findUnique.mockResolvedValue({ name: 'x', email: 'x@y.z', profile: null });

    await request(app).get('/api/profile').set('Cookie', cookie);

    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: USER_ID });
  });

  it('never selects the password hash', async () => {
    db.user.findUnique.mockResolvedValue({ name: 'x', email: 'x@y.z', profile: null });

    await request(app).get('/api/profile').set('Cookie', cookie);

    // The hash should not leave PostgreSQL at all, rather than being fetched
    // and then discarded in application code.
    expect(db.user.findUnique.mock.calls[0][0].select.passwordHash).toBeUndefined();
  });
});

describe('PUT /api/profile', () => {
  it('writes both tables inside one transaction', async () => {
    const res = await request(app).put('/api/profile').set('Cookie', cookie).send(validBody);

    expect(res.status).toBe(200);

    // The point of the transaction: committed separately, a failure between
    // them leaves a renamed account whose target role never changed.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.profile.upsert).toHaveBeenCalledTimes(1);
  });

  it('sends name and email to User, and nothing else', async () => {
    await request(app).put('/api/profile').set('Cookie', cookie).send(validBody);

    const args = tx.user.update.mock.calls[0][0];

    expect(args.where).toEqual({ id: USER_ID });
    expect(args.data).toEqual({ name: 'Shruti Dev', email: 'shruti@example.com' });
  });

  it('upserts rather than updates the Profile row', async () => {
    await request(app).put('/api/profile').set('Cookie', cookie).send(validBody);

    const args = tx.profile.upsert.mock.calls[0][0];

    // A plain update would throw for every user who has never opened this page.
    expect(args.where).toEqual({ userId: USER_ID });
    expect(args.create.userId).toBe(USER_ID);
    expect(args.update.targetRole).toBe('Backend Engineer');

    // name and email belong to the other table and must not leak into this one.
    expect(args.update).not.toHaveProperty('name');
    expect(args.update).not.toHaveProperty('email');
  });

  it('lower-cases the email so one address cannot become two accounts', async () => {
    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ ...validBody, email: 'Shruti@Example.COM' });

    expect(tx.user.update.mock.calls[0][0].data.email).toBe('shruti@example.com');
  });

  it('de-duplicates skills case-insensitively', async () => {
    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ ...validBody, skills: ['React', 'react', ' REACT ', 'Node'] });

    expect(tx.profile.upsert.mock.calls[0][0].update.skills).toEqual(['React', 'Node']);
  });

  it('normalises cleared optional fields to null', async () => {
    // An untouched optional input submits "", which stored as-is would fill
    // the database with empty strings that are neither a value nor absent.
    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ ...validBody, targetRole: '', phone: '', linkedinUrl: '' });

    const data = tx.profile.upsert.mock.calls[0][0].update;

    expect(data.targetRole).toBeNull();
    expect(data.phone).toBeNull();
    expect(data.linkedinUrl).toBeNull();
  });

  it('turns a duplicate email into a 409, not a 500', async () => {
    db.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    const res = await request(app).put('/api/profile').set('Cookie', cookie).send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it.each([
    ['a missing name', { name: '' }],
    ['a malformed email', { email: 'not-an-email' }],
    ['an invalid experience level', { experienceLevel: 'SENIOR' }],
    ['a nonsense graduation year', { graduationYear: 202 }],
    ['a malformed URL', { linkedinUrl: 'linkedin.com/in/x' }],
  ])('rejects %s with a 400', async (_label, override) => {
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ ...validBody, ...override });

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /api/profile/password', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ passwordHash: currentHash });
    db.user.update.mockResolvedValue({ id: USER_ID });
  });

  it('accepts the correct current password and stores a new hash', async () => {
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(200);

    const stored = db.user.update.mock.calls[0][0].data.passwordHash as string;

    // Hashed, never stored raw — and a real hash of the real new password.
    expect(stored).not.toBe('a-brand-new-password');
    expect(stored.startsWith('$2')).toBe(true);
    await expect(bcrypt.compare('a-brand-new-password', stored)).resolves.toBe(true);
  });

  it('salts, so the same password never produces the same hash twice', async () => {
    await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'repeated-password' });

    await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'repeated-password' });

    const first = db.user.update.mock.calls[0][0].data.passwordHash;
    const second = db.user.update.mock.calls[1][0].data.passwordHash;

    // Identical hashes would mean no per-password salt, which is what makes a
    // stolen table crackable with one rainbow table instead of one per row.
    expect(first).not.toBe(second);
  });

  it('rejects a wrong current password with 401 and changes nothing', async () => {
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'not-my-password', newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Current password is incorrect', statusCode: 401 });

    // The important half of this test: nothing was written.
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('is specific about the failure, unlike login', async () => {
    // Login says "Invalid credentials" to avoid confirming which emails exist.
    // Here the caller is already authenticated, so there is nothing to leak
    // and a vague message would only be unhelpful.
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' });

    expect(res.body.error).toBe('Current password is incorrect');
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects a new password longer than bcrypt can actually use', async () => {
    // bcrypt silently truncates past 72 bytes, so accepting more would give a
    // false sense of strength.
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'x'.repeat(73) });

    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('does not apply the length rule to the current password', async () => {
    // A user whose existing password predates the 8-character minimum must
    // still be able to change it — otherwise the rule locks them out of the
    // one endpoint that would fix it.
    const legacyHash = await bcrypt.hash('old', 10);
    db.user.findUnique.mockResolvedValue({ passwordHash: legacyHash });

    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'old', newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(200);
  });

  it('never echoes a password back in the response', async () => {
    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-brand-new-password' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('a-brand-new-password');
    expect(body).not.toContain(CURRENT_PASSWORD);
    expect(body).not.toMatch(/\$2[aby]\$/); // no hash either
  });
});
