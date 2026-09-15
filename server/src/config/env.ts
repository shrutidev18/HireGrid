import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads .env from the server package root (not the process cwd), so the server
 * behaves identically whether it is started from ./server or from the repo root.
 */
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/**
 * The single source of truth for every environment variable the server reads.
 *
 * Two rules follow from this file existing:
 *   1. No other file in the codebase may touch `process.env` directly — they
 *      import `env` from here instead. That keeps every required variable
 *      visible in one place and typed.
 *   2. The process refuses to start if configuration is invalid. A server that
 *      boots with a missing JWT_SECRET and only fails at the first login
 *      request is far harder to debug than one that never starts.
 */
/**
 * A string that must be present and non-empty, with the same message whether
 * the variable is missing entirely or set to "".
 *
 * Zod treats those as two different failures: `.min(1)` only fires for a
 * present-but-empty value, so without the `error` option a missing variable
 * reports the unhelpful "expected string, received undefined" instead of the
 * message written for it here.
 */
const requiredString = (message: string) =>
  z.string({ error: message }).min(1, message);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // z.coerce is required because every process.env value is a string.
  PORT: z.coerce
    .number({ message: 'PORT must be a number' })
    .int()
    .positive()
    .default(4000),

  DATABASE_URL: requiredString(
    'DATABASE_URL is required (PostgreSQL connection string)',
  ),

  REDIS_URL: requiredString('REDIS_URL is required (e.g. redis://localhost:6379)'),

  // 32 chars is the practical floor for an HMAC-SHA256 signing key. A short
  // secret is the difference between "has auth" and "has forgeable auth".
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required (min 32 characters)' })
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  GEMINI_API_KEY: requiredString(
    'GEMINI_API_KEY is required (Google AI Studio API key)',
  ),

  /**
   * Which Gemini model the analysis worker calls.
   *
   * Configurable with a default rather than hard-coded, because model names
   * are retired and replaced on Google's schedule, not ours. When that
   * happens the fix is one line in .env instead of a code change and redeploy
   * — and a key without access to a particular model can be pointed at one it
   * does have.
   */
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),

  CLIENT_URL: z.url({
    error: 'CLIENT_URL must be a valid URL (e.g. http://localhost:5173)',
  }),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid environment configuration.\n\n${details}\n\n` +
      `Copy server/.env.example to server/.env and fill in the values above.\n`,
  );
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
