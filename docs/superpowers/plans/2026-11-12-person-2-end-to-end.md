# Person 2 End-to-End Implementation Plan

> **For agentic workers:** The Manager delegates each task to `fullstack`, with `qa` verifying and `security` reviewing security-sensitive tasks (A5, A6, B2, B4, B6, B7, B25). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver everything Person 2 owns in `product.md`: first the shared foundation both developers build on, then the full document-intelligence pipeline from upload registration through OCR, analysis, evidence, corrections, language, conversations, cross-document analysis, and production readiness.

**Architecture:** A modular monolith inside the existing Next.js app. `src/contracts/` holds every shared Zod schema and is the single source of truth. Supabase stores documents, OCR pages, versioned analyses, findings, and evidence. A durable `processing_jobs` table drives background work: a claim function leases jobs, and a secret-protected tick route runs them in short bursts that fit within serverless time limits. Lumen OCR and AI Chat sit behind provider interfaces with deterministic mock implementations, so every phase can be tested without credentials.

**Tech Stack:** Next.js 16.4 App Router, TypeScript strict, Zod 4, Supabase (Postgres, Auth, Storage, RLS), Vitest (new), pgTAP via `supabase test db`, Lumen OCR and AI Chat (staging).

**Spec:** `docs/superpowers/specs/2026-11-12-person-2-document-intelligence-design.md`, which follows `product.md`.

## Global Constraints

- `src/contracts/` is the only home for shared application contracts. Person 1 consumes it and does not edit it. Changes go through Person 2 with a schema-version decision.
- Part A (shared foundation) is merged through a reviewed PR before Part B begins. Branches: `feature/shared-foundation`, then `feature/document-intelligence`.
- Person 2 does not build dashboard, vault, report, correction, chat, or reminder UI.
- Supported upload formats: PDF, JPEG, PNG, TIFF, WebP. Maximum 10 MiB (10485760 bytes) per document.
- Lumen staging origins: `https://api.staging.nonlive.lumen.bayanichain.tech/ocr` and `https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat`. Auth headers: `lumen-api-key`, `lumen-api-secret`.
- Lumen AI Chat message limit: 4,000 characters, including instructions.
- Do not infer undocumented Lumen request or response shapes. Provider response schemas are written only from official docs or captured staging responses.
- Lumen credentials, the service-role key, and document contents stay server-side. Logs never contain document text, OCR words, AI messages, or secrets.
- Never trust client-provided owner IDs. Every route derives the user from the Supabase session.
- Original OCR output and user corrections are stored separately. Corrections never overwrite OCR rows.
- A failed analysis is never returned as a completed report. Retries never duplicate findings or send uncontrolled duplicate AI requests.
- Inferred consequences are never presented as explicit. Unsupported findings are never presented as `FOUND`.
- Kalinga never claims to submit, sign, accept, pay, or contact anyone on the user's behalf.
- Edit `supabase/migrations/20261112000000_initial_schema.sql` never; add new migrations.
- Before writing any Next.js route or config, read the matching guide under `node_modules/next/dist/docs/`. Route handler `params` is a `Promise` in this version; `after` and `maxDuration` come from `next/server` and route segment config.

## Review Focus

- **A user uploads a 9 MB phone photo.** Vercel rejects function request bodies over 4.5 MB, so the file must go straight from the browser to Storage through a signed upload URL. Task A5 and B4 test that the API never receives file bytes.
- **A file is renamed to `.pdf` but is not a PDF.** The complete-upload step must check magic bytes, not the client MIME type. Task B4 tests a PNG renamed to `.pdf` and an executable renamed to `.png`.
- **The AI quotes text that is not in the document.** Evidence mapping must use the OCR text, not the AI's quote, and downgrade the finding to `UNCLEAR` when no match exists. Tasks B14 and B15 test a fabricated quote.
- **The user closes the tab during processing.** The job must keep running and resume after a timeout or crash, through lease expiry and the tick route. Task B2 tests an expired lease being reclaimed.
- **A worker crashes after persisting an analysis but before marking the job done.** A rerun must not create a second analysis version. Task B2 and B5 test idempotency keys on retry.

## Decisions made in this plan (review these)

These are my calls. Correct any of them before execution starts.

1. **Test runner:** Vitest for unit and integration tests, pgTAP through `supabase test db` for RLS. The repo has no test runner today.
2. **Upload flow:** The client asks for a signed upload URL, uploads directly to Storage, then calls a complete-upload endpoint. This avoids the 4.5 MB Vercel body limit.
3. **New lifecycle state `AWAITING_UPLOAD`:** A document row exists before its file arrives. Without it, a row would claim `UPLOADED` before the bytes exist.
4. **`NEEDS_CORRECTION` vs `REVIEW_REQUIRED`:** `NEEDS_CORRECTION` means a required review item blocks a validated report. `REVIEW_REQUIRED` means a report exists but the user should confirm optional items or an ambiguous category.
5. **`text/plain` is dropped** from allowed uploads. Lumen OCR does not list it, and it has no processing path.
6. **Full entity model in one shared migration**, including reminders, conversations, and relationships, so Person 1 has a stable schema from day one.
7. **Background work:** a durable job table, a `claim_processing_job` Postgres function, and a secret-protected tick route. It is triggered on enqueue, on status reads that see a stale job, and by a once-a-minute Supabase `pg_cron` call in deployed environments.
8. **Worker writes use the service-role client** after an explicit ownership check. Users get read-only access to pipeline tables through RLS. Users cannot write `processing_status`, analyses, findings, evidence, or jobs directly.
9. **Schema version `1.0.0`** for the first agreed analysis contract.
10. **Environment variables:** `LUMEN_API_KEY`, `LUMEN_API_SECRET`, `LUMEN_OCR_BASE_URL`, `LUMEN_AI_CHAT_BASE_URL`, `LUMEN_AI_INSTANCE_ID` (optional), `PROVIDER_MODE` (`mock` or `lumen`), `JOB_RUNNER_SECRET`. These replace `LUMEN_API_BASE_URL` and `LUMEN_MODEL`.
11. **Code layout:** follow the existing `src/features/<feature>/services` convention for server logic, `src/lib/lumen/` for the HTTP clients, and `src/lib/providers/` for the provider interfaces. This keeps the current structure instead of adding the `src/modules/` tree from `product.md`.

---

## Shared interfaces

Later tasks refer to these names. The task that creates each one owns its exact fields.

