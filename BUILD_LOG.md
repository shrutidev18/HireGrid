# Build Log

## Phase 1 — Setup, Database & Authentication

### What was built

Set up the monorepo (`client/` + `server/`) and got auth fully working end to end.

Server: Express + TypeScript app with the folder structure from the spec (`routes`, `config`, `middleware`). `config/env.ts` loads and validates the env vars we need (throws on startup if `DATABASE_URL` or `JWT_SECRET` is missing). `config/db.ts` exports one shared `PrismaClient` instance. Wrote the Prisma schema with all 5 models (User, Resume, Application, StatusHistory, AnalysisResult) and the two enums (EmploymentType, ApplicationStatus), matching the spec's field list exactly.

Auth: signup hashes the password with bcrypt and rejects duplicate emails, login compares the hash and gives back plain "User not found" / "Wrong password" messages (no need to hide which one failed, per the brief), both set a JWT in an httpOnly cookie named `token`. `authMiddleware.ts` reads that cookie, verifies it, and attaches `req.userId` for any route that needs to know who's logged in. `/api/auth/me` uses this middleware to return the current user (401 if not logged in).

Client: Vite + React + TS scaffold, Tailwind wired up, folder structure per spec (`pages`, `components`, `context`, `api`, `types`). `AuthContext` holds the logged-in user in state and calls `GET /api/auth/me` once on page load to check for an existing session. `Login.tsx` / `Signup.tsx` are plain forms with basic empty-field checks. `ProtectedRoute` redirects to `/login` if there's no user (and waits for the initial `/me` check to finish first, so it doesn't redirect too early on refresh). Added a bare-bones `Dashboard.tsx` (just a welcome message + logout button) since the real dashboard is a later phase — needed something for login/signup to redirect to.

### Libraries introduced

- **Prisma** — ORM, as specified. Ended up on `6.19.3` (see "Errors hit" below for why — tried `7.10.0` first since that's technically the latest, but it needs a config setup this project doesn't need).
- **bcrypt + jsonwebtoken** — password hashing and JWT signing, as specified.
- **ts-node-dev** — dev server with auto-restart, standard choice for an Express+TS project.
- **Tailwind CSS v4** — this pulled in `@tailwindcss/vite` instead of the old `postcss.config.js` + `tailwind.config.js` setup. Tailwind v4 doesn't need a config file for the basic setup we're using — just the Vite plugin and one `@import "tailwindcss";` line in `index.css`.

### Errors hit and how they were fixed

