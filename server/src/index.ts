import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health.routes';

const app = express();

/**
 * Middleware order is not cosmetic — each layer below depends on the ones
 * above it having already run.
 */

// 1. CORS. The client runs on a different origin (Vite dev server on :5173)
//    from the API (:4000), so the browser treats every API call as
//    cross-origin. `credentials: true` plus an explicit single origin is
//    mandatory for the httpOnly auth cookie added in a later phase: browsers
//    refuse to send cookies cross-origin when the allowed origin is the "*"
//    wildcard, so the origin must be named exactly.
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// 2. Body parsing. Runs before routes so handlers can read `req.body`.
//    The size limit caps how much JSON one request can force the server to
//    buffer; resume *files* are uploaded via Multer in a later phase and are
//    not affected by this limit.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 3. Cookie parsing. Populates `req.cookies` so the auth middleware added in a
//    later phase can read the JWT out of the httpOnly cookie.
app.use(cookieParser());

// 4. Routes.
app.use('/api/health', healthRoutes);

// 5. Nothing matched — turn it into a 404 that flows through the error handler.
app.use(notFoundHandler);

// 6. The centralized error handler. Must be registered last: Express only
//    sends an error to middleware declared *after* the point the error was
//    thrown, so anything registered below this line would never see errors
//    raised by the routes above it.
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[hiregrid] API listening on http://localhost:${env.PORT}`);
  console.log(`[hiregrid] environment: ${env.NODE_ENV}`);
  console.log(`[hiregrid] accepting browser requests from: ${env.CLIENT_URL}`);
});

/**
 * Graceful shutdown. On Ctrl-C or a container stop signal, stop accepting new
 * connections and let in-flight requests finish instead of severing them
 * mid-response. The timeout is the backstop for a connection that never
 * closes on its own.
 */
function shutdown(signal: string): void {
  console.log(`\n[hiregrid] ${signal} received, shutting down...`);

  const forceExit = setTimeout(() => {
    console.error('[hiregrid] shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      console.error('[hiregrid] error during shutdown:', err);
      process.exit(1);
    }
    console.log('[hiregrid] closed cleanly');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