```ts
// src/contracts/common.ts  (Task A2)
documentLifecycleSchema   // AWAITING_UPLOAD | UPLOADED | OCR_PROCESSING | OCR_READY | OCR_PARTIAL | OCR_FAILED
                          // | ANALYZING | NEEDS_CORRECTION | REVIEW_REQUIRED | ANALYSIS_FAILED | COMPLETED
processingStageSchema     // RECEIVED | READING | UNDERSTANDING | CHECKING_DETAILS | PREPARING_REPORT
LIFECYCLE_TRANSITIONS: Record<DocumentLifecycle, readonly DocumentLifecycle[]>
canTransition(from: DocumentLifecycle, to: DocumentLifecycle): boolean
severitySchema, informationStatusSchema, documentCategorySchema,
relationshipTypeSchema, explanationLanguageSchema, allowedMimeTypeSchema
MAX_DOCUMENT_SIZE_BYTES = 10485760

// src/contracts/analysis.ts  (Task A3)
ANALYSIS_SCHEMA_VERSION = "1.0.0"
analysisResultSchema, findingSchema, evidenceReferenceSchema, reviewRequirementSchema
parseAnalysisResult(value: unknown, expected: { documentId: string }): AnalysisResult  // throws ContractError

// src/contracts/api.ts  (Task A4)
apiErrorCodeSchema, apiErrorSchema, API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number>
// one request and response schema per endpoint in the endpoint table

// src/lib/http/api-response.ts  (Task A6)
apiOk<T>(data: T, init?: ResponseInit): Response
apiFail(code: ApiErrorCode, message: string, issues?: ApiIssue[]): Response
withApiErrors(handler): handler   // maps thrown AppError and ZodError to apiFail
class AppError extends Error { code: ApiErrorCode }
requireUser(): Promise<{ userId: string; supabase: SupabaseServerClient }>

// src/lib/providers/ocr-provider.ts  (Task B3)
interface OcrProvider {
  submit(input: { bytes: Uint8Array; mimeType: AllowedMimeType; filename: string }): Promise<{ providerDocumentId: string }>
  getStatus(providerDocumentId: string): Promise<{ status: "PENDING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED" }>
  getPages(providerDocumentId: string): Promise<NormalizedPage[]>
  retry(providerDocumentId: string): Promise<void>
}
type NormalizedPage = { pageNumber: number; status: "READY" | "FAILED"; text: string;
  words: { index: number; text: string; confidence: number | null }[]; averageConfidence: number | null }

// src/lib/providers/chat-provider.ts  (Task B3)
interface ChatProvider {
  openSession(): Promise<{ sessionId: string; instanceId: string }>
  send(sessionId: string, message: string): Promise<{ reply: string }>   // message.length <= 4000
}

// src/features/processing/services/job-runner.ts  (Task B2)
type JobType = "OCR_SUBMIT" | "OCR_POLL" | "OCR_FETCH" | "ANALYZE" | "REANALYZE" | "TRANSLATE" | "CROSS_ANALYZE"
enqueueJob(input: { documentId: string; userId: string; type: JobType; idempotencyKey: string; payload?: Json }): Promise<{ jobId: string; created: boolean }>
runDueJobs(budgetMs: number): Promise<{ ran: number }>
registerJobHandler(type: JobType, handler: JobHandler): void
type JobHandler = (job: ClaimedJob, ctx: JobContext) => Promise<JobOutcome>
type JobOutcome = { kind: "done"; next?: EnqueueInput[] } | { kind: "retry"; afterMs: number; reason: string } | { kind: "fail"; errorCode: string }

// src/features/intelligence/services/analysis-engine.ts  (Task B5, replaced in B16)
interface AnalysisEngine { analyze(input: { documentId: string; pages: NormalizedPage[]; corrections: OcrCorrection[];
  language: ExplanationLanguage; category?: DocumentCategory }): Promise<AnalysisEngineResult> }
type AnalysisEngineResult = { result: AnalysisResult; outcome: "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION" }
```

---

# Part A: Shared foundation (defined by Person 2, reviewed by Person 1)

This part settles everything in `product.md` section 17 "Shared Responsibilities": contracts, database schema, lifecycle, endpoint formats, error handling, and mock data. Person 1 can start UI work against it as soon as Task A8 merges.

### Task A1: Branch, baseline, and test tooling

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `vitest.config.ts`, `src/test/server-only-stub.ts`, `src/test/smoke.test.ts`
- Commit as-is: `src/contracts/`, `todo-human.md` (currently untracked)

**Interfaces:**
- Produces: `npm run test` (Vitest, run once) and `npm run test:db` (`supabase test db`).

- [ ] **Step 1:** Create `feature/shared-foundation` from `main`. Commit the untracked `src/contracts/` and `todo-human.md` unchanged with message `chore: track draft contracts and human todo list`. Leave `.kiro/` untracked and ask the user whether it belongs in git.
- [ ] **Step 2:** Add `vitest` as a dev dependency. Configure `vitest.config.ts` with `environment: "node"`, the `@/` alias pointing to `src/`, and an alias for `server-only` to `src/test/server-only-stub.ts` (an empty module), so server modules can be imported in tests.
- [ ] **Step 3:** Add scripts `"test": "vitest run"` and `"test:db": "supabase test db"`.
- [ ] **Step 4:** Write `src/test/smoke.test.ts` that imports `mockUtilityBillAnalysis` from `@/contracts` and asserts `schemaVersion` is a string. Run `npm run test`. Expected: 1 passed.
- [ ] **Step 5:** Run `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit: `test: add vitest and database test scripts`.

### Task A2: Shared enums, lifecycle, and transitions

**Files:**
- Modify: `src/contracts/common.ts`
- Modify: `src/features/documents/schemas/upload.ts` (re-export from contracts instead of defining its own list)
- Test: `src/contracts/__tests__/common.test.ts`

**Interfaces:**
- Produces: everything listed under `src/contracts/common.ts` in Shared interfaces.

- [ ] **Step 1: Write failing tests.**
  - Each enum accepts exactly the values in Shared interfaces and `product.md` sections 3.2–3.4, 6.2, and 7. Lowercase, empty, and unknown values fail. Language enum: `EN`, `FIL`, `TAGLISH`.
  - `allowedMimeTypeSchema` accepts `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`, `image/webp` and rejects `text/plain`.
  - `canTransition` returns true for exactly these pairs and false for everything else:
    - `AWAITING_UPLOAD → UPLOADED`
    - `UPLOADED → OCR_PROCESSING`
    - `OCR_PROCESSING → OCR_READY | OCR_PARTIAL | OCR_FAILED`
    - `OCR_READY → ANALYZING`, `OCR_PARTIAL → ANALYZING | OCR_PROCESSING`, `OCR_FAILED → OCR_PROCESSING`
    - `ANALYZING → NEEDS_CORRECTION | REVIEW_REQUIRED | COMPLETED | ANALYSIS_FAILED`
    - `NEEDS_CORRECTION → ANALYZING`, `REVIEW_REQUIRED → ANALYZING | COMPLETED`
    - `COMPLETED → ANALYZING`, `ANALYSIS_FAILED → ANALYZING`
  - `ANALYSIS_FAILED → COMPLETED` is false (a failed analysis never becomes complete without rerunning).
- [ ] **Step 2:** Run `npm run test -- common`. Expected: FAIL.
- [ ] **Step 3:** Implement the schemas, `LIFECYCLE_TRANSITIONS`, and `canTransition` in `src/contracts/common.ts`. Add `lifecycleToStage(lifecycle, jobStep?)` mapping `AWAITING_UPLOAD`/`UPLOADED` to `RECEIVED`, `OCR_*` processing to `READING`, and `ANALYZING` to `UNDERSTANDING`, `CHECKING_DETAILS`, or `PREPARING_REPORT` by job step. Remove the "PLACEHOLDER" header.
- [ ] **Step 4:** Make `upload.ts` import `allowedMimeTypeSchema` and `MAX_DOCUMENT_SIZE_BYTES` from `@/contracts`.
- [ ] **Step 5:** Run `npm run test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(contracts): finalize shared enums and document lifecycle`.

### Task A3: Analysis contract and mock fixtures

**Files:**
- Modify: `src/contracts/analysis.ts`, `src/contracts/mock-analysis.ts`
- Create: `src/contracts/errors.ts` (`ContractError`)
- Test: `src/contracts/__tests__/analysis.test.ts`

**Interfaces:**
- Consumes: Task A2 enums.
- Produces: `ANALYSIS_SCHEMA_VERSION`, `parseAnalysisResult`, `mockUtilityBillAnalysis`, `mockPartialAnalysis`, `mockNeedsCorrectionAnalysis`.

- [ ] **Step 1: Write failing tests.**
  - Missing any top-level field from `product.md` section 15 fails.
  - `FOUND` with confidence 0.2 passes and stays `FOUND`. `INFERRED` with confidence 0.9 passes and stays `INFERRED`. Confidence -0.1 or 1.1 fails.
  - A consequence with `kind: "EXPLICIT"` and `informationStatus: "INFERRED"` fails (an explicit consequence cannot be an inference).
  - An `evidenceIds` entry with no matching evidence fails with a `ContractError` naming the finding ID.
  - Duplicate evidence IDs fail.
  - Evidence with a `documentId` different from `expected.documentId` fails.
  - `unavailablePages: [3]` with `partial: false` fails.
  - A watchout with severity `CRITICAL` and empty `evidenceIds` fails.
  - All three fixtures pass `parseAnalysisResult`.
- [ ] **Step 2:** Run `npm run test -- analysis`. Expected: FAIL.
- [ ] **Step 3: Extend the schema.**
  - `document` gains `documentId: string`.
  - `evidenceReference` gains optional `wordStart`, `wordEnd` (non-negative integers, `wordEnd >= wordStart`) and `matchConfidence` (0–1). `sourceType` stays `OCR_TEXT | USER_CORRECTION`.
  - `reviewRequirement` gains `id`, `impactLevel` (`CRITICAL | HIGH | MEDIUM | LOW`), and optional `findingId` and `evidenceId`.
  - `analysisMetadata` gains `analysisVersion` (positive integer), `language`, and `categoryModules: string[]`.
  - Set `ANALYSIS_SCHEMA_VERSION = "1.0.0"`.
- [ ] **Step 4:** Implement `parseAnalysisResult(value, expected)`: run `analysisResultSchema.parse`, then the cross-reference checks from Step 1. Throw `ContractError` with a `path` and `reason`.
- [ ] **Step 5: Fixtures.** Update `mockUtilityBillAnalysis` to the new shape. Add `mockPartialAnalysis` (page 2 unavailable, `partial: true`, a limitation naming page 2) and `mockNeedsCorrectionAnalysis` (amount due with low confidence, a `REQUIRED` review item linked to that finding). Fictional data only, with no claim it came from Lumen.
- [ ] **Step 6:** Run `npm run test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat(contracts): analysis contract v1.0.0 with cross-reference validation`.

### Task A4: API contracts and error format

**Files:**
- Create: `src/contracts/api.ts`, `src/contracts/api-documents.ts`, `src/contracts/api-analysis.ts`, `src/contracts/api-corrections.ts`, `src/contracts/api-conversations.ts`, `src/contracts/api-cross-document.ts`, `src/contracts/api-reminders.ts`
- Modify: `src/contracts/index.ts`
- Test: `src/contracts/__tests__/api.test.ts`

**Interfaces:**
- Consumes: Tasks A2–A3.
- Produces: request and response schemas for every endpoint below, plus `apiErrorSchema` and `API_ERROR_HTTP_STATUS`.

Endpoint table (all require authentication; builder column says who implements the route):

| Method and path | Purpose | Builder |
|---|---|---|
| `POST /api/documents` | Register document, return signed upload URL | P2 |
| `POST /api/documents/:id/upload-complete` | Verify file, start OCR | P2 |
| `GET /api/documents` | Vault list with lifecycle, stage, category, next deadline, `needsAttention` | P2 |
| `GET /api/documents/:id` | Detail and processing status | P2 |
| `PATCH /api/documents/:id` | Update title or confirm category | P2 |
| `DELETE /api/documents/:id` | Delete document, file, and derived data | P2 |
| `POST /api/documents/:id/analyze` | Start, retry, or rerun analysis (`mode: "START" \| "RETRY" \| "REANALYZE"`, `idempotencyKey`) | P2 |
| `GET /api/documents/:id/analysis?language=` | Latest analysis or not-ready status | P2 |
| `GET /api/analyses/:id` | A specific analysis version | P2 |
| `GET /api/documents/:id/pages/:pageNumber` | Page text and words for evidence navigation | P2 |
| `POST /api/documents/:id/corrections` | Submit corrections | P2 |
| `GET /api/documents/:id/corrections` | Correction history | P2 |
| `POST /api/documents/:id/conversations` | Open a document conversation | P2 |
| `POST /api/conversations/:id/messages` | Ask a grounded question | P2 |
| `GET /api/conversations/:id/messages` | Message history | P2 |
| `POST /api/cross-document/relationships/suggest` | Suggest relationships | P2 |
| `POST /api/cross-document/relationships` | Approve or reject a relationship | P2 |
| `POST /api/cross-document/analyze` | Combined analysis of selected documents | P2 |
| `GET /api/cross-document/analyses/:id` | Combined analysis result | P2 |
| `POST/GET/PATCH/DELETE /api/reminders` | Reminder CRUD | P1 |

- [ ] **Step 1: Write failing tests.**
  - Every request schema is `.strict()`: any `userId`, `ownerId`, or `user_id` field fails.
  - `POST /api/documents` rejects `text/plain`, `fileSize: 0`, and `fileSize: 10485761`.
  - The analysis response is a discriminated union on `state`: `READY` (with `analysis`), `PROCESSING` (with `stage`, no analysis), `FAILED` (with `errorCode`, no analysis). A `PROCESSING` value that includes an `analysis` field fails.
  - `apiErrorSchema` accepts `{ error: { code, message, issues?, requestId } }`. An unknown code fails.
  - `API_ERROR_HTTP_STATUS` maps: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_REQUEST` 400, `CONFLICT` 409, `NOT_READY` 409, `UNSUPPORTED_FILE` 415, `RATE_LIMITED` 429, `PROVIDER_UNAVAILABLE` 503, `INVALID_ANALYSIS` 502, `INTERNAL_ERROR` 500.
  - Cross-document analyze rejects fewer than 2 or more than 5 document IDs.
  - A conversation message longer than 1,000 characters fails.
