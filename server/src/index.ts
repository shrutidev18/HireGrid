import app from './app';
import { env } from './config/env';
import { disconnectDb } from './config/db';

/**
 * Process entry point. Everything about *what* the app does lives in app.ts;
 * this file only starts it listening and stops it cleanly.
 */
const server = app.listen(env.PORT, () => {
  console.log(`[hiregrid] API listening on http://localhost:${env.PORT}`);
  console.log(`[hiregrid] environment: ${env.NODE_ENV}`);
  console.log(`[hiregrid] accepting browser requests from: ${env.CLIENT_URL}`);
});

/**
 * Graceful shutdown. On Ctrl-C or a container stop signal: stop accepting new
 * connections, let in-flight requests finish, then release the database
 * connection pool so PostgreSQL is not left holding connections for a process
 * that has exited. The timeout is the backstop for a connection that never
 * closes on its own.
 */
function shutdown(signal: string): void {
  console.log(`\n[hiregrid] ${signal} received, shutting down...`);

  const forceExit = setTimeout(() => {
    console.error('[hiregrid] shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (err) => {
    if (err) {
      console.error('[hiregrid] error during shutdown:', err);
      process.exit(1);
    }

    try {
      await disconnectDb();
      console.log('[hiregrid] closed cleanly');
      process.exit(0);
    } catch (disconnectErr) {
      console.error('[hiregrid] error disconnecting from database:', disconnectErr);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
