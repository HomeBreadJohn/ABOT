# Shared Foundation Handoff (Person 2 → Person 1)

**Branch:** `feature/shared-foundation`
**Status:** Part A complete. Contracts, database schema, route helpers, and provider env are done, security-reviewed, and tested (102 unit tests + 8 RLS checks against the hosted DB).
**Schema version:** `1.0.0`

This is the single source of truth for the shared contract, the database schema, and the server-side conventions. Person 1 consumes it. Person 1 does not define or edit contracts or migrations. Changes to anything under `src/contracts/` or `supabase/migrations/` go through Person 2 with a version decision.

---

## 1. What you import

Everything shared is re-exported from one place:

```ts
import {
  // enums and lifecycle (src/contracts/common.ts)
  documentLifecycleSchema, canTransition, lifecycleToStage, processingStageSchema,
  severitySchema, informationStatusSchema, documentCategorySchema,
  explanationLanguageSchema, allowedMimeTypeSchema, MAX_DOCUMENT_SIZE_BYTES,

  // analysis contract (src/contracts/analysis.ts)
  ANALYSIS_SCHEMA_VERSION, analysisResultSchema, parseAnalysisResult,
  type AnalysisResult, type Finding, type EvidenceReference,

  // mock fixtures (src/contracts/mock-analysis.ts)
  mockUtilityBillAnalysis, mockPartialAnalysis, mockNeedsCorrectionAnalysis,

  // API request/response/error schemas (src/contracts/api.ts and siblings)
  // (document, analysis, corrections, conversations, cross-document, reminders)
  apiErrorSchema, API_ERROR_HTTP_STATUS,
} from "@/contracts";
```

Import from `@/contracts` only. Do not reach into individual files, and do not copy these shapes into your own feature code.

## 2. Fixtures for the UI

Build the report UI against these. They are fictional and exercise the states the UI must handle:

| Fixture | What it exercises |
| --- | --- |
| `mockUtilityBillAnalysis` | A complete report: found info, an inferred consequence, a watch-out, evidence links, important date |
| `mockPartialAnalysis` | A partial result: page 2 unavailable, `metadata.partial = true`, a limitation naming the missing page |
| `mockNeedsCorrectionAnalysis` | A low-confidence amount with a `REQUIRED` review item linked to the finding |

Hard rule from `product.md` section 8: the UI must never treat a finding as verified just because it is valid JSON. Always surface `informationStatus`, `confidence`, and evidence. Inferred is not explicit.

## 3. Document lifecycle and stages

The lifecycle values your UI may receive (`documentLifecycleSchema`):

`AWAITING_UPLOAD, UPLOADED, OCR_PROCESSING, OCR_READY, OCR_PARTIAL, OCR_FAILED, ANALYZING, NEEDS_CORRECTION, REVIEW_REQUIRED, ANALYSIS_FAILED, COMPLETED`

For the processing screen, call `lifecycleToStage(lifecycle, jobStep?)` to get a user-facing label (`RECEIVED, READING, UNDERSTANDING, CHECKING_DETAILS, PREPARING_REPORT`). Do not invent your own stage strings, and do not show a fake percentage.

- `NEEDS_CORRECTION` means a required review blocks a validated report. Prompt for correction.
- `REVIEW_REQUIRED` means a report exists but the user should confirm optional items or an ambiguous category.

## 4. Upload flow (two steps, direct to Storage)

Files do not go through the API server. A direct server upload would hit Vercel's 4.5 MB request-body limit, and the max document is 10 MiB.

1. `POST /api/documents` with `{ originalFilename, mimeType, fileSize }`. Response: `{ documentId, storagePath, uploadToken, uploadUrl }`.
2. Upload the file to Supabase Storage with `supabase.storage.from("documents").uploadToSignedUrl(storagePath, uploadToken, file)`.
3. `POST /api/documents/:id/upload-complete` to verify the file and start OCR.

Allowed types: PDF, JPEG, PNG, TIFF, WebP. Not `text/plain`.

## 5. API error shape

Every error response is:

```ts
{ error: { code, message, issues?, requestId } }
```

`code` is one of a fixed set; `API_ERROR_HTTP_STATUS` maps each to its HTTP status. Do not parse the human `message` for logic; branch on `code`. The message is safe to show but never contains internal detail or document content.

## 6. The endpoints and who builds them

Request/response schemas for all of these live in `src/contracts/`. Person 2 builds the document, analysis, corrections, conversations, and cross-document routes in Part B. **Person 1 builds the reminders CRUD** (`/api/reminders`) and all UI. See the endpoint table in `docs/superpowers/plans/2026-11-12-person-2-end-to-end.md` (Task A4) for the full list.

`reminderSuggestions` arrive inside the analysis `READY` response (Part B, Task B23); your reminders feature consumes them. Person 2 does not create reminder rows.

## 7. Server conventions (if you write a route)

- Authenticate with `requireUser()` from `@/lib/auth/require-user`. It fails closed.
- Wrap handlers with `withApiErrors` from `@/lib/http/api-response`; return success with `apiOk`, failures by throwing `AppError(code)`.
- Log with `logger` from `@/lib/logging/logger`. It only writes an allowlist of safe keys. Never interpolate document text, user content, or secrets into a log message string.
- This Next.js version (16.4) differs from older ones. Route handler `params` is a `Promise`. Read `node_modules/next/dist/docs/` before writing a route.

## 8. Environment

Copy `.env.example` to `.env.local`. The shared Supabase values are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only). The `PROVIDER_MODE`, `LUMEN_*`, and `JOB_RUNNER_SECRET` values are Person 2's pipeline concern; leave them as `mock`/blank for UI work.

---

## 9. Reconciling your `feature/platform` branch

Your pushed branch built its own contracts and schema before this foundation existed. Those now conflict with the shared source of truth. To adopt this foundation, **delete these from your branch** and rely on `@/contracts` and the shared migrations instead:

Delete (these are superseded by Person 2's versions):

- `src/contracts/analysis.ts`
- `src/contracts/api.ts`
- `src/contracts/enums.ts`
- `src/contracts/index.ts`
- `src/contracts/contracts.test.ts`
- `supabase/migrations/20261113000000_domain_model_proposal.sql` (this timestamp also collides with Person 2's A5 migration)
- `supabase/migrations/20261114000000_profile_preferred_language.sql` (if the profile-language column is still needed, Person 2 adds it as a new migration so there is one schema history)
- `vitest.config.mts` (the shared config is `vitest.config.ts`)

Keep (these are yours and do not conflict):

- Dashboard, auth, settings, layout, and UI components
- `src/features/profile/**` and `src/app/api/profile/route.ts`
- Your mock fixtures under `src/mocks/**` if you still want them for rendering — but prefer the shared fixtures in `@/contracts` so there is one contract. If you keep `src/mocks`, treat them as throwaway and type them against `AnalysisResult` from `@/contracts`.

Suggested steps:

```bash
git checkout feature/platform
git fetch origin
# after this branch is merged to main:
git rebase origin/main
# resolve conflicts by deleting the files listed above and importing from @/contracts
npm run typecheck && npm run test && npm run build
```

After the rebase, import every shared type from `@/contracts`, run against the one migrated schema, and there is nothing of Person 2's left for you to redefine.

## 10. Changing the contract

If the UI needs a field the contract does not have, do not add it locally. Tell Person 2. We decide whether it belongs in `AnalysisResult`, a response envelope, or nowhere, and bump the schema version if it is a breaking change. One source of truth is the whole point.