- [ ] **Step 2:** Run `npm run test -- api`. Expected: FAIL.
- [ ] **Step 3:** Implement the schemas, one file per area, re-exported from `src/contracts/api.ts`. Error responses use the same shape everywhere. `requestId` is a UUID generated per request.
- [ ] **Step 4:** Export the public surface from `src/contracts/index.ts`: enums, lifecycle helpers, analysis contract, fixtures, API schemas. Do not export provider types.
- [ ] **Step 5:** Run `npm run test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(contracts): application API and error contracts`.

### Task A5: Shared database schema and RLS

**Files:**
- Create: `supabase/migrations/20261113000000_document_intelligence_schema.sql`
- Create: `supabase/tests/database/rls.test.sql`
- Regenerate: `src/types/database.ts`

**Interfaces:**
- Consumes: Task A2 lifecycle and enums. Database `check` constraints use the same literal values.
- Produces: the tables and functions every later task writes to.

- [ ] **Step 1: Write failing pgTAP tests** in `rls.test.sql` with three users (owner, recipient with a `viewer` share, stranger):
  - Stranger selects zero rows from every user-owned table.
  - Recipient can read the shared document, its pages, latest analysis, findings, and evidence, but not the owner's reminders or conversations.
  - Owner cannot `update documents set processing_status = 'COMPLETED'` (permission denied).
  - Owner cannot insert into `document_analyses`, `findings`, `evidence_references`, `document_pages`, or `processing_jobs`.
  - Owner can update `documents.title` and insert their own `ocr_corrections`, `reminders`, `conversations`, and `messages` on their conversations.
  - `claim_processing_job` cannot be executed by `authenticated`.
- [ ] **Step 2:** Run `npm run db:start` then `npm run test:db`. Expected: FAIL (tables missing).
- [ ] **Step 3: Write the migration.**
  - `documents`: add `title`, `category`, `subtype`, `classification_confidence`, `ocr_document_id`, `language`. Rewrite the `processing_status` check to the Task A2 lifecycle values, map existing rows (`pending`→`UPLOADED`, `processing`→`OCR_PROCESSING`, `completed`→`COMPLETED`, `failed`→`ANALYSIS_FAILED`, `uploading`→`AWAITING_UPLOAD`), and set the default to `AWAITING_UPLOAD`. Rewrite the `mime_type` check to the Task A2 list. Revoke table `UPDATE` from `authenticated`, then grant `UPDATE (title, category)` only.
  - `document_analyses`: add `version`, `status` (`RUNNING | SUCCEEDED | FAILED`), `report_json`, `schema_version`, `language`, `model_instance_id`, `idempotency_key` (unique per document), `completed_at`. Add `unique (document_id, version)`. Drop the user insert, update, and delete policies.
  - New tables: `document_pages`, `document_chunks`, `findings`, `evidence_references`, `ocr_corrections`, `analysis_translations`, `document_relationships`, `cross_document_analyses`, `cross_document_analysis_documents`, `reminders`, `conversations`, `messages`, `provider_calls`. Use the columns in `product.md` section 12, plus `user_id` ownership columns, timestamps, and foreign keys with `on delete cascade`. `provider_calls` stores operation, credits, status, and duration only, never content.
  - `processing_jobs`: add `job_type`, `step`, `payload jsonb`, `idempotency_key` (unique), `run_after`, `lease_expires_at`, `error_code`, `started_at`, `completed_at`, `max_attempts` default 5. Add status `RETRY_SCHEDULED`. Drop the user insert and update policies.
  - `claim_processing_job(lease_seconds int)`: selects one job where `status in ('queued','RETRY_SCHEDULED') and run_after <= now()`, or `status = 'processing' and lease_expires_at < now()`, using `for update skip locked`. Sets `processing`, the new lease, and `attempts + 1`, and returns the row. Make it `security definer` and grant execute to `service_role` only.
  - `persist_analysis(...)`: inserts the analysis version, findings, and evidence and updates `documents.processing_status` in one transaction. A repeated `idempotency_key` returns the existing analysis ID instead of inserting. Grant to `service_role` only.
  - Storage bucket `allowed_mime_types` updated to the Task A2 list.
  - RLS on every new table: owner select, recipient select through `document_shares` where the table is document-derived, and owner write only where Step 1 allows it.