- **`npm install prisma` grabbed `8.0.0-rc.17`.** That's the `latest` npm dist-tag right now, but it's a release candidate. Re-pinned to `7.10.0` (the actual latest stable) first — see next point for why that didn't stick either.
- **Prisma 7.10.0 rejected the schema with `Error: Prisma schema validation - (get-config wasm) ... Error code: P1012 — The datasource property 'url' is no longer supported in schema files.`** Prisma 7 made a real breaking change: the DB connection string has to move out of `schema.prisma` into a separate `prisma.config.ts` file, and `PrismaClient` needs a "driver adapter" package (`@prisma/adapter-pg`) instead of just a `url`. That's extra moving parts this project doesn't need. **Fix:** downgraded to `prisma@6.19.3` / `@prisma/client@6.19.3`, the last major version that still supports the plain `url = env("DATABASE_URL")` line in the schema. No other code changed — `schema.prisma` already used that classic syntax, it just needed the older CLI to accept it.
- **In my own dev sandbox (not on this machine), `npx prisma migrate dev` / `prisma generate` failed** trying to reach `binaries.prisma.sh` (blocked by that sandbox's network policy — confirmed a deliberate policy block, not a flaky network). Doesn't apply here — confirmed below that `prisma migrate dev` runs cleanly on this machine with normal internet access.
- **`tsconfig.json` warned `moduleResolution: "node"` is deprecated** (TypeScript 6 already warns about this ahead of removal in 7.0). Switched to `"node10"` + `"ignoreDeprecations": "6.0"` per the compiler's own suggested fix.

### What to manually verify

1. `docker compose up -d` — starts Postgres.
2. In `server/`: `npm install`, `npx prisma migrate dev --name init`, `npm run dev`.
3. In `client/`: `npm install`, `npm run dev`.
4. Go to `http://localhost:5173`, sign up with a name/email/password.
5. Confirm you land on `/dashboard` and see "Welcome, <your name>".
6. Refresh the page — you should still be on the dashboard, still logged in (this proves the cookie + `/me` check works).
7. Click "Log out" — confirm you're bounced to `/login`.
8. Try logging in with the same email but a wrong password — should see "Wrong password". Try an email that doesn't exist — should see "User not found".
9. Try signing up again with the same email — should see the duplicate-email error.

**Confirmed working on 2026-09-27** — ran steps 1-5 for real (Windows machine, Docker Desktop + real Postgres, `prisma migrate dev` created the tables and generated the client cleanly on `6.19.3`, signup worked end to end). Steps 6-9 not explicitly re-confirmed after the Prisma downgrade but there's no reason they'd behave differently — nothing about login/logout/duplicate-check logic changed, just the Prisma version.

### Uncertain / worth double-checking

- Steps 6-9 above (refresh, logout, wrong password, duplicate email) — worth a quick manual pass since only signup was explicitly confirmed after the Prisma version fix.
- Cookie is set with `sameSite: "lax"` and `secure` only in production — fine for local dev over http, standard for a student project, but flag if you want something different.

## Phase 2 — Application CRUD, Status History & Resume Upload

### What was built

Server: `applications.routes.ts` - full CRUD (`POST/GET/PUT/DELETE /api/applications`, plus `GET /:id` for the details page and `PATCH /:id/status`). Creating an application also writes the first `StatusHistory` row so the history list is never empty. `PATCH /:id/status` updates the status and appends a new history row - that's the only way status changes, so the history always matches reality. All the main routes scope their `where` clause to `req.userId` (create/read/update/delete), so one user can't see or touch another user's applications - tested this directly, confirmed a second user gets a 404 trying to read or delete the first user's application.

`resumes.routes.ts` - Multer handles the upload (disk storage into `server/uploads/`, PDF-only, 5MB limit), `pdf-parse` extracts the text, and it gets saved on the `Resume` row along with the file's own path. List and delete are scoped to `req.userId` too. Deleting a resume doesn't check if an application is using it first (per the brief) - the foreign key is set up so that just nulls out `resumeId` on any application that had it, instead of blocking the delete or breaking anything.

Client: `AddApplication.tsx` does double duty as both the create and edit form (edit mode kicks in when there's an `:id` in the URL - avoided building a near-identical second page for that). `ApplicationDetails.tsx` shows everything plus a status dropdown (calls the PATCH endpoint), the status history list, and edit/delete buttons. `StatusBadge` and `StatusHistoryList` are small reusable pieces. `ResumeUpload.tsx` is a standalone file picker + upload button, used both on `MyResumes.tsx` and indirectly feeding the resume dropdown on the application form. Added minimal nav links on the Dashboard (+ Add Application, My Resumes) since those pages need to be reachable somehow - the real dashboard layout is still a later phase.

### Libraries introduced

- **Multer** - handles the multipart file upload, as specified.
- **pdf-parse** - text extraction from the uploaded PDF. Heads up: v2 (what npm installs today) has a completely different API from the old `pdf(buffer).then(...)` one-liner most tutorials show - it's now `new PDFParse({ data: buffer })` then `await parser.getText()`. Used the current API since that's what actually installs.

### Errors hit and how they were fixed

- **`DELETE /api/applications/:id` failed with a Postgres foreign key error, every single time.** Cause: I never set an explicit `onDelete` on the `StatusHistory -> Application` and `AnalysisResult -> Application` relations back in Phase 1, so Prisma used its default for a required relation, which is `Restrict` (blocks the delete) - not `Cascade` like I'd assumed. Since every application always has at least one status history row (created alongside it), the delete route was completely broken from the start. **Fix:** added `onDelete: Cascade` to both relations in `schema.prisma` and wrote a new migration (`20260102000000_cascade_delete_status_history`) rather than editing the already-applied init migration. Tested directly against a real database afterward - delete now works and cleans up the history/analysis rows with it.
- **Uploading a non-PDF file crashed with Express's raw HTML error page** instead of a JSON error. Cause: Multer's `fileFilter` rejection happens in the upload middleware, before the route handler's own `try/catch` ever runs, so the error had nowhere to go. **Fix:** call `upload.single("resume")` as a plain function with its own callback (`upload.single("resume")(req, res, (err) => {...})`) instead of passing it as route middleware, so the error can be caught and turned into a normal `{ error: ... }` response. Tested with a `.txt` file (clean 400 now) and an oversized file (clean 400, "File too large").

### What to manually verify

1. Create an application (with or without a resume attached).
2. Change its status a couple of times from the details page - confirm the status history list grows and stays in order.
3. Edit the application (change the job title, say) - confirm the status wasn't touched by the edit.
4. Upload a resume (PDF only - try a `.txt` file too and confirm it's rejected with a message, not a crash).
5. Use that resume in a new application, then delete the resume - confirm the application still exists (just without a resume linked) instead of erroring.
6. Delete an application - confirm it actually succeeds (this is the one that was silently broken until the cascade fix above).
7. If you can create a second account, confirm one account can't see or delete the other's applications (should 404).

**Confirmed working in my own test environment** (real Postgres, not the stub) for all of the above, including the two bugs and their fixes. Not yet re-confirmed by you on your machine - worth running through once `npm install` picks up Multer/pdf-parse.

### Uncertain / worth double-checking

- `npm install` still needs to run in `server/` to pick up `multer` and `pdf-parse` (new deps this phase), and `npx prisma migrate dev` needs to run again to apply the cascade-delete migration - neither happened automatically since I can't run npm/prisma commands directly on your machine (same filesystem quirk as the Phase 1 Prisma downgrade).
- Didn't build any explicit file-type validation beyond MIME type (`application/pdf`) - a renamed non-PDF file with a spoofed MIME type would slip through the upload but then just fail to parse cleanly (caught by the try/catch, returns a "couldn't read that PDF" error). Not a real risk for a student project, just noting it's not bulletproof.

## Phase 3 — AI Analysis, List/Search/Filter & Dashboard

### What was built

Server: `utils/gemini.ts` - a plain function (`analyzeResumeMatch`) that calls the Gemini API directly over `fetch` (no SDK) with the resume text and job description, asking it to respond with JSON matching a fixed shape (`matchedSkills`, `missingSkills`, `matchScore`, `suggestions`). Used `generationConfig: { responseMimeType: "application/json" }` so Gemini returns clean JSON instead of wrapping it in markdown code fences. Wrapped the whole thing in one try/catch - if there's no API key, the request fails, the response isn't ok, or the JSON doesn't parse, it just returns `null` and logs why. No retries, no schema validation library, per the brief - if it breaks, the application still gets created, it just won't have an analysis attached.

Hooked this into `POST /api/applications`: after the application and its first status history row are created, if a `resumeId` was given, it looks up that resume (scoped to the logged-in user), calls Gemini, and if that succeeds, saves an `AnalysisResult` row linked to the application. The response includes `analysisResult` alongside `application` (null if skipped/failed).

`GET /api/applications` now takes optional `?search=` and `?status=` query params - search does a case-insensitive partial match on company name OR job title, status does an exact match. Both can be used together.

`dashboard.routes.ts` (new) - `GET /api/dashboard` returns the total application count, a count per status (one query per status - only 5 statuses so this is fine, not worth a fancier grouped query), and the 5 most recently created applications. All scoped to the logged-in user like everything else.

Client: `AnalysisResult.tsx` (new component) - shows the match score (color-coded green/yellow/red), matched skills and missing skills as pill badges, and the suggestions as a list. Shown on the application details page when `analysisResult` exists. `Applications.tsx` (new page) - a searchable, filterable table of all applications, with a small debounce (300ms) on the search box so it's not firing a request on every keystroke. `Dashboard.tsx` was rewritten from the placeholder - now shows a total-count card plus one card per status, a "Recent Applications" list (click through to details), and an empty state with a prompt to add your first application if there's nothing yet.

### Libraries introduced

- None new - the Gemini call uses plain `fetch` (already global in Node 18+), no extra SDK. Kept it that way since the brief said to keep the AI integration simple.

### Config

Added `GEMINI_MODEL` env var (defaults to `gemini-3.5-flash-lite` if not set) alongside the existing `GEMINI_API_KEY`. Both live in `config/env.ts` with safe fallbacks, so the server doesn't crash on startup if they're missing - it just skips the AI analysis at request time instead (same graceful-skip pattern as everything else in this phase).

### Errors hit and how they were fixed

- **`dashboard.routes.ts` had a type error: `Type 'string' is not assignable to type 'ApplicationStatus'`.** The `STATUSES` array (`["SAVED", "APPLIED", ...]`) was just inferred as `string[]`, so looping over it and passing `status` into `prisma.application.count({ where: { status } })` didn't match Prisma's stricter enum type for that field. **Fix:** explicitly typed it as `ApplicationStatus[]` (imported from `@prisma/client`). Caught this by running `tsc --noEmit` directly on this machine - my own dev sandbox didn't catch it because its Prisma client couldn't fully generate there (same network restriction as before), so its types were looser than the real generated client here.
- Otherwise this phase went pretty smoothly - the main thing to get right was making sure a failed/skipped AI call never blocks or breaks application creation, which it doesn't (tested by creating applications both with and without a valid API key).

### What to manually verify

1. Add `GEMINI_API_KEY` to your `server/.env` (get one free from Google AI Studio) - it's already in `.env.example` as a placeholder, and `GEMINI_MODEL=gemini-3.5-flash-lite` is set by default.
2. Create an application with a resume attached and a real job description - after a few seconds you should land on the details page and see the "AI Resume Match" card with a score, matched/missing skills, and suggestions.
3. Create an application with a resume but leave `GEMINI_API_KEY` blank (or use an invalid key) - confirm the application still gets created fine, just without the AI card. Check the server terminal - it should log why the analysis was skipped, not crash.
4. Go to `/applications` - try searching by company name and by job title (partial, case-insensitive), and filter by status. Try combining both.
5. Go to `/dashboard` - confirm the total count and per-status counts match what you'd expect, and the 5 most recent applications show up (most recent first).
6. If you have zero applications, confirm the dashboard shows the empty state instead of a broken 0/0 layout.

**Confirmed working in my own test environment** (real Postgres, real server) for: application creation with and without a resume, the graceful-skip path when no API key is set (tested directly - confirmed `analysisResult` comes back `null` and nothing breaks), search (partial + case-insensitive), status filtering, dashboard counts and recent list accuracy, and that deleting an application still cascades to clean up its `AnalysisResult` row too (extended the Phase 2 cascade fix - already covered since that fix applied to both `StatusHistory` and `AnalysisResult` relations, just hadn't been exercised with an actual analysis result present until now). Did **not** test an actual successful Gemini call end-to-end (would need a real API key, and I'm not asking you to paste that into chat) - that part is on you to confirm with your own key per step 2 above.

### Uncertain / worth double-checking

- Never tested a real, successful Gemini response end-to-end - only the skip/failure paths (no key, and a call that gets rejected). The prompt asks Gemini for a specific JSON shape and the code trusts it loosely (falls back to empty arrays / 0 if a field is missing), but I haven't seen what Gemini actually sends back for a real resume/job description pair. If the response looks off (missing fields, weird scores), that's the first place to look.
- `matchScore` is stored as an `Int?` in the schema - if Gemini ever returns a decimal instead of a whole number, `JSON.parse` will keep it as-is and Postgres/Prisma might complain. Not something I hit in testing, just flagging it.

## UI Restyle — Teal/Mint Theme

This wasn't a numbered phase, just a full visual restyle of the frontend to match a specific theme (deep teal + light mint, rounded cards, sidebar layout) based on a reference design. No backend, API routes, or existing logic were touched - purely a UI pass.

### What was built

New `components/Layout.tsx` - the shared shell every logged-in page now renders inside: a fixed left sidebar (logo, nav links for Dashboard/Applications/Resumes) and a top bar with the user's avatar (initials in a teal circle) and a dropdown with just Logout in it for now. `App.tsx` wraps each protected route's page in this Layout instead of every page having its own full-page wrapper. On small screens the sidebar collapses into a hamburger menu at the top instead.

Restyled every existing page and component to the teal/mint theme: `Dashboard.tsx` (welcome banner, 4 stat cards, a "where your applications stand" bar chart built with plain divs - no chart library, Quick Actions, Recent Activity), `Applications.tsx` (table in a white card, styled search/filter), `ApplicationDetails.tsx` (status history is now a vertical timeline with teal dots, AI match score shown in a circle), `Login.tsx` / `Signup.tsx` (centered card with the HireGrid logo above it), `AddApplication.tsx` and `MyResumes.tsx` (same card/input/button styling). `StatusBadge.tsx` colors were adjusted to match the spec (amber for Interview instead of yellow). Added `lucide-react` for icons - the only new library, nothing else changed.

Added two custom colors (`mint-bg`, `mint-sidebar`) via Tailwind v4's `@theme` block in `index.css` for the two mint background shades - didn't need to touch anything else since the spec's teal already matches Tailwind's built-in `teal-700`/`teal-800`.

### A few things left out on purpose

A reference image was also provided alongside the written spec, and it showed a couple of things the written spec didn't ask for: an "Avg Match" stat card, a "Match Score Trend" line chart, and a separate "Interviews" nav item. Went with the written spec only (4 stat cards, one bar chart, no Interviews page) since building a trend chart without a charting library would've been a lot of custom SVG work for something not actually asked for in the spec, and there's no Interviews data model separate from application status. The written spec also asked for a "Profile" nav link and an "Update Profile" quick action, but since there's no backend route for editing profile data (and adding one wasn't in scope for a UI-only pass), that's being pushed to a later phase - no Profile page or nav link yet.

### Errors hit and how they were fixed

- Installing `lucide-react` directly on this machine through my file-editing setup kept failing with an `ENOTEMPTY` rename error partway through, and left a half-downloaded copy in `node_modules` (just source maps, no actual code). This is a filesystem quirk specific to how I access this machine's files, not a real problem with the package or the project. **Fix:** left `package.json` with `lucide-react` correctly listed as a dependency - running a normal `npm install` directly in your own terminal (not through me) should grab it cleanly since it won't hit the same issue.

### What to manually verify

1. Run `npm install` in `client/` first - this pulls in `lucide-react`, which didn't fully download when I tried to add it myself (see above).
2. Start both servers as usual and open the app - confirm the sidebar, top bar, and teal/mint theme show up on all pages (Dashboard, Applications, Application details, Login, Signup, Add/Edit Application, My Resumes).
3. Shrink the browser window (or check on your phone) - confirm the sidebar turns into a hamburger menu and the dashboard cards stack into fewer columns instead of overflowing.
4. Click your avatar in the top right - confirm the Logout dropdown works.
5. Confirm every existing feature still works exactly as before (search/filter, status changes, resume upload, AI analysis, delete) - this was meant to be styling only, nothing functional should have changed.

**Confirmed working in my own test environment** (real Postgres, real server, screenshots taken at both desktop and mobile widths) for all of the above except step 1, since `npm install` needs to run on your machine directly.

### Uncertain / worth double-checking

- Never got to see this rendered with your actual real data/screen - only with test data I made up. Worth a look to make sure nothing looks cramped or off with your real application list.
- The "Active" stat card counts everything that isn't Offer or Rejected (so Saved + Applied + Interview all count as "active") - matches the spec's wording ("Active (not Offer/Rejected)") but flagging in case you meant something narrower.

## Phase 4A — Profile

### What was built

Server: `profile.routes.ts` - `GET /api/profile` returns just `{ name, email }` for whoever's logged in. `PUT /api/profile` updates name and email, with a basic check that the new email isn't already taken by someone else (same pattern as the signup route). `PUT /api/profile/password` checks the current password with `bcrypt.compare` before allowing the change - if it's wrong, nothing gets updated and you get a plain "Current password is wrong" back.

Client: `Profile.tsx` has two separate forms - one for name/email with a Save button, one for changing the password (current, new, confirm). The password form checks new-matches-confirm on the frontend before even hitting the API, so you get instant feedback instead of waiting on a round trip for something client-side validation can catch. Both forms show a green success message or red error message after submitting instead of a redirect, since there's nowhere obvious to redirect to. Added `updateUser` to `AuthContext` so saving your name actually updates what shows in the top bar right away instead of needing a refresh - profile save calls this after a successful API response.

Added Profile to the sidebar nav (finally - this was left out during the UI restyle since there was no backend for it yet) and to the avatar dropdown in the top bar.

### Libraries introduced

- None - reused bcrypt, which was already a dependency for the signup/login password hashing.

### What to manually verify

1. Go to `/profile`, change your name, hit Save, confirm the top bar updates immediately and the success message shows.
2. Refresh the page - confirm the new name is still there (this is the real test - proves it actually saved, not just updated in memory).
3. Try changing your password with the wrong current password - should get a clear error, nothing should change.
4. Change your password with the correct current password - should succeed.
5. Log out, try logging in with the old password (should fail), then the new one (should work).
6. Try changing your email to one that's already used by another account (if you have two test accounts) - should get "An account with this email already exists" instead of a raw database error.

**Confirmed working in my own test environment** (real Postgres, real server) for every step above, including both password-change outcomes and the full logout/login-with-new-password cycle.

## Phase 4B — Testing

### What was built

Added Jest + Supertest + ts-jest, with 4 tests in `server/src/__tests__/api.test.ts`: signup with valid details succeeds, login with a wrong password fails with the right error message, creating an application while logged in works, and fetching that application back by id returns the right data. `npm test` runs them.

Tests hit the same local Postgres database this project already uses (not a separate test database - simpler, and this is a solo student project, not a team one where tests running against shared dev data would be a real problem). Every test that creates data cleans it up in an `afterAll` at the end - deletes the test application first, then the test user (has to be in that order, since a user can't be deleted while an application still points to it). The test email includes a timestamp so re-running the suite repeatedly doesn't collide with a previous run's leftover email if cleanup somehow didn't happen.

One small structural change needed for this: split `index.ts` into `app.ts` (just the Express app - all the middleware and route mounting) and a thin `index.ts` that imports that app and calls `.listen()`. Supertest needs to import the app object directly to send fake requests at it without actually starting a real server on a port - with everything in one file that always calls `.listen()` on import, the tests would either need to hit a real running server on a real port, or spin up a duplicate server just for testing, both messier than just splitting the file.

### Errors hit and how they were fixed

- **TypeScript couldn't find `describe`/`test`/`expect` globals** when first running the tests - turns out this project's `tsconfig.json` didn't have Jest's types wired in. **Fix:** added `"types": ["node", "jest"]` to `compilerOptions` so the compiler knows about Jest's global functions alongside Node's.
- Otherwise everything worked on the first real run against Postgres - no other bugs found by these tests, which honestly would've been a little more interesting to write about, but good news for the app.

### What to manually verify

Run `npm test` in `server/` after installing dependencies - all 4 tests should pass. Also worth glancing at your `User`/`Application` tables in Postgres right after a test run to confirm no leftover `test_...@example.com` rows or "Test Co" applications got left behind.

**Confirmed working in my own test environment** - ran the suite twice in a row to make sure re-running doesn't break anything (it doesn't, since the test email is timestamped), and manually checked the database afterward to confirm cleanup actually happened both times.

### Uncertain / worth double-checking

- These 4 tests are a small starting set, not full coverage - things like resume upload, status history, the AI analysis endpoint, and ownership checks (one user hitting another user's data) aren't covered yet. Fine for what was asked, but worth knowing the gap is there if this gets graded on test coverage specifically.

## Deployment Prep — Docker, Cross-Domain Cookies & README

Not a numbered phase, just getting the app ready to actually deploy (backend on Render, frontend on Vercel).

### What was built

`server/Dockerfile` - installs deps, runs `npx prisma generate` (needs to happen before the TS build since the routes import types off the generated client), compiles with `tsc`, then on container start runs `npx prisma migrate deploy` before starting the server. `migrate deploy` is safe to run every time the container boots since it only applies migrations that haven't run yet - didn't want to rely on remembering to run migrations by hand against production. Used `node:20-slim` instead of the default `node:20` image to keep it smaller, and had to explicitly install `openssl` in it since Prisma's query engine needs it and the slim image doesn't include it by default.

`client/Dockerfile` - a two-stage build: builds the Vite app in a `node:20-slim` stage, then copies just the compiled `dist/` folder into an `nginx:alpine` stage to actually serve it. Keeps the final image small since it doesn't carry `node_modules` around. (Note: Vercel doesn't actually need this Dockerfile - it builds the Vite app directly - but adding it anyway in case the frontend ever needs to run somewhere else.)

Added a `.dockerignore` to both `server/` and `client/` (skips `node_modules`, `dist`, `.env`) so those don't get copied into the build context.

Checked `client/src/api/client.ts` - it already reads `VITE_API_URL` from the environment with a localhost fallback, so nothing needed to change there. Just need to set `VITE_API_URL` to the real backend URL (including the `/api` part) as an env var on Vercel.

Fixed the auth cookie settings in `auth.routes.ts` for production: `sameSite` was hardcoded to `"lax"`, which only works when frontend and backend share a domain. Since the backend (Render) and frontend (Vercel) will be on different domains, the cookie needs `sameSite: "none"` to be sent cross-site - and browsers require `secure: true` any time `sameSite` is `"none"`, so both are now tied to `NODE_ENV === "production"` together instead of just `secure` being conditional like before. Local dev keeps `lax` + non-secure since everything's on localhost there.

Rewrote `README.md` with an actual problem statement, a features list, the tech stack with a one-line reason for each choice, a "Live App" section (placeholder link until it's actually deployed), and a "Known Limitations" note about resumes being stored on local disk (`server/uploads/`) - which won't survive a restart on most free hosting tiers, since the filesystem isn't persistent there.

### Libraries introduced

- None - Docker itself isn't a library, and no new npm packages were needed for any of this.

### Errors hit and how they were fixed

- Tried to actually run `docker build` on both Dockerfiles in my own test environment to confirm they work, but it couldn't pull the `node:20-slim` base image - that environment's network doesn't allow reaching Docker Hub at all (confirmed it's a deliberate policy block, not a flaky connection, same kind of restriction I've hit before with Prisma's binary downloads). So neither Dockerfile has actually been build-tested end to end - reviewed both carefully by hand instead. Worth an actual `docker build .` in each folder on your machine before trusting these on Render.

### What to manually verify

1. `cd server && docker build -t hiregrid-server .` - should complete without errors. This hasn't been tested for real yet (see above).
2. `cd client && docker build -t hiregrid-client .` - same, untested so far.
3. Once deployed: sign up on the live URL, add an application with a resume + job description, confirm the AI analysis shows up, check the dashboard, then log out and log back in - this exercises the cross-domain cookie fix, which is the part most likely to break in production if something's off.
4. Double check `CLIENT_URL` on the backend (Render) matches the actual Vercel URL exactly, and `VITE_API_URL` on the frontend (Vercel) matches the actual Render URL plus `/api` - a mismatch here is the most likely source of CORS or cookie problems.

### Uncertain / worth double-checking

- Neither Dockerfile has been build-tested for real (see "Errors hit" above) - they're written correctly as far as I can tell from reading them closely, but an actual `docker build` might still turn up something I didn't catch by eye.
- Haven't set `binaryTargets` in `schema.prisma`. Shouldn't be needed since `prisma generate` runs inside the container itself during the Docker build (so it always generates for the container's own platform), but flagging it in case the deployed container ever throws a "query engine not found" error - that's the first thing to check.
