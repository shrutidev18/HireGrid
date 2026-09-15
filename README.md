# HireGrid

An AI-powered job application tracker. It keeps every application a job seeker
has sent in one place, and uses AI to analyse how well a resume matches a given
job description — producing a match score, the skills that are missing, ATS
keyword gaps, and concrete suggestions for tailoring the resume.

> **Status:** in progress. Auth, application tracking with a status pipeline and
> timeline, resume upload with text extraction, and the async AI analysis
> pipeline are all working. The dashboard and the searchable table view are
> still to come. See [`BUILD_LOG.md`](./BUILD_LOG.md) for the full record of
> what exists and why each choice was made.

## Tech stack

**Client** — React 18, TypeScript, Vite, Tailwind CSS v4, React Router,
TanStack Query, TanStack Table, Recharts, Axios

**Server** — Node.js, Express 5, TypeScript, Prisma ORM, Zod, JWT + bcrypt,
Multer, pdf-parse, mammoth, BullMQ

**Infrastructure** — PostgreSQL 15, Redis 7, Docker Compose, Google Gemini API

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 LTS | `node -v` — npm ships with it |
| Docker Desktop | latest | Runs PostgreSQL and Redis. Needs WSL2 on Windows |
| Git | any recent | |

## Getting started

```bash
# 1. Start PostgreSQL and Redis
docker compose up -d
docker compose ps          # wait until both report "healthy"

# 2. Configure the server
cd server
cp .env.example .env       # Windows PowerShell: Copy-Item .env.example .env
# then edit .env — set a real JWT_SECRET and GEMINI_API_KEY
npm install
npm run dev                # → http://localhost:4000

# 3. Start the analysis worker (in a second terminal)
cd server
npm run worker             # processes AI analysis jobs from the queue

# 4. Configure the client (in a third terminal)
cd client
cp .env.example .env       # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run dev                # → http://localhost:5173
```

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Get a free `GEMINI_API_KEY` at <https://aistudio.google.com/app/apikey>.

Open <http://localhost:5173> and sign up.

> **Three processes, not two.** The API, the analysis worker and the web client
> each run in their own terminal. The worker is separate on purpose: a slow AI
> call must not occupy an HTTP connection, and the worker can be restarted or
> scaled independently. If analyses stay stuck on "Analyzing…", the worker is
> not running.

## Project layout

```
hiregrid/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── api/            # Axios instance + one module per API resource
│       ├── components/     # Reusable UI built with Tailwind utilities
│       ├── context/        # AuthContext
│       ├── hooks/          # React Query hooks — all server state
│       ├── pages/          # Route-level components
│       └── types/          # Shared TypeScript interfaces
│
├── server/                 # Express + Prisma API
│   ├── prisma/             # schema.prisma and migrations
│   └── src/
│       ├── config/         # env validation, db and redis clients
│       ├── controllers/    # Request handlers
│       ├── middleware/     # Auth, error handling, uploads
│       ├── queues/         # BullMQ queue and worker
│       ├── routes/         # Route definitions only — no logic
│       ├── services/       # Business logic
│       └── utils/          # Errors, hashing, Zod schemas
│
├── docker-compose.yml      # PostgreSQL + Redis
├── BUILD_LOG.md            # Phase-by-phase build record
└── README.md
```

Requests flow **route → controller → service**. Routes stay declarative,
controllers handle the request and response, and services hold the business
logic and database access.

## Scripts

Run from `server/`:

| Command | Does |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm run worker` | Start the AI analysis worker (a separate process — required for analyses to run) |
| `npm test` | Run the test suite |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create and apply a migration |
| `npm run prisma:studio` | Browse the database in a GUI |

Run from `client/`:

| Command | Does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on :5173 |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |

## Docker

```bash
docker compose up -d      # start
docker compose ps         # status
docker compose logs -f    # follow logs
docker compose down       # stop, keeping data
docker compose down -v    # stop and DELETE all data
```

## Troubleshooting

**"Cannot reach the API server" on the client** — the API is not running, or
`VITE_API_URL` does not match the server's `PORT`. Vite inlines env variables at
startup, so restart `npm run dev` after editing `client/.env`.

**A CORS error in the browser console** — `CLIENT_URL` in `server/.env` must
match the browser's origin exactly: scheme, host, port, no trailing slash.

**"Port 5173 is already in use"** — an old dev server is still running. On
Windows: `netstat -ano | findstr :5173`, then `taskkill /PID <pid> /F`.

**Server exits with "Invalid environment configuration"** — working as intended.
It names the variables that are missing or malformed; fix them in `server/.env`.

**`docker compose up` fails on Windows** — Docker Desktop must be running and
WSL2 enabled.

**An analysis is stuck on "Analyzing…"** — the worker is not running. Start it
with `npm run worker` in `server/`. The API queues jobs; only the worker
processes them.

**An analysis comes back FAILED** — check the worker's terminal. The usual
causes are an invalid `GEMINI_API_KEY`, a `GEMINI_MODEL` your key cannot
access, or the free tier's rate limit. The application itself is unaffected;
press **Retry analysis**.