- [ ] **Step 4:** Run `npm run db:reset`, `npm run test:db`. Expected: all pgTAP tests pass.
- [ ] **Step 5:** Run `npm run db:types`, then `npm run typecheck`. Fix any compile errors in existing code caused by the new types (the signed-URL service should still compile unchanged).
- [ ] **Step 6:** Commit: `feat(db): shared document intelligence schema with RLS`.

### Task A6: Shared server route conventions

**Files:**
- Create: `src/lib/http/api-response.ts`, `src/lib/http/app-error.ts`, `src/lib/auth/require-user.ts`, `src/lib/logging/logger.ts`
- Modify: `src/app/api/documents/[documentId]/signed-url/route.ts` (adopt the helpers as the reference example)
- Test: `src/lib/http/__tests__/api-response.test.ts`, `src/lib/logging/__tests__/logger.test.ts`

**Interfaces:**
- Consumes: Task A4 error contract.
- Produces: `apiOk`, `apiFail`, `withApiErrors`, `AppError`, `requireUser`, `logger`.

- [ ] **Step 1: Write failing tests.**
  - `withApiErrors` turns `new AppError("NOT_FOUND", ...)` into status 404 and a body that passes `apiErrorSchema`.
  - A thrown `ZodError` becomes `INVALID_REQUEST` 400 with `issues` paths and no raw input values.
  - An unknown thrown error becomes `INTERNAL_ERROR` 500, with a message that does not include the original error text.
  - `logger.info("x", { text: "secret doc", pageText: "...", lumenApiSecret: "k" })` writes none of those values. Allowed keys are an explicit allowlist (`documentId`, `jobId`, `jobType`, `status`, `durationMs`, `errorCode`, `requestId`, `credits`).
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `requireUser` uses `createClient()` from `src/lib/supabase/server.ts` and `auth.getClaims()`, and throws `AppError("UNAUTHENTICATED")` when there is no `sub`. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first.
- [ ] **Step 4:** Refactor the signed-URL route to use `withApiErrors` and `AppError`. Its success response stays the same.
- [ ] **Step 5:** Run `npm run test`, `npm run typecheck`, `npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(http): shared API response, auth, and redacting logger`.

### Task A7: Retire the legacy AI schema and update environment config

**Files:**
- Delete: `src/lib/ai/schemas/document-analysis.ts`, `src/lib/ai/services/*.ts`, `src/lib/ai/providers/*.ts`, `src/lib/ai/config.ts` (after confirming no imports remain)
- Modify: `src/lib/env/server.ts`, `.env.example`, `README.md` (environment table)
- Test: `src/lib/env/__tests__/server-env.test.ts`

**Interfaces:**
- Produces: `getProviderEnv(): { mode: "mock" } | { mode: "lumen"; apiKey; apiSecret; ocrBaseUrl; aiChatBaseUrl; aiInstanceId? }` and `getJobRunnerSecret(): string`.

- [ ] **Step 1:** Grep for imports of `@/lib/ai/`. Expected: only files inside `src/lib/ai/`. If anything else imports it, stop and report.
- [ ] **Step 2: Write failing tests.** `PROVIDER_MODE=lumen` without `LUMEN_API_SECRET` throws a config error naming the missing variable but not its value. `PROVIDER_MODE` unset defaults to `mock`. A non-HTTPS base URL fails in `lumen` mode.
- [ ] **Step 3:** Implement `getProviderEnv` and `getJobRunnerSecret`. Remove `LUMEN_API_BASE_URL` and `LUMEN_MODEL`. Update `.env.example` with empty values and comments, and update the README table.
- [ ] **Step 4:** Delete the legacy `src/lib/ai/` files.
- [ ] **Step 5:** Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 6:** Commit: `refactor: replace legacy AI scaffold config with provider env`.

### Task A8: Contract handoff and sign-off

**Files:**
- Create: `docs/contracts/README.md`
- Modify: `todo-human.md`

- [ ] **Step 1:** Write `docs/contracts/README.md` for Person 1. Cover the import paths, schema version and change rules, fixtures and what each one exercises, lifecycle values with stage labels, the endpoint table, the error shape, the upload flow (signed URL, then complete-upload), and the rule that the UI must show certainty status and evidence and never treat valid JSON as verified.
- [ ] **Step 2:** Run every check: `npm run test`, `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm run build`. If `format:check` fails only on `.kiro/` or `product.md`, record that and do not reformat those files.
- [ ] **Step 3:** In `todo-human.md`, tick only the items this part settled (contract home, lifecycle, schema, endpoint shapes, error format, env variable names). Leave provider items open.
- [ ] **Step 4:** Commit: `docs: shared contract handoff`. Open the PR from `feature/shared-foundation` and request Person 1's review.
- [ ] **Step 5: Gate.** Do not start Part B until Person 1 approves the PR and it is merged. Any change they request goes through Tasks A2–A5 and keeps version `1.0.0` only if nothing has been consumed yet.

---

# Part B: Person 2 document intelligence pipeline

Branch `feature/document-intelligence` from `main` after Part A merges.

## Phase 1: Lifecycle and jobs

### Task B1: Lifecycle transition service

**Files:**
- Create: `src/features/processing/services/lifecycle.ts`
- Test: `src/features/processing/services/__tests__/lifecycle.test.ts`

**Interfaces:**
- Produces: `transitionDocument(admin, documentId: string, from: DocumentLifecycle, to: DocumentLifecycle): Promise<void>`. Throws `AppError("CONFLICT")` when the row is not in `from` or `canTransition(from, to)` is false.

- [ ] **Step 1:** Write failing tests with a fake Supabase admin client. A valid transition issues an update filtered by `id` and `processing_status = from`. Zero updated rows throws `CONFLICT`. `ANALYSIS_FAILED → COMPLETED` throws before any query.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement it as a compare-and-set update.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(processing): guarded lifecycle transitions`.

### Task B2: Durable job runner and tick route

**Files:**
- Create: `src/features/processing/services/job-runner.ts`, `src/features/processing/services/job-registry.ts`, `src/app/api/internal/jobs/tick/route.ts`
- Test: `src/features/processing/services/__tests__/job-runner.test.ts`

**Interfaces:**
- Consumes: `claim_processing_job` (A5), `logger` (A6), `getJobRunnerSecret` (A7).
- Produces: `enqueueJob`, `runDueJobs`, `registerJobHandler`, `JobHandler`, `JobOutcome` (see Shared interfaces). Also `kickJobRunner()`, which calls the tick route through `after()` so the response is not blocked.

- [ ] **Step 1: Write failing tests** against an in-memory job store that implements the same claim semantics.
  - `enqueueJob` with an existing `idempotencyKey` returns `created: false` and adds no row.
  - A handler returning `retry` sets `RETRY_SCHEDULED` and `run_after = now + afterMs`. On the next attempt past `max_attempts`, the job becomes `failed` with `error_code: "MAX_ATTEMPTS"`.
  - A job whose lease expired while `processing` is claimed again and its attempt count goes up.
  - `runDueJobs(budgetMs)` stops claiming new jobs once the budget is used and leaves remaining jobs queued.
  - A thrown handler error is logged with `jobId` and `errorCode` only, then scheduled for retry with exponential backoff (5 s, 20 s, 80 s...).
  - `done` with `next` enqueues the follow-up jobs.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Lease 90 s. The tick route is `POST`, compares the `x-job-runner-secret` header to `JOB_RUNNER_SECRET` in constant time, returns 401 on mismatch, exports `maxDuration = 60`, and calls `runDueJobs(45000)`. Read `route.md`, `after.md`, and `maxDuration.md` in `node_modules/next/dist/docs/` first.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(processing): durable job runner with leases and tick route`.

