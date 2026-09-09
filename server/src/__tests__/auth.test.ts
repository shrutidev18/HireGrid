import bcrypt from 'bcrypt';
import request from 'supertest';

/**
 * The database is mocked, not connected to.
 *
 * This has to be declared before `app` is imported — Jest hoists jest.mock()
 * calls above imports, which is what makes that work.
 *
 * Why mock rather than run against a real test database: these tests are about
 * *auth behaviour* — is the password hashed, is the cookie httpOnly, does a
 * wrong password give the same answer as an unknown email, does /me reject a
 * missing token. None of that is a question about SQL. Mocking makes the suite
 * fast, deterministic, and runnable with nothing installed, and it lets us
 * simulate the unique-constraint race in a way a real database makes awkward.
 * Prisma's own query behaviour is exercised by hand in Prisma Studio and by
 * the manual checks at the end of each phase.
 */
jest.mock('../config/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
  disconnectDb: jest.fn(),
}));

import app from '../app';
import { prisma } from '../config/db';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock; create: jest.Mock };
};

const TEST_USER = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'Shruti Test',
  email: 'shruti@example.com',
};
const TEST_PASSWORD = 'correct-horse-8';

/** Pulls the Set-Cookie header out of a response as a flat array. */
function cookiesFrom(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function authCookie(res: request.Response): string | undefined {
  return cookiesFrom(res).find((c) => c.startsWith('token='));
}

describe('POST /api/auth/signup', () => {
  it('creates the account, returns the user, and sets an httpOnly cookie', async () => {
    db.user.findUnique.mockResolvedValue(null); // email not taken
    db.user.create.mockResolvedValue(TEST_USER);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual(TEST_USER);

    const cookie = authCookie(res);
    expect(cookie).toBeDefined();
    // The three flags that make cookie-based auth safe.
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('never puts the token or the password hash in the response body', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(TEST_USER);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: TEST_USER.email, password: TEST_PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('token');
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain(TEST_PASSWORD);
  });

  it('stores a bcrypt hash, never the raw password', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(TEST_USER);

    await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: TEST_USER.email, password: TEST_PASSWORD });

    const written = db.user.create.mock.calls[0][0].data;
    expect(written.passwordHash).not.toBe(TEST_PASSWORD);
    // $2b$10$ — bcrypt's identifier and the 10 salt rounds we configured.
    expect(written.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    await expect(bcrypt.compare(TEST_PASSWORD, written.passwordHash)).resolves.toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    db.user.findUnique.mockResolvedValue({ id: TEST_USER.id }); // already registered

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Someone Else', email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'An account with this email already exists',
      statusCode: 409,
    });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('translates the database unique-constraint race into 409, not 500', async () => {
    // Both requests read "email free", then the second one loses at the
    // database. Prisma reports that as P2002.
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(409);
  });

  it('rejects a password shorter than 8 characters with a field-level 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: TEST_USER.email, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.error).toMatch(/password/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: 'not-an-email', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('lowercases the email before storing it', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(TEST_USER);

    await request(app)
      .post('/api/auth/signup')
      .send({ name: TEST_USER.name, email: 'SHRUTI@Example.COM', password: TEST_PASSWORD });

    expect(db.user.create.mock.calls[0][0].data.email).toBe('shruti@example.com');
  });
});

describe('POST /api/auth/login', () => {
  /** A stored user whose hash really matches TEST_PASSWORD. */
  async function storedUser() {
    return { ...TEST_USER, passwordHash: await bcrypt.hash(TEST_PASSWORD, 10) };
  }

  it('logs in with correct credentials and sets the cookie', async () => {
    db.user.findUnique.mockResolvedValue(await storedUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(TEST_USER);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(authCookie(res)).toMatch(/HttpOnly/i);
  });

  it('rejects a wrong password with a generic 401', async () => {
    db.user.findUnique.mockResolvedValue(await storedUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'definitely-wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials', statusCode: 401 });
    expect(authCookie(res)).toBeUndefined();
  });

  it('gives an unknown email the identical response to a wrong password', async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD });

    // Byte-for-byte the same as the wrong-password case above. Any difference
    // here — status, wording, even field order — would let an attacker test
    // which emails have accounts.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials', statusCode: 401 });
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when no cookie is sent', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', statusCode: 401 });
  });

  it('returns 401 for a token that is not a real JWT', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', ['token=garbage']);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', statusCode: 401 });
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    // A forged token with a valid *shape* but an invalid signature — this is
    // the check that makes JWTs worth anything.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const forged = jwt.sign({ userId: TEST_USER.id }, 'an-attackers-own-secret-value-12345');

    const res = await request(app).get('/api/auth/me').set('Cookie', [`token=${forged}`]);

    expect(res.status).toBe(401);
  });

  it('returns the current user when a valid cookie is sent', async () => {
    const agent = request.agent(app); // keeps cookies between requests

    db.user.findUnique.mockResolvedValue({
      ...TEST_USER,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
    });
    await agent.post('/api/auth/login').send({ email: TEST_USER.email, password: TEST_PASSWORD });

    // /me re-reads the user, so point the mock at the public shape.
    db.user.findUnique.mockResolvedValue(TEST_USER);
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(TEST_USER);
  });

  it('returns 401 when the token is valid but the account no longer exists', async () => {
    const agent = request.agent(app);

    db.user.findUnique.mockResolvedValue({
      ...TEST_USER,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
    });
    await agent.post('/api/auth/login').send({ email: TEST_USER.email, password: TEST_PASSWORD });

    db.user.findUnique.mockResolvedValue(null); // account deleted since
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie and succeeds', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Deletion is expressed as an empty value with an expiry in the past.
    const cookie = authCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/token=;/);
  });

  it('succeeds even with no session, so an expired login can still be cleared', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});
