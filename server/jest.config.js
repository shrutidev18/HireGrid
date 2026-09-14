/**
 * Note on how the tests are launched.
 *
 * `npm test` runs Jest through `node --experimental-vm-modules` rather than
 * calling the `jest` binary directly. The reason is pdf.js, which pdf-parse
 * depends on: it loads its worker with a dynamic `import()`, and Jest's
 * CommonJS VM refuses that with "A dynamic import callback was invoked without
 * --experimental-vm-modules". Without the flag, every test that parses a real
 * PDF fails.
 *
 * Invoking node with the flag (instead of setting NODE_OPTIONS) keeps the
 * script working identically in PowerShell, cmd and bash — `NODE_OPTIONS=...`
 * prefixing is a Unix shell idiom that Windows does not understand.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only files ending in .test.ts are tests. Without this, helper files that
  // live under __tests__/ would be picked up as suites and fail with
  // "your test suite must contain at least one test".
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Runs before the test framework and before any module under test is
  // imported, which matters because src/config/env.ts validates the
  // environment at import time and would throw otherwise.
  setupFiles: ['<rootDir>/src/__tests__/helpers/setupEnv.ts'],

  clearMocks: true,

  // bcrypt hashing is deliberately slow (that is the point of it), so the
  // default 5s timeout is tight for suites that hash several passwords.
  testTimeout: 20000,
};