### Task B3: Provider interfaces and mock providers

**Files:**
- Create: `src/lib/providers/ocr-provider.ts`, `src/lib/providers/chat-provider.ts`, `src/lib/providers/index.ts`, `src/lib/providers/mock/mock-ocr-provider.ts`, `src/lib/providers/mock/mock-chat-provider.ts`, `src/lib/providers/mock/fixtures/utility-bill-pages.ts`
- Test: `src/lib/providers/__tests__/mock-providers.test.ts`

**Interfaces:**
- Produces: `OcrProvider`, `ChatProvider`, `NormalizedPage` (Shared interfaces), `getOcrProvider()`, `getChatProvider()` (selected by `PROVIDER_MODE`), `MockChatProvider` with `respondWith(matcher: (message: string) => boolean, reply: string)`.

- [ ] **Step 1:** Write failing tests. Mock OCR returns `PROCESSING` on the first status call and `READY` on the second, then two utility-bill pages whose text contains the fixture evidence excerpts from Task A3. A configurable flag makes page 2 `FAILED` with overall status `PARTIAL`. Mock chat throws when a message exceeds 4,000 characters. `getOcrProvider()` returns the mock when `PROVIDER_MODE` is unset.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(providers): OCR and chat interfaces with deterministic mocks`.

## Phase 2: Mock vertical slice

### Task B4: Document registration and upload completion

**Files:**
- Create: `src/features/documents/services/register-document.ts`, `src/features/documents/services/complete-upload.ts`, `src/features/documents/services/file-signature.ts`
- Create: `src/app/api/documents/route.ts` (POST), `src/app/api/documents/[documentId]/upload-complete/route.ts`
- Test: `src/features/documents/services/__tests__/file-signature.test.ts`, `__tests__/register-document.test.ts`, `__tests__/complete-upload.test.ts`

**Interfaces:**
- Produces: `registerDocument(userId, input: CreateDocumentRequest): Promise<CreateDocumentResponse>` and `completeUpload(userId, documentId): Promise<DocumentSummary>`.

- [ ] **Step 1: Write failing tests.**
  - `detectMimeType(firstBytes)` recognizes `%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47`, TIFF `49 49 2A 00` and `4D 4D 00 2A`, and WebP `RIFF....WEBP`. It returns `null` for an `MZ` executable header.
  - `registerDocument` builds the storage path `<userId>/<documentId>/<safe-filename>`. The safe filename strips path separators, `..`, and control characters, and has at most 120 characters. The row is created as `AWAITING_UPLOAD`. A signed upload URL is returned. The route never reads a request body larger than the JSON metadata.
  - `completeUpload` reads the object's size and first 16 bytes from Storage. A size mismatch with the registered `fileSize` raises `INVALID_REQUEST`. A detected type different from the registered type raises `UNSUPPORTED_FILE`, and the object and row are deleted. On success it transitions `AWAITING_UPLOAD → UPLOADED`, enqueues `OCR_SUBMIT` with idempotency key `ocr-submit:<documentId>`, and calls `kickJobRunner()`.
  - A second `completeUpload` call returns the current summary without enqueuing again.
  - A different user's document returns `NOT_FOUND`, not `FORBIDDEN`, so its existence is not revealed.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with Supabase Storage `createSignedUploadUrl` and a ranged download for the header bytes.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(documents): signed upload registration and verified completion`.

### Task B5: Mock-backed pipeline handlers

**Files:**
- Create: `src/features/ocr/services/ocr-jobs.ts`, `src/features/ocr/services/persist-pages.ts`
- Create: `src/features/intelligence/services/analysis-engine.ts`, `src/features/intelligence/services/fixture-analysis-engine.ts`, `src/features/intelligence/services/analysis-jobs.ts`
- Test: `src/features/ocr/services/__tests__/ocr-jobs.test.ts`, `src/features/intelligence/services/__tests__/analysis-jobs.test.ts`, `src/test/pipeline.integration.test.ts`

**Interfaces:**
- Consumes: B1–B4.
- Produces: job handlers for `OCR_SUBMIT`, `OCR_POLL`, `OCR_FETCH`, and `ANALYZE`; the `AnalysisEngine` interface; `FixtureAnalysisEngine` (returns the Task A3 fixture rewritten with the real `documentId`).

- [ ] **Step 1: Write failing tests.**
  - `OCR_SUBMIT` downloads the file, calls `submit`, stores `ocr_document_id`, transitions to `OCR_PROCESSING`, and returns `done` with `OCR_POLL`.
  - `OCR_POLL` returns `retry` with a backoff of 3 s, 6 s, 12 s, and so on, capped at 60 s, while the status is `PENDING` or `PROCESSING`. It returns `done` with `OCR_FETCH` on `READY` or `PARTIAL`. On `FAILED` it transitions to `OCR_FAILED` and returns `fail`. After 40 polls it fails with `OCR_TIMEOUT`.
  - `OCR_FETCH` upserts `document_pages` by `(document_id, page_number)` and calls `getPages` once. It transitions to `OCR_READY`, or to `OCR_PARTIAL` if any page failed, and enqueues `ANALYZE`.
  - `ANALYZE` transitions to `ANALYZING`, calls the engine, validates with `parseAnalysisResult`, persists through `persist_analysis` with idempotency key `analyze:<documentId>:<version>`, and transitions to the engine's outcome. An engine result that fails validation transitions to `ANALYSIS_FAILED`, and no `SUCCEEDED` analysis row exists.
  - Running `ANALYZE` twice with the same key leaves exactly one analysis version.
  - Integration test: register, complete upload, run the job runner to completion with mocks, and get a `COMPLETED` document with one analysis whose findings and evidence rows match the report JSON.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and register the handlers in `job-registry.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): mock-backed OCR and analysis job flow`.

### Task B6: Read, update, delete, and analyze endpoints

**Files:**
- Create: `src/features/documents/services/document-queries.ts`, `src/features/documents/services/delete-document.ts`, `src/features/intelligence/services/request-analysis.ts`
- Create routes: `src/app/api/documents/route.ts` (add GET), `src/app/api/documents/[documentId]/route.ts` (GET, PATCH, DELETE), `src/app/api/documents/[documentId]/analyze/route.ts`, `src/app/api/documents/[documentId]/analysis/route.ts`, `src/app/api/analyses/[analysisId]/route.ts`, `src/app/api/documents/[documentId]/pages/[pageNumber]/route.ts`
- Test: matching `__tests__` files for each service

**Interfaces:**
- Produces: route behavior matching the Task A4 schemas. Every response is validated against its contract schema before it is returned.

- [ ] **Step 1: Write failing tests.**
  - The vault list sorts documents needing attention first (`NEEDS_CORRECTION`, `REVIEW_REQUIRED`, `OCR_FAILED`, `ANALYSIS_FAILED`, or a deadline within 7 days), then by nearest deadline, then by newest.
  - The analysis endpoint returns `PROCESSING` with a `stage` while analyzing, and `FAILED` with an `errorCode` after a failure. It never returns a `RUNNING` or `FAILED` analysis row as `READY`. A status read that finds a queued job older than 2 minutes calls `kickJobRunner()`.
  - `analyze` with `mode: "RETRY"` on `OCR_FAILED` enqueues `OCR_SUBMIT`. On `ANALYSIS_FAILED` it enqueues `ANALYZE`. On `COMPLETED` it raises `CONFLICT` (use `REANALYZE`). The same `idempotencyKey` twice creates one job. More than 10 analyze calls per user per hour returns `RATE_LIMITED`.
  - `PATCH` with a new category on a `COMPLETED` document enqueues `REANALYZE` only when the category's module set differs (module sets come from Task B10; until then, any category change counts as a difference).
  - `DELETE` removes the Storage object and the row, and cascades to derived data. The response states that the Lumen OCR copy cannot be deleted through the API. A recipient (non-owner) gets `NOT_FOUND`.
  - The page endpoint returns words only for an owner or share recipient.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Route handlers await `params`.
