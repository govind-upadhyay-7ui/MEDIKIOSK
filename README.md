# MediKiosk — AI Clinical History Platform

An AI-assisted patient kiosk, doctor dashboard, and admin console for Indian
hospitals, PHCs, CHCs, and AYUSH centres. Built with Next.js 15, TypeScript,
Tailwind CSS, and a hand-rolled shadcn-style component library.

This README is honest about what's real, what's mocked, and what you need to
supply to make each integration live. Read the **"What's real vs. mocked"**
section before you assume anything works end-to-end out of the box.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in the keys you want to test (see below)
npm run dev
```

Open http://localhost:3000. The patient kiosk starts at `/language`; staff
login is at `/login` (demo accounts below).

```bash
npm run build && npm run start   # production build
npm run test                     # vitest unit tests
npm run lint                     # eslint
npx tsc --noEmit                 # type check
```

### Demo staff accounts (password: `password123` for all)

| Role | Email |
|---|---|
| Admin | admin@medikiosk.local |
| Doctor | doctor@medikiosk.local |
| Nurse | nurse@medikiosk.local |
| Receptionist | reception@medikiosk.local |

---

## What's real vs. mocked

This matters — please read it before testing.

### Real, works today with your own credentials
- **JWT auth + RBAC** (`src/lib/auth.ts`, `middleware.ts`) — real `jose`-signed
  HttpOnly session cookies, real bcrypt password hashing, real role-based
  route protection on `/doctor/*` and `/admin/*`.
- **Rule-based emergency/triage engine** (`src/lib/triageEngine.ts`) — real
  keyword-pattern red-flag detection, real U/C/Y lane resolution, real token
  generation. No external API needed; has a full unit test suite
  (`tests/triageEngine.test.ts`).
- **OCR** (`src/lib/ocr.ts`) — real `tesseract.js` (WASM), runs on JPG/PNG
  uploads with zero system dependencies. PDFs are accepted but OCR is skipped
  for them (see the comment in the file for how to add PDF rasterization).
- **Offline queue / PWA** (`src/lib/offlineQueue.ts`, `public/sw.js`) — real
  IndexedDB-backed queue with background sync on reconnect.
- **QR token generation** (`src/components/shared/QRToken.tsx`) — real
  client-side QR rendering via the `qrcode` package.

### Real integration code, but **you must supply credentials** and test locally
- **AI clinical intake + summary generation** (`src/lib/ai.ts`) — calls the
  real Anthropic API via `@anthropic-ai/sdk`. Set `ANTHROPIC_API_KEY` in
  `.env.local`. Without it, `/history-chat` will show an error and the
  patient can still fall back to the structured history forms.
- **Bhashini voice (ASR/TTS)** (`src/lib/bhashini.ts`) — calls the real
  MeitY/Bhashini ULCA pipeline endpoints as documented publicly. Set
  `BHASHINI_USER_ID`, `BHASHINI_ULCA_API_KEY`, and optionally
  `BHASHINI_PIPELINE_ID` in `.env.local`. **This code was written against
  Bhashini's published API contract but has not been exercised against a
  live Bhashini account in the environment that generated this project** —
  smoke-test it with your own credentials, and check field names against the
  current Bhashini docs/Postman collection if a call 4xxs.

### Mocked (by design, for this milestone)
- **Database** — `src/lib/db/mockDb.ts` is an in-memory store seeded from
  `src/data/mockData.ts` (50 realistic patient cases, 10 doctors, 3
  hospitals). It resets on every server restart. A matching
  `prisma/schema.prisma` is included so swapping to real Postgres is a
  data-layer change, not a redesign — see "Moving to the real backend" below.
- **File storage** — uploaded documents are processed (OCR runs for real)
  but not persisted to real object storage; `storageKey` is a synthetic
  value. See the comment in `src/app/api/documents/upload/route.ts` for the
  ~5-line change to point it at real MinIO.
- **Rate limiting** — in-memory token bucket (`src/lib/rateLimit.ts`).
  Fine for a single Node process; swap for Redis before scaling horizontally.

---

## Project structure

```
src/
  app/
    (kiosk)/          patient-facing flow: language -> consent -> register ->
                       department -> history-chat -> history-core ->
                       history-extended -> ayush (if AYUSH) -> documents ->
                       summary. emergency/ and voice/ are branch screens.
    doctor/            dashboard, queue, patient list, case screen
    admin/             overview, doctors, analytics, audit logs, settings
    api/               all "backend" routes -- see below
    login/             staff login
  components/
    ui/                hand-rolled shadcn-style primitives (button, card, ...)
    layout/            Navbar, Footer, KioskShell, DoctorSidebar, AdminSidebar
    shared/            Stepper, TokenBadge, LanguageSelector, FileUpload,
                       VoiceRecorder, SummaryCard, AlertCard, QRToken, ...
  lib/                 auth, triage engine, AI, Bhashini, OCR, rate limit,
                       offline queue, mock DB
  store/               Zustand stores (kiosk session, UI prefs, auth)
  hooks/               React Query hooks wrapping the API routes
  data/mockData.ts     seeded mock patients/doctors/hospitals/analytics
  types/index.ts       the single source of truth for all data shapes
prisma/schema.prisma   reference Postgres schema for the future backend
docker/                docker-compose.yml + nginx.conf reference
tests/                 vitest unit tests (triage engine, utils)
```

---

## The U / C / Y triage system

- **U (Urgent)** — any red flag detected by the rule engine or the AI, or the
  patient selected "Emergency" as their department. Always sorted first.
- **C (Clinical OPD)** — general/specialist outpatient care.
- **Y (AYUSH)** — Ayurveda, Yoga, Unani, Siddha, Homeopathy.

The queue (`/doctor/queue`, `/api/queue`) always sorts `U > C > Y`, then by
longest wait within a lane. See `sortByQueuePriority` in
`src/lib/triageEngine.ts`.

---

## Moving to the real backend (FastAPI + PostgreSQL + MinIO)

This app was deliberately built so that swap is contained:

1. **Database**: stand up Postgres, run `npx prisma migrate dev` against
   `prisma/schema.prisma`, then replace the function bodies in
   `src/lib/db/mockDb.ts` with real Prisma calls (or `fetch()` calls to a
   separate FastAPI service -- the choice is yours). No other file imports
   the mock data directly except the API routes, which already call through
   `mockDb.ts`.
2. **File storage**: swap the body of
   `src/app/api/documents/upload/route.ts` for an `@aws-sdk/client-s3`
   `PutObjectCommand` against your MinIO endpoint (see the comment in that
   file for the exact snippet).
3. **If you want a separate FastAPI service** instead of Next.js API routes:
   the routes under `src/app/api/*` define the exact request/response
   contract already in use by the frontend (via `src/hooks/useQueries.ts`).
   Reimplement the same paths/shapes in FastAPI, then either (a) proxy
   `src/app/api/*` to the FastAPI service, or (b) point
   `src/hooks/useQueries.ts` at the FastAPI base URL directly and delete the
   Next.js route handlers.
4. **Docker**: `docker/docker-compose.yml` already includes `postgres`,
   `minio`, and `nginx` services alongside `web` -- uncomment/wire the env
   vars once the above steps are done, then run
   `docker compose -f docker/docker-compose.yml up`.

---

## Known limitations / honest caveats

- Bhashini integration is unverified against a live account (see above).
- OCR skips PDFs (JPG/PNG only) until you add a page-rasterization step.
- The mock DB is in-memory and resets on restart -- don't use it for anything
  beyond local development and demos.
- Rate limiting is per-process, not distributed.
- This is a prototype for demonstration, not a certified medical device --
  it assists history-taking and triage prioritization; it does not diagnose.

---

## License

Prototype for demonstration purposes.
