/**
 * Runs before any module under test is imported (wired up as Jest's
 * `setupFiles`, not `setupFilesAfterEach`).
 *
 * The ordering matters: src/config/env.ts validates the environment at import
 * time and throws if anything is missing, so the variables have to exist
 * before the first `import app from '../app'` executes.
 *
 * These values are also why the suite does not need a .env file — tests should
 * not depend on whatever the developer happens to have configured locally, or
 * they pass on one machine and fail on another. dotenv does not overwrite
 * variables that are already set, so these win over any real .env.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4000';

// Present so env validation passes. No test touches a real database — the
// Prisma client is mocked — so this never opens a connection.
process.env.DATABASE_URL =
  'postgresql://hiregrid:hiregrid_dev_password@localhost:5432/hiregrid_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';

// Must be 32+ characters to satisfy the same validation the real server uses.
process.env.JWT_SECRET = 'test-only-jwt-secret-not-used-anywhere-real-0123456789';

process.env.GEMINI_API_KEY = 'test-gemini-api-key';
process.env.CLIENT_URL = 'http://localhost:5173';