- [ ] **Step 4:** Run `npm run test`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): document and analysis endpoints`. Tell Person 1 the mock-backed API is live.

## Phase 3: Lumen OCR

> Blocked until the Lumen key, secret, and OCR grant are available (`todo-human.md`).

### Task B7: Lumen HTTP client

**Files:**
- Create: `src/lib/lumen/http.ts`, `src/lib/lumen/errors.ts`, `src/lib/lumen/credits.ts`
- Test: `src/lib/lumen/__tests__/http.test.ts`

**Interfaces:**
- Produces: `lumenRequest<T>(opts: { base: "ocr" | "ai_chat"; path: string; method; body?; schema: ZodType<T>; operation: LumenOperation; timeoutMs?: number }): Promise<T>`, `LumenError` (codes `UNAUTHORIZED`, `FORBIDDEN_GRANT`, `RATE_LIMITED`, `TIMEOUT`, `UNAVAILABLE`, `INVALID_RESPONSE`), and `CREDIT_COST` (OCR upload 6, retry 3, GET 1, review 2; AI session 2, message 5, transcript 1).

- [ ] **Step 1:** Write failing tests using a stubbed `fetch`. Both auth headers are sent. 401, 403, 429, and 5xx map to the error codes above. A response that fails `schema` raises `INVALID_RESPONSE`, and the raw body appears in neither the error message nor the logs. A call that exceeds `timeoutMs` (default 30 s) aborts with `TIMEOUT`. Each call writes one `provider_calls` row with `operation`, `credits`, `status`, and `durationMs`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `AbortController` and `server-only`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(lumen): authenticated HTTP client with credit tracking`.

### Task B8: Capture OCR responses and write their schemas

**Files:**
- Create: `scripts/capture-lumen-ocr.ts` (manual, never run in CI), `src/lib/lumen/ocr-schemas.ts`, `src/lib/lumen/__fixtures__/ocr/*.json`
- Test: `src/lib/lumen/__tests__/ocr-schemas.test.ts`

- [ ] **Step 1:** With the user's staging credentials in `.env.local`, run the capture script against two fictional sample documents: a clean 1-page bill and a multi-page document with a poor-quality page. Save the upload, status, and pages responses. Remove any real personal data before committing fixtures.
- [ ] **Step 2:** Write `ocr-schemas.ts` from the official docs and the captured responses. If the docs and the captures disagree, stop and report to the user.
- [ ] **Step 3:** Write tests that parse every fixture, and one that rejects a pages response missing the word list.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(lumen): OCR response schemas from captured staging fixtures`.

### Task B9: Lumen OCR provider and normalization

**Files:**
- Create: `src/lib/lumen/ocr-client.ts`, `src/features/ocr/services/normalize-pages.ts`
- Modify: `src/lib/providers/index.ts`
- Test: `src/features/ocr/services/__tests__/normalize-pages.test.ts`, `src/lib/lumen/__tests__/ocr-client.test.ts`

**Interfaces:**
- Produces: `LumenOcrProvider implements OcrProvider` and `normalizePages(raw: LumenPagesResponse): NormalizedPage[]`.

- [ ] **Step 1:** Write failing tests against the B8 fixtures. Page text is the words joined in reading order. Word indexes start at 0 per page. `averageConfidence` is the mean of non-null word confidences, or `null` when there are none. A `PARTIAL` document's failed pages come back as `status: "FAILED"` with empty text. Retry calls the retry operation once and charges 3 credits.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire `PROVIDER_MODE=lumen` to `LumenOcrProvider`.
- [ ] **Step 4:** Run `npm run test`. Then do one manual staging run of the full pipeline with `PROVIDER_MODE=lumen` and a fictional document. Expected: `document_pages` rows exist for every page.
- [ ] **Step 5:** Commit: `feat(ocr): Lumen OCR provider with page normalization`.

## Phase 4: Independent analysis intelligence

> AI Chat tasks are blocked until the AI Chat grant is enabled. Tasks B10, B11, B14, and B15 do not need credentials.

### Task B10: Category modules and classification

**Files:**
- Create: `src/features/intelligence/modules/registry.ts`, one file per category in `src/features/intelligence/modules/` (`government.ts`, `financial.ts`, `employment.ts`, `legal.ts`, `medical.ts`, `education.ts`, `utilities.ts`, `personal.ts`, `other.ts`), `src/features/intelligence/services/classify.ts`, `src/features/intelligence/prompts/classify.ts`
- Test: `src/features/intelligence/services/__tests__/classify.test.ts`, `src/features/intelligence/modules/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `CategoryModule = { category: DocumentCategory; moduleIds: string[]; specializedSections: { id: string; title: string; guidance: string }[]; promptGuidance: string }`, `getModule(category)`, `modulesDiffer(a, b): boolean`, and `classifyDocument(pages, chat): Promise<{ category; subtype; issuer; confidence; ambiguous: boolean }>`.

- [ ] **Step 1: Write failing tests.**
  - Every category has a module. Specialized sections follow `product.md` section 4.2 (for example, utilities gets a billing breakdown and financial gets interest and fees).
  - Classification sends one message of 4,000 characters or fewer, using the first 2,500 characters of page text.
  - It is `ambiguous` when confidence is below 0.7 or the top two candidates are within 0.15 of each other. An ambiguous result still returns a best-guess category.
  - A reply that is not valid JSON goes through the B12 repair path. If the repair also fails, the category is `OTHER` and `ambiguous` is true.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): category modules and classification`.

### Task B11: Page-aware chunking

**Files:**
- Create: `src/features/intelligence/services/chunking.ts`
- Test: `src/features/intelligence/services/__tests__/chunking.test.ts`

**Interfaces:**
- Produces: `chunkPages(pages: NormalizedPage[], opts?: { maxChars?: number }): Chunk[]` where `Chunk = { index; pageStart; pageEnd; content; contentHash }` and the default `maxChars` is 2,400.

- [ ] **Step 1: Write failing tests.** Every chunk's content is at most `maxChars`. Each page's text is prefixed with `[p<N>]` markers. Splits happen on paragraph boundaries, then on sentence boundaries. Every page appears in some chunk's range. Failed pages are skipped and reported. A 30-page synthetic document produces stable `contentHash` values across runs.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Persist chunks to `document_chunks` during the analyze job.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): page-aware chunking`.

### Task B12: Lumen AI Chat provider and JSON recovery

**Files:**
- Create: `src/lib/lumen/chat-client.ts`, `src/lib/lumen/chat-schemas.ts`, `src/features/intelligence/services/json-reply.ts`
- Create: `scripts/capture-lumen-chat.ts`, `src/lib/lumen/__fixtures__/chat/*.json`
- Test: `src/features/intelligence/services/__tests__/json-reply.test.ts`, `src/lib/lumen/__tests__/chat-client.test.ts`

**Interfaces:**
- Produces: `LumenChatProvider implements ChatProvider` and `requestJson<T>(chat, sessionId, message, schema: ZodType<T>): Promise<T>`.

- [ ] **Step 1:** Capture instance listing, session creation, and one message reply from staging. Write `chat-schemas.ts` from the docs and the captures. Record in `todo-human.md` what was learned about persona, JSON reliability, and the timeout.
- [ ] **Step 2: Write failing tests** for `requestJson`. It extracts JSON from a reply wrapped in prose or code fences. On a parse or schema failure it sends one repair message (the validation errors plus "return only JSON"). If the second reply also fails, it throws `INVALID_ANALYSIS`. It never sends more than 2 messages per call. A message over 4,000 characters throws before sending.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement both pieces. Sessions are created per analysis job and reused across its messages. A lost session is recreated once.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(lumen): AI Chat provider with validated JSON replies`.

### Task B13: Hybrid analysis orchestration and prompts

**Files:**
- Create: `src/features/intelligence/prompts/system-rules.ts`, `src/features/intelligence/prompts/chunk-analysis.ts`, `src/features/intelligence/prompts/consolidate.ts`, `src/features/intelligence/services/chunk-analysis-schema.ts`, `src/features/intelligence/services/hybrid-engine.ts`
- Test: `src/features/intelligence/services/__tests__/hybrid-engine.test.ts`

**Interfaces:**
- Consumes: B10–B12.
- Produces: `HybridAnalysisEngine implements AnalysisEngine` and `ChunkFindings` (the per-chunk JSON shape: candidate findings with `quote` and `page` instead of evidence IDs).

- [ ] **Step 1: Write failing tests** with `MockChatProvider`.
  - The order is classify (1 message), then one message per chunk, then one consolidation message. Total messages are at most `2 + chunks × 2` (including repairs).
  - Every prompt includes the safety rules from `product.md` section 8: do not invent information, separate facts from inferences, never call a document fraudulent without evidence, never claim to take actions, and quote exact text.
  - Consolidation receives the compact merged findings (titles, statuses, and page numbers), never the full document text.
  - Duplicate findings across chunks (same type and same normalized title) merge into one, combining their quotes.
  - If more than half the chunks fail, the result is `ANALYSIS_FAILED`. If some fail, the result is `partial: true`, and the limitations name the affected pages.
  - The chunk output cache is keyed by `contentHash + moduleIds + promptVersion`. A rerun with unchanged chunks sends no chunk messages.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Write prompts as versioned constants (`PROMPT_VERSION = "1"`). Every prompt fits within 4,000 characters with its chunk.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): hybrid chunk analysis and consolidation`.

