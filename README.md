# HireGrid — AI-Powered Job Application Tracker

A full-stack app to track job applications and use AI to check how well your resume matches a job description. Built as a college project.

## The Problem

Job hunting usually means juggling a dozen+ applications across different companies, all at different stages, tracked in some messy spreadsheet (or not tracked at all). It's easy to lose track of what you applied to, when, and whether your resume actually matches what the job is asking for. HireGrid is a single place to log applications, move them through a status pipeline, and get an AI opinion on how well your resume matches a job description before you go further with it.

## Features

- Sign up / log in with a JWT-based session (httpOnly cookie)
- Add, edit and delete job applications (company, role, location, employment type, job description)
- Upload a resume (PDF) and attach it to an application
- Track status through a pipeline (Saved → Applied → Interview → Offer/Rejected), with a full status history
- AI-powered resume-vs-job-description match analysis (score, matched/missing skills, suggestions) via Google Gemini
- Search and filter applications by company/title and status
- Dashboard with total + per-status counts and recent activity
- Edit profile (name/email) and change password

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
job-tracker/
├── client/     # React frontend
├── server/     # Express backend
├── docker-compose.yml
└── BUILD_LOG.md
```

## Running Locally

1. Start Postgres:
   ```
   docker-compose up -d
   ```

2. Server setup:
   ```
   cd server
   cp .env.example .env   # fill in JWT_SECRET etc
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

See `BUILD_LOG.md` for a phase-by-phase log of what was built and why.

## Live App

**TODO: add the live URL here once it's deployed.**

## Known Limitations

- Uploaded resumes are saved to the server's local disk (`server/uploads/`), not to cloud storage. On free-tier hosting, the filesystem usually isn't persistent, so uploaded resumes can get wiped whenever the service restarts or redeploys. Fine for a student project/demo, but a real production app would want something like S3 or Cloudinary instead.
