# Session Handoff — Resume From Scratch

**Last updated:** 2026-11-13
**Active branch:** `feature/document-intelligence`
**Role running this work:** Manager (coordinates; delegates code to specialist agents). Person 2 owns the shared contract and the document-intelligence backend. Person 1 owns the UI and consumes the contract.

---

## 1. Get the code

```bash
git clone https://github.com/HomeBreadJohn/ABOT.git
cd ABOT
git checkout feature/document-intelligence
npm install
```

Branches:
- `main` — base only.
- `feature/shared-foundation` — Part A (contracts, schema, server helpers). Pushed. PR open to `main` for Person 1 review.
- `feature/document-intelligence` — Part B (the pipeline). **This is the active branch.** Built on top of the shared foundation.
- `feature/platform` (origin) — Person 1's UI branch; has competing contract/migration files to be dropped on their rebase (see `docs/contracts/README.md` section 9).

## 2. Recreate `.env.local` (git cannot carry it — it is gitignored)

Copy `.env.example` to `.env.local` and fill in real values:

```
NEXT_PUBLIC_SUPABASE_URL=            # ABOT project API settings
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # ABOT project API settings
SUPABASE_SERVICE_ROLE_KEY=           # ABOT project API settings (server-only)
SUPABASE_DB_PASSWORD=                # ABOT database password
LUMEN_API_KEY=                       # from Lumen Organization Portal
LUMEN_API_SECRET=                    # from Lumen Organization Portal
LUMEN_OCR_BASE_URL=https://api.staging.nonlive.lumen.bayanichain.tech/ocr
LUMEN_AI_CHAT_BASE_URL=https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat
LUMEN_AI_INSTANCE_ID=707a5232-db45-47a2-a2f3-a1290315f70f
JOB_RUNNER_SECRET=                   # any long random string; pipeline STALLS silently if unset
PROVIDER_MODE=mock                   # mock (default) until a real Lumen run is approved
```

Notes:
- Only `LUMEN_API_KEY` and `LUMEN_API_SECRET` are the Lumen secrets you hold. The base URLs and instance id above are not secret.
- `JOB_RUNNER_SECRET` must be set or enqueued jobs never auto-run (QA defect 2). Any long random string works locally.
- Keep `PROVIDER_MODE=mock` for now. Switch to `lumen` only for an approved real run.

## 3. Connect to the hosted database (no local Docker)

The project uses the hosted Supabase project **ABOT**, ref `kzgtnfpgtnuefekpnaxx`. It is already migrated.

```bash
npx supabase login            # opens a browser; approve
npx supabase link --project-ref kzgtnfpgtnuefekpnaxx
```

DO NOT run `supabase db reset`. The schema is live (three migrations plus two fixes). To apply a NEW migration later, use `npx supabase db push --remote` (it will ask for production consent).

## 4. Verify the checkout is healthy

```bash
npm run test        # expect 271 passing (unit; integration tests excluded)
npm run typecheck   # clean
npm run lint        # clean
npm run build       # compiles, ~9 API routes
```

Integration tests (hosted DB, not in the default run), run only when needed and not while someone else uses the DB:
```bash
npm run test:rls                                         # 8 RLS checks
npx vitest run src/test/pipeline-db.integration.test.ts  # 4 DB-backed pipeline checks
```

## 5. What is done

- **Part A (shared foundation):** contracts (`src/contracts/`, schema v1.0.0), Supabase schema + RLS (live), route helpers (`requireUser`, `withApiErrors`, redacting logger), provider env. Security-reviewed; fixes applied. Handoff for Person 1 in `docs/contracts/README.md`.
- **Phase 1:** lifecycle transitions (B1), durable job runner + tick route (B2), with the retry-delay + handler-registration fix.
- **Phase 2:** document registration + verified direct-to-Storage upload (B4), mock-backed OCR/analyze pipeline (B5), document/analysis endpoints (B6). QA-verified; two defects fixed (nullable finding severity; `JOB_RUNNER_SECRET` requirement documented).
- **Phase 3:** Lumen OCR client + schemas + page normalization (B7–B9), built from `docs/lumen/` and one captured real staging response in `src/lib/lumen/__fixtures__/ocr/`.
- **Phase 4 leaf tasks:** chunking (B11), evidence mapping (B14), safety rules (B15), category modules + classification (B10).

## 6. Where to resume

Next task: **B12 — Lumen AI Chat client + schemas** (build from `docs/lumen/ai-chat-api.md` + `ai-chat-openapi.yaml`, unit-tested with fixtures, zero live calls). Then **B13** (hybrid analysis engine) and **B16** (wire the real engine in), followed by B17–B19 (corrections, reanalysis, language), B20–B23 (conversations, cross-document, reminders), and B24–B25 (evals, security + readiness).

The full ordered plan is `docs/superpowers/plans/2026-11-12-person-2-end-to-end.md`.

## 7. Open decision for B12/B13

The AI Chat instance "PLP-Hackathon-Blank" has NO preset persona, so every instruction (including strict-JSON) must go in each message (max 4000 chars, 5 credits each). Decide:
- **A (recommended):** build B12 + the engine against mocks for zero credits; validate with ONE real end-to-end run on the existing sample document only when the engine is complete and approved.
- **B:** spend ~5 credits now on one real AI message to confirm the blank instance returns parseable JSON before building the engine.

## 8. Lumen credit discipline (IMPORTANT)

Access is limited. Spent so far: ~3 credits (two grant checks + one OCR pages capture). NO real OCR upload (6 credits) and NO real AI message (5 credits) have been made yet. Build everything from `docs/lumen/` and captured fixtures with no network calls; make real calls only when an engine is complete and the user approves, and make them once.

Grants confirmed active: OCR and AI Chat. The org has one ACTIVE AI Chat instance (id above). The OCR org already contains READY sample documents usable as read-only fixtures.

## 9. How this work is run

- The Manager delegates each plan task to the `fullstack` agent, has `qa` verify, and `security` review security-sensitive tasks. Agents run on model `omniroute/kr/auto`.
- Rule: never let two agents edit the same file; independent leaf tasks may run in parallel.
- Every agent is told to load `ponytail` + `test-driven-development` (fullstack), `verification-before-completion` (qa), or `owasp-security` (security) before other work, and to name the skills it loaded.
- `.kiro/` stays untracked (user decision).
- Nothing is committed/pushed without the user's go-ahead for remote or destructive actions.

## 10. Flags carried forward

- Evidence fuzzy-match threshold is 0.7 char-bigram Dice (`FUZZY_THRESHOLD` in `evidence-mapping.ts`), chosen so the plan's own example matches. Do not hardcode a conflicting value in B13/B16.
- B11 and B14 use local input types to avoid a parallel-build race; B13 must confirm `NormalizedPage` is structurally compatible at the call site.
- OCR confidence from the real engine is often `{measured:false}` (no numeric score) → normalized to `null`. B16 review logic must treat "not measured" on a critical field as a reason to flag for review, not as high confidence.
- B16 safety rule 7 appends to `nextSteps` while that list is iterated; a payment-match finding located directly in `nextSteps` could drop its appended step. Handle when the engine assembles results.
- Security flags for later: B2 tick route uses a constant-time secret compare (done); B5 OCR handlers read the provider id from the job payload, not `documents.ocr_document_id` (done); B20 conversation RLS currently requires document ownership, so a share recipient cannot open their own conversation on a shared document — decide deliberately in B20.