### Task B14: Evidence mapping

**Files:**
- Create: `src/features/intelligence/services/evidence-mapping.ts`
- Test: `src/features/intelligence/services/__tests__/evidence-mapping.test.ts`

**Interfaces:**
- Produces: `mapQuoteToEvidence(quote: string, page: number, pages: NormalizedPage[]): { pageNumber; wordStart; wordEnd; excerpt; matchConfidence } | null`.

- [ ] **Step 1: Write failing tests.**
  - An exact match (after normalizing case and whitespace) returns the word range and `matchConfidence: 1`.
  - An OCR-noisy match ("Arnount Due" for "Amount Due") with a token Dice score of 0.85 or higher returns a match with that score.
  - A quote found on a different page than the one claimed is still found when searching adjacent pages (±1).
  - A fabricated quote returns `null`.
  - The returned `excerpt` is always the OCR text, never the AI's quote.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement: an exact substring search on the normalized text first, then a sliding window over tokens sized to the quote length plus or minus 2.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): map AI quotes to OCR evidence`.

### Task B15: Safety and severity rules

**Files:**
- Create: `src/features/intelligence/services/safety-rules.ts`
- Test: `src/features/intelligence/services/__tests__/safety-rules.test.ts`

**Interfaces:**
- Produces: `applySafetyRules(draft: AnalysisResult): { result: AnalysisResult; adjustments: Adjustment[] }`.

