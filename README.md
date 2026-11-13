# ABOT — understanding, within reach

ABOT is a secure, document-centric AI workspace. A user uploads an important
document — a bill, a government form, a contract, a medical or school paper —
and ABOT reads it, explains it in plain language, and shows the exact text that
backs every statement. The name is a play on the Filipino *abot* ("within
reach") and "a bot": **abot-kamay na pag-unawa**, understanding brought within
reach.

The guiding principle is **never present a guess as a fact**. Every finding is
labelled as explicitly found or inferred, every important claim is tied to an
exact quote from the document, and the AI is never allowed to claim it acted on
the user's behalf.

---

## What it does

- **Upload** a PDF, JPEG, PNG, TIFF or WebP (up to 10 MiB). Files go straight
  from the browser to private storage via a signed URL — the API never receives
  the raw bytes, and the file type is verified by magic bytes, not the client's
  claim.
- **OCR** reads the document page by page (via Lumen OCR).
- **Classify** the document into a category (government, financial, utilities,
  legal, medical, employment, education, personal, other).
- **Analyze** it into a structured report: an overview, key information,
  obligations, watch-outs, consequences, next steps and important dates — each
  finding carrying a status (FOUND / INFERRED / UNCLEAR / …), a confidence
  score, and evidence that points at the exact OCR words.
- **Review when uncertain**: a money amount, deadline or penalty read with low
  OCR confidence is flagged for the user to confirm before the report is treated
  as validated.
- **Corrections**: the user can fix an OCR mistake; corrections are stored
  separately from the original OCR and trigger a targeted re-analysis.
- **Ask follow-up questions** grounded in the document's own evidence.
- **Language**: switch the explanation between English, Filipino and Taglish
  without re-running OCR or analysis.
- **Cross-document analysis**: compare 2–5 of your own documents (e.g. does this
  receipt settle that bill) using each document's compact findings, with every
  conclusion cited back to a source page.
- **Reminder suggestions** derived from the document's important dates.

---

## How it works (architecture)

A modular monolith inside a Next.js App Router app.

- **`src/contracts/`** — the single source of truth. Every shared Zod schema
  (the analysis result, the API request/response shapes, the lifecycle enums)
  lives here and is validated at every boundary.
- **Supabase** — Postgres (with row-level security), Auth, and private Storage.
  Users get read-only access to pipeline tables through RLS; all pipeline writes
  go through a service-role worker after an explicit ownership check.
- **Durable background jobs** — a `processing_jobs` table plus a
  secret-protected tick route drive OCR and analysis in short, resumable bursts.
  If the user closes the tab or a worker crashes, the job resumes; idempotency
  keys stop a retry from creating a duplicate analysis.
- **Providers behind interfaces** — OCR and AI Chat sit behind provider
  interfaces with deterministic **mock** implementations, so the whole pipeline
  runs and is fully tested without any credentials or credits. `PROVIDER_MODE`
  selects `mock` (default) or `lumen`.
- **The analysis engine is hybrid and defensive.** The AI *proposes* candidate
  findings with exact quotes; deterministic, unit-tested code then *disposes*:
  it maps each quote back to the OCR text (a fabricated quote maps to nothing and
  is dropped, and the finding is downgraded), enforces the fact-vs-inference
  boundary, caps unsupported severities, and neutralizes unevidenced fraud
  wording. The excerpt a user sees is always rebuilt from OCR words, never from
  the AI's text.

### Tech stack

Next.js 16 (App Router) · TypeScript strict · Zod 4 · Supabase (Postgres, Auth,
Storage, RLS) · Tailwind CSS v4 · Vitest · Lumen OCR + AI Chat (staging).

---

## Setup

### Requirements

- Node.js 20.9+
- npm
- A Supabase project (the app uses a hosted project; local Docker is optional)
- Lumen staging credentials (only needed for real OCR/AI; the app runs fully on
  mock providers without them)

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in:

```bash
# Supabase (from your project's API settings)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only; never exposed to the browser

# Pipeline providers: "mock" (default) or "lumen"
PROVIDER_MODE=mock

# Required only when PROVIDER_MODE=lumen (base URLs must be https)
LUMEN_API_KEY=
LUMEN_API_SECRET=
LUMEN_OCR_BASE_URL=
LUMEN_AI_CHAT_BASE_URL=
LUMEN_AI_INSTANCE_ID=

# Any long random string. REQUIRED — if unset, enqueued jobs never auto-run
# and documents stall silently in processing.
JOB_RUNNER_SECRET=
```

### 3. Run

```bash
npm run dev
```

Open the app, register or sign in, and you land on the real product at
`/dashboard`. Upload a document to run the pipeline. A sample fictional document
you can upload is at `sample-docs/sample-utility-bill.pdf`.

With `PROVIDER_MODE=mock` the whole flow works end to end with deterministic mock
OCR/analysis and spends no credits — the best way to see the product. Set
`PROVIDER_MODE=lumen` with real credentials to use the live Lumen APIs.

### 4. Verify

```bash
npm run test        # unit + component tests (mock mode, no network)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production build

# Excluded from the default run (opt in explicitly):
npm run test:evals  # hallucination / long-document / cost evaluations
```

Integration tests that hit the live Lumen staging API carry the
`*.integration.test.ts` suffix and are excluded from the default `npm run test`.

---

## Project status

**Working and verified end to end against live infrastructure:**

- Upload → private Storage → verified completion.
- OCR reads real documents (confirmed against live Lumen OCR).
- The full job pipeline, the analysis engine, corrections, conversations,
  cross-document analysis, language switching and reminder suggestions — all
  implemented and tested.
- The real wired product UI at `/dashboard`.
- The full unit/component suite passes (`npm run test`), with typecheck, lint and
  build clean.

**Known external blocker (not a code issue):**

- Real AI analysis requires a Lumen AI Chat instance configured to analyze
  document content. The hackathon-provisioned instance
  (`PLP-Hackathon-Blank`) is a blank instance that **refuses to analyze
  document data** — it returns a canned "outside what this assistant covers"
  reply. We verified directly against the live gateway that our messages are
  accepted (HTTP 200) and the only blocker is the instance's content policy.
  Point `LUMEN_AI_INSTANCE_ID` at a persona-configured instance and real
  analysis completes with no code changes. Until then, use `PROVIDER_MODE=mock`
  to see analysis work end to end.

**Notes:**

- Lumen's AI Chat message limit is ~2000 characters in practice (the published
  docs say 4000); prompts are budgeted to stay safely under the real limit.
- Two database migrations
  (`20261117000000_ocr_corrections_word_range`,
  `20261118000000_conversation_recipient_rls`) must be applied to the hosted DB
  (`npx supabase db push`) before corrections and conversations work on real
  data. Core upload → OCR → analysis uses already-migrated tables.

---

## Safety and privacy

- Document text, OCR words, AI messages and secrets are never written to logs —
  logging uses an explicit key allowlist.
- Every route derives the user from the Supabase session; client-supplied owner
  IDs are never trusted. A document that isn't yours returns `NOT_FOUND`, not
  `FORBIDDEN`, so its existence isn't revealed.
- Document text is wrapped as untrusted data in every AI prompt, and the AI's
  output carries no authority: unsupported findings are downgraded, fabricated
  quotes are dropped, and ABOT never claims to submit, sign, pay or contact
  anyone on the user's behalf.
