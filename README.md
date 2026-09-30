# HireGrid — AI-Powered Job Application Tracker

A full-stack app to track job applications and use AI to check how well your resume matches a job description.

## The Problem

Job hunting usually means juggling a dozen+ applications across different companies, all at different stages, tracked in some messy spreadsheet (or not tracked at all). It's easy to lose track of what you applied to, when, and whether your resume actually matches what the job is asking for. HireGrid is a single place to log applications, move them through a status pipeline, and get an AI opinion on how well your resume matches a job description before you go further with it.

## Live Demo

https://hire-grid-gilt.vercel.app

Sign up with any email to try it.


## How It Works

**Sign up / log in.** Plain email and password. The session is a JWT stored in an httpOnly cookie, not localStorage, so it can't be read or stolen by client-side JS.

**Dashboard.** The landing page after login. Four stat cards (total applications, how many are still active, how many are in the interview stage, how many offers), a bar chart breaking applications down by status, a Quick Actions panel to jump to the common next steps, and a Recent Activity feed showing the last few things you did.

**Add an application.** Company, role, location, employment type, a link to the posting, and the full job description. You can optionally attach one of your uploaded resumes right here — if you do, and there's a job description to compare it against, the app sends both to Gemini in the background and comes back with a match score, a list of matched and missing skills, and a few suggestions, all visible on that application's details page a moment later.

**Applications list.** Every application you've logged, searchable by company or role, and filterable by status, so you're not scrolling through everything to find one.

**Application details.** Everything about a single application in one place: the info block (location, employment type, date applied, which resume is attached), the full job description and any notes you left, a status dropdown you can change at any point, and — if a resume was attached — the AI Resume Match card with the score, matched/missing skills as chips, and suggestions. Every status change also gets logged to that application's Status History, so you can see exactly when it moved from Applied to Interview, for instance.

**My Resumes.** Drag-and-drop PDF upload. Each resume gets its text extracted and stored once, so the same resume can be reused across multiple applications without re-uploading it every time. Download or delete from the same list.

**Profile.** Name and email, plus optional fields — target role, experience level, education, graduation year, and a list of skills — that feed into a profile completion percentage shown as a progress ring, alongside a checklist of what's still missing. Password changes live on the same page.

## Features

- Sign up / log in with a JWT-based session (httpOnly cookie)
- Add, edit and delete job applications
- Upload a resume (PDF), with the text extracted so it can be reused across applications
- AI-powered resume-vs-job-description match analysis (score, matched/missing skills, suggestions) via Google Gemini, run automatically when a resume is attached
- Status pipeline (Saved → Applied → Interview → Offer/Rejected) with a full history of every change
- Search and filter applications by company/title and status
- Dashboard with per-status counts, a breakdown chart, and recent activity
- Profile with career/education/skills fields and a completion tracker
- Change password

## Design

Restyled to match a reference dashboard design partway through the project , a consistent light blue theme, card-based layout with rounded corners and soft shadows, and a white sidebar with a soft highlight on the active page, applied across every page including login and signup. Tailwind only, no separate UI library.

## Tech Stack

- **React + TypeScript** — component-based UI, and TypeScript catches typos/type mismatches before they become runtime bugs.
- **Vite** — much faster dev server and hot reload than older tooling, and the standard choice for new React projects now.
- **Tailwind CSS** — utility classes meant not writing and naming a separate CSS file for every component.
- **React Router** — client-side routing between pages (login, dashboard, applications, etc.) without full page reloads.
- **Axios** — cleaner request/response handling than the built-in fetch, and `withCredentials` makes sending the auth cookie easy.
- **Node.js + Express** — simple, well-documented backend framework, a good fit for a REST API this size without extra framework overhead.
- **TypeScript (backend)** — same reasoning as the frontend, and pairs well with Prisma's generated types.
- **Prisma ORM** — write the schema once, get a type-safe client and migrations for free instead of hand-writing raw SQL.
- **PostgreSQL** — solid relational database, a good fit since the data (users, applications, resumes, status history) is naturally relational.
- **Google Gemini API** — free tier available, used for the resume-vs-job-description match analysis.
- **JWT + httpOnly cookies** — standard way to keep a user logged in across requests without storing anything sensitive in localStorage.
- **Multer + pdf-parse** — handles the resume PDF upload and pulls text out of it so it can be sent to Gemini.
- **Docker** — packages the app so it runs the same way locally and on the hosting platform, instead of hoping the two environments match.