- [ ] **Step 1: Write failing tests.** Each rule records an adjustment and adds a limitation where it changes meaning.
  - A `FOUND` finding with no mapped evidence becomes `UNCLEAR`.
  - An `EXPLICIT` consequence without evidence becomes `INFERRED`.
  - A `CRITICAL` or `HIGH` watchout without evidence is capped at `MEDIUM`.
  - An `INFERRED` finding is capped at `MEDIUM` severity.
  - Text claiming fraud or a scam ("fraud", "scam", "peke", "panloloko") without a `CRITICAL` evidenced finding is replaced with neutral "unusual, verify with the issuer" wording.
  - Text claiming a completed action ("I have paid", "submitted for you", "nabayaran na") is rejected and the finding is removed.
  - A finding saying a payment settled a bill, based only on matching amounts, becomes `INFERRED` with a verification next step.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as pure functions.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): deterministic safety and severity rules`.

### Task B16: Review requirements, outcome, and engine switch

**Files:**
- Create: `src/features/intelligence/services/review-requirements.ts`
- Modify: `src/features/intelligence/services/analysis-jobs.ts`, `src/lib/providers/index.ts` (select `HybridAnalysisEngine` unless `PROVIDER_MODE=mock`)
- Test: `src/features/intelligence/services/__tests__/review-requirements.test.ts`, extend `src/test/pipeline.integration.test.ts`

**Interfaces:**
- Produces: `deriveReviewRequirements(result, pages): ReviewRequirement[]` and `decideOutcome(result): "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION"`.

- [ ] **Step 1: Write failing tests.**
  - A money amount, deadline, penalty, or contractual condition whose evidence words average below 0.85 OCR confidence is `REQUIRED` with impact `CRITICAL`.
  - Any other finding with confidence below 0.6 is `OPTIONAL`.
  - Ambiguous classification adds an `OPTIONAL` requirement for the category field.
  - Any unresolved `REQUIRED` item gives `NEEDS_CORRECTION`. Only `OPTIONAL` items give `REVIEW_REQUIRED`. None gives `COMPLETED`.
  - Integration test with the mock chat provider scripted for the utility-bill pages: a low-confidence amount produces `NEEDS_CORRECTION`, and the evidence word ranges point at the amount words.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the pipeline order: hybrid engine, evidence mapping, safety rules, review requirements, `parseAnalysisResult`, then persist.
- [ ] **Step 4:** Run `npm run test`. Then do one manual staging run with `PROVIDER_MODE=lumen`. Expected: a validated report and a `provider_calls` credit total under 60 for a 2-page document.
- [ ] **Step 5:** Commit: `feat(intelligence): review requirements and real analysis engine`. Tell Person 1 real reports are available.

## Phase 5: Corrections, reanalysis, and language

### Task B17: OCR corrections

**Files:**
- Create: `src/features/corrections/services/submit-corrections.ts`, `src/features/corrections/services/effective-pages.ts`
- Create routes: `src/app/api/documents/[documentId]/corrections/route.ts` (POST, GET)
- Test: `src/features/corrections/services/__tests__/*.test.ts`

**Interfaces:**
- Produces: `submitCorrections(userId, documentId, input)`, `listCorrections(userId, documentId)`, and `buildEffectivePages(pages, corrections): NormalizedPage[]` (marks corrected word ranges as `USER_CORRECTION`).

- [ ] **Step 1: Write failing tests.**
  - A correction stores the original OCR words for the range and the corrected value. The `document_pages` row is unchanged.
  - Status `UNREADABLE` (the user can't read it either) is accepted and turns the linked finding into `UNCLEAR` without needing a value.
  - A newer correction for the same range supersedes the older one, and history keeps both.
  - Only the owner can correct. A recipient gets `NOT_FOUND`.
  - When all `REQUIRED` items are resolved, a `REANALYZE` job is enqueued with idempotency key `reanalyze:<documentId>:<hash of correction IDs>`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(corrections): selective OCR corrections with history`.

### Task B18: Targeted reanalysis and versioning

**Files:**
- Modify: `src/features/intelligence/services/analysis-jobs.ts`, `src/features/intelligence/services/hybrid-engine.ts`
- Test: extend `hybrid-engine.test.ts` and `analysis-jobs.test.ts`

- [ ] **Step 1: Write failing tests.**
  - `REANALYZE` after a correction on page 1 re-sends only the chunks covering page 1, and the others come from the cache.
  - The new analysis has `version + 1`. The previous version stays readable through `GET /api/analyses/:id`.
  - Evidence for corrected ranges has `sourceType: "USER_CORRECTION"`.
  - A category change that `modulesDiffer` reports as different re-runs all chunks with the new module. One it reports as the same does not reanalyze.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement using `buildEffectivePages` and the chunk cache.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): targeted reanalysis with versioned results`.

### Task B19: Explanation language switching

**Files:**
- Create: `src/features/intelligence/services/translate-explanations.ts`, `src/features/intelligence/prompts/translate.ts`
- Modify: `src/app/api/documents/[documentId]/analysis/route.ts`
- Test: `src/features/intelligence/services/__tests__/translate-explanations.test.ts`

**Interfaces:**
- Produces: a `TRANSLATE` job handler and `getAnalysisInLanguage(analysisId, language)`.

- [ ] **Step 1: Write failing tests.**
  - The translation covers only the user-facing text fields (`overview`, `explanation`, and finding titles and explanations). IDs, statuses, severities, confidence, evidence excerpts, amounts, and dates are unchanged byte for byte.
  - A translation that changes any number or date is rejected and retried once, then falls back to the original language with a limitation.
  - Translations are cached in `analysis_translations` by `(analysis_id, language)`. A second request sends no messages.
  - The analysis endpoint returns the original immediately with `translationPending: true` and enqueues `TRANSLATE`. No OCR or full analysis is rerun.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Batch fields into messages of 4,000 characters or fewer.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): cached explanation translation`.

## Phase 6: Extended intelligence

### Task B20: Grounded follow-up conversations

**Files:**
- Create: `src/features/conversations/services/conversations.ts`, `src/features/conversations/services/retrieve-context.ts`, `src/features/intelligence/prompts/follow-up.ts`
- Create routes: `src/app/api/documents/[documentId]/conversations/route.ts`, `src/app/api/conversations/[conversationId]/messages/route.ts`
- Test: `src/features/conversations/services/__tests__/*.test.ts`

**Interfaces:**
- Produces: `openConversation(userId, documentId)` and `askQuestion(userId, conversationId, content): Promise<{ answer; evidenceIds; notFoundInDocument }>`.

- [ ] **Step 1: Write failing tests.**
  - Context is the report summary plus the top evidence excerpts by keyword overlap with the question, and the whole message is 4,000 characters or fewer.
  - The answer's `evidenceIds` must exist in the current analysis. Unknown IDs are dropped.
  - A question about something absent from the document returns `notFoundInDocument: true` and no invented content.
  - User and assistant messages are stored in `messages`. The database is the source of truth. A lost Lumen session is recreated with the last 6 messages summarized.
  - More than 30 questions per user per hour returns `RATE_LIMITED`.
  - A share recipient can open their own conversation on a shared document but cannot read the owner's conversations.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Requests are synchronous with `maxDuration = 60`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(conversations): evidence-grounded follow-up questions`.

### Task B21: Document relationship suggestions and approval

**Files:**
- Create: `src/features/relationships/services/suggest-relationships.ts`, `src/features/relationships/services/review-relationship.ts`
- Create routes: `src/app/api/cross-document/relationships/suggest/route.ts`, `src/app/api/cross-document/relationships/route.ts`
- Test: `src/features/relationships/services/__tests__/*.test.ts`

- [ ] **Step 1: Write failing tests.**
  - Suggestions come from deterministic matches on extracted identifiers (account or reference numbers, issuer, and dates within 60 days), not AI. A matching amount alone produces confidence of 0.3 or less.
  - Suggestions are always `POSSIBLE_MATCH`. Only user approval sets `CONFIRMED_MATCH`. Rejection is stored so the same pair is not suggested again.
  - Every document in a pair must be owned by the user or shared with them. Otherwise the response is `NOT_FOUND`.
  - Each suggestion stores the matching evidence IDs from both documents.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(relationships): suggested and approved document relationships`.

### Task B22: Combined cross-document analysis

**Files:**
- Create: `src/features/relationships/services/cross-analysis.ts`, `src/features/intelligence/prompts/cross-analysis.ts`, `src/contracts/cross-analysis.ts` (if not already defined in A4)
- Create routes: `src/app/api/cross-document/analyze/route.ts`, `src/app/api/cross-document/analyses/[analysisId]/route.ts`
- Test: `src/features/relationships/services/__tests__/cross-analysis.test.ts`

- [ ] **Step 1: Write failing tests.**
  - Only completed analyses for 2–5 authorized documents are accepted.
  - The input is each document's compact findings, not full text.
  - Every cross-document finding cites `{ documentId, pageNumber }` evidence from at least one source document, and findings without sources are dropped.
  - The AI cannot output `CONFIRMED_MATCH`.
  - A "bill is paid" conclusion requires receipt evidence with an explicit paid or receipt reference. Otherwise it is `INFERRED`, with a verification step.
  - The work runs as a `CROSS_ANALYZE` job, and the result is stored in `cross_document_analyses` with its source documents in the join table.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(relationships): combined cross-document analysis`.

### Task B23: Reminder suggestions from analysis

**Files:**
- Create: `src/features/intelligence/services/reminder-suggestions.ts`
- Modify: the analysis response contract only through a version decision (add `reminderSuggestions` to the `READY` response, not to `AnalysisResult`)
- Test: `src/features/intelligence/services/__tests__/reminder-suggestions.test.ts`

**Interfaces:**
- Produces: `suggestReminders(result: AnalysisResult, now: Date): ReminderSuggestion[]`. Person 1's reminder CRUD consumes these. Person 2 does not create reminder rows.

- [ ] **Step 1:** Write failing tests. Only `importantDates` with a parseable ISO `date` in the future produce suggestions. The reminder time defaults to 3 days before, or 1 day before if the date is under 3 days away. `UNCLEAR` or `INFERRED` dates are marked `needsConfirmation: true`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as a pure function and include it in the analysis `READY` response.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(intelligence): reminder suggestions from important dates`.

## Phase 7: Testing and production readiness

### Task B24: Evaluation harness

**Files:**
- Create: `src/test/evals/fixtures/*` (fictional documents with expected facts), `src/test/evals/hallucination.eval.test.ts`, `src/test/evals/long-document.eval.test.ts`, `src/test/evals/cost.eval.test.ts`
- Modify: `package.json` (add `"test:evals": "vitest run src/test/evals"`, excluded from the default `test` run)

- [ ] **Step 1:** Create at least one fictional fixture per category, with expected key facts, deadlines, and one deliberately missing field each.
- [ ] **Step 2: Write evals.**
  - Hallucination: every `FOUND` finding's evidence excerpt appears in the OCR text, and the deliberately missing field is reported as `NOT_FOUND` or absent, never invented.
  - Long document: a 30-page synthetic document finishes within the message budget, every page is either covered or listed as unavailable, and no single message exceeds 4,000 characters.
  - Cost: credits per document (from `provider_calls`) are at most 6 + polls + 2 + 5 × (2 + 2 × chunks). Log the actual figures.
- [ ] **Step 3:** Run in mock mode (`npm run test:evals`), then once in `lumen` mode against staging. Record the results in `docs/evals/2026-xx-results.md`.
- [ ] **Step 4:** Commit: `test: hallucination, long-document, and cost evaluations`.

### Task B25: Security review and readiness checklist

**Files:**
- Extend: `supabase/tests/database/rls.test.sql` with every Phase 5–6 table
- Create: `docs/production-readiness.md`

- [ ] **Step 1:** Extend the pgTAP tests to cover owner, recipient, and stranger access for corrections, translations, conversations, messages, relationships, and cross-document analyses. Run `npm run test:db`. Expected: PASS.
- [ ] **Step 2:** Run a security review with the `security` subagent over the diff. Focus on IDOR on every `:id` route, service-role usage that skips an ownership check, logging of document content, the tick-route secret, upload validation, and prompt injection in document text (document text is wrapped as data in every prompt and can't override the rules). Fix findings, each with a regression test.
- [ ] **Step 3:** Write `docs/production-readiness.md`. Cover the `pg_cron` and `pg_net` setup that calls the tick route every minute (secret kept in Supabase Vault), the Vercel environment variables, the Lumen production origin and availability, rate limits, credit allocation, OCR retention and deletion with no delete API (disclosed to users), and the answers to `product.md` section 20 with the date each was confirmed.
- [ ] **Step 4:** Run every check: `npm run test`, `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `docs: security fixes and production readiness checklist`. Open the PR from `feature/document-intelligence`.

---

## Acceptance mapping (`product.md` section 19, Person 2 items)

| Criterion | Task |
|---|---|
| 2. Upload a supported document (backend) | B4 |
| 3. Securely submit to Lumen OCR | B7, B9 |
| 4. OCR results stored and mapped to pages | B5, B9 |
| 5. Classify a document | B10 |
| 6. Validated structured analysis | A3, B12, B13, B16 |
| 7. Report adapts to category (data side) | B10, B13 |
| 8. Important findings have evidence | B14, B15 |
| 9. Facts and inferences distinguished | A3, B15 |
| 10. Critical uncertain OCR triggers review | B16 |
| 11. Corrections preserve original history | B17 |
| 12. Grounded follow-up questions | B20 |
| 13. Change explanation language | B19 |
| 14. Failures visible with retry | B2, B5, B6 |
| 15. Documents isolated by ownership | A5, A6, B25 |
| 16. Combined analysis of selected documents | B22 |
| 17. No claims of completed actions | B15 |

Criterion 1 (authentication) already exists. The UI side of criteria 2, 7, 12, 13, and 14 belongs to Person 1.
