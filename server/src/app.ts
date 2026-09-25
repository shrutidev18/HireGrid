import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import applicationRoutes from './routes/applications.routes';
import resumeRoutes from './routes/resumes.routes';
import analysisRoutes from './routes/analysis.routes';
import dashboardRoutes from './routes/dashboard.routes';
import profileRoutes from './routes/profile.routes';

/**
 * Builds the configured Express app, without starting a server.
 *
 * The split from index.ts exists for testing. Supertest needs an app object it
 * can drive in-process; if creating the app also called `app.listen()`, every
 * test file would open a real port, and running suites in parallel would fight
 * over it. Here, index.ts is the only thing that listens.
 */
const app = express();

/**
 * Middleware order is not cosmetic — each layer depends on the ones above it.
 */

// 1. CORS. The client (:5173) and the API (:4000) are different origins, so
//    every browser call is cross-origin. `credentials: true` plus one named
//    origin is mandatory for the auth cookie: browsers refuse to send cookies
//    cross-origin when the allowed origin is the "*" wildcard.
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// 2. Body parsing, so handlers can read `req.body`. Resume file uploads use
//    Multer in a later phase and are not affected by this limit.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 3. Cookie parsing. Populates `req.cookies`, which is where the auth
//    middleware reads the JWT from. Without this, `req.cookies` is undefined
//    and every authenticated request fails as though no one were logged in.
app.use(cookieParser());

// 4. Routes.
//    /api/health and /api/auth/* are the only routes reachable without
//    authentication; everything added from here on sits behind requireAuth.
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

// Analysis endpoints are nested under an application (/api/applications/:id/
// analysis). Mounting a second router at the same prefix is intentional:
// Express tries them in order, and the application router's `/:id` cannot
// match a two-segment path, so requests fall through to here unambiguously.
app.use('/api/applications', analysisRoutes);

// 5. Nothing matched — turn it into a 404 that flows through the error handler.
app.use(notFoundHandler);

// 6. The centralized error handler, registered last. Express only routes an
//    error to middleware declared after the point it was thrown, so anything
//    below this line would never see errors from the routes above.
app.use(errorHandler);

export default app;