## Project Structure

```
HireGrid/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   ├── context/
│   │   └── types/
│   ├── Dockerfile
│   ├── vite.config.ts
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── utils/
│   │   ├── config/
│   │   └── __tests__/
│   ├── prisma/
│   ├── uploads/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── BUILD_LOG.md
└── README.md
```

## Prerequisites

- Node.js 20 or later
- Docker + Docker Compose (for a local Postgres instance) or your own Postgres if you'd rather skip Docker
- A free Gemini API key from https://aistudio.google.com/apikey

## Running Locally

1. Start Postgres:
   ```
   docker-compose up -d
   ```

2. Server setup:
   ```
   cd server
   cp .env.example .env   # fill in the values, see Environment Variables below
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```
   Server runs on http://localhost:5000

3. Client setup (new terminal):
   ```
   cd client
   cp .env.example .env
   npm install
   npm run dev
   ```
   Client runs on http://localhost:5173

## Environment Variables

**server/.env**

- `DATABASE_URL` — Postgres connection string. The default in `.env.example` already matches `docker-compose.yml`, so leave it as-is if you're using Docker.
- `JWT_SECRET` — any random string, used to sign the login token. Don't reuse a real secret from somewhere else.
- `GEMINI_API_KEY` — your own Gemini API key.
- `GEMINI_MODEL` — defaults to `gemini-3.5-flash-lite`, which works fine on the free tier.
- `PORT` — defaults to 5000.
- `CLIENT_URL` — wherever the frontend is running. `http://localhost:5173` for local dev; the real frontend URL in production (needed for CORS and cookies to work cross-domain).

**client/.env**

- `VITE_API_URL` — defaults to `http://localhost:5000/api`. Point this at the deployed backend URL (with `/api` on the end) in production.

## Running Tests

```
cd server
npm test
```

4 tests right now , signup with valid details, a login that fails with the wrong password, creating an application, and fetching it back by id. They run against your real local Postgres database rather than a separate test DB, and clean up whatever they create afterward.

## API Overview

Everything lives under `/api`. Auth routes are open; everything else needs a logged-in session (the JWT cookie), and every application/resume route is scoped to the logged-in user's own data.

- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/applications`, `POST /api/applications` (also runs the AI match if a resume + job description are given), `GET /api/applications/:id`, `PUT /api/applications/:id`, `DELETE /api/applications/:id`
- `GET /api/resumes`, `POST /api/resumes`, `DELETE /api/resumes/:id`
- `GET /api/dashboard`
- `GET /api/profile`, `PUT /api/profile`, `PUT /api/profile/password`

## Deployment

Backend is on Render (built from `server/Dockerfile`), frontend is on Vercel. Both auto-deploy on every push to `main`.

- Frontend: https://hire-grid-gilt.vercel.app
- Backend: https://hiregrid-zvfx.onrender.com/api

Two things worth knowing if you're forking this: the Dockerfile runs `npx prisma migrate deploy` on container start, so new migrations get applied automatically instead of needing to be run by hand against production. And the login cookie's `sameSite`/`secure` settings are tied to `NODE_ENV`, since the frontend and backend sit on different domains in production and browsers require `secure: true` whenever `sameSite` is `"none"`.

## Known Limitations

- Uploaded resumes are saved to the server's local disk (`server/uploads/`), not to cloud storage. Render's free tier doesn't persist the filesystem across restarts, so uploaded resumes can get wiped whenever the service redeploys or spins down from inactivity  the database still remembers an application was matched against a resume, it's just the actual file/download that goes missing. Fine for a demo, but a real production app would want S3 or Cloudinary instead.
- No forgot-password flow : if you lose the password on the live demo, the only option right now is signing up again with a different email.
- Test coverage is thin (4 tests). Resume upload, the AI analysis endpoint, and making sure one user can't see another user's data aren't covered yet.

## What I'd Add With More Time

- Move resume storage to S3 or Cloudinary so files actually survive a redeploy
- More backend tests, especially one proving user data is properly isolated
- Reminders/follow-up dates for applications sitting too long in one status
- Pagination on the applications list once there are enough applications for it to matter

## Author

Shruti — [github.com/shrutidev18](https://github.com/shrutidev18) · [LinkedIn](https://www.linkedin.com/in/shrutiidev)

## License

No formal license attached