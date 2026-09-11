import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

/**
 * The single PrismaClient instance for the whole server.
 *
 * Every service imports `prisma` from here. Two reasons this must be a
 * singleton rather than `new PrismaClient()` wherever it is needed:
 *
 *   1. Each client opens its own connection pool. Several clients means
 *      several pools competing for the same limited number of PostgreSQL
 *      connections, and "too many clients already" under load.
 *   2. The query engine takes time to start. Paying that once at boot is
 *      cheaper than paying it per module.
 *
 * The `globalThis` guard exists specifically for development. `tsx watch`
 * reloads modules on every file save, and without the guard each reload would
 * construct another client and leak its pool until Postgres refuses new
 * connections. Stashing the instance on `globalThis` — which survives module
 * reloads — means a save reuses the client that is already connected.
 *
 * In production the process starts once and the guard is skipped, so nothing
 * is attached to the global scope there.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Add 'query' to this array to print every SQL statement Prisma runs —
    // useful when checking that an index is actually being used, noisy
    // otherwise.
    log: isProduction ? ['error'] : ['warn', 'error'],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

/**
 * The client handed to an interactive transaction callback
 * (`prisma.$transaction(async (tx) => ...)`).
 *
 * It is the full client minus the methods that make no sense inside an open
 * transaction — you cannot disconnect, or start a nested transaction, from
 * within one. Prisma models this as `Prisma.TransactionClient`; the type is
 * re-derived here so that services can annotate their `tx` parameter without
 * importing the Prisma namespace, which is only present after
 * `prisma generate` has run.
 */
export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Closes the connection pool. Called from the server's shutdown handler so
 * PostgreSQL is not left holding connections from a process that has exited.
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
