# Implementation Plan: Person 1 Platform and UI Integration

## Overview

Branch `feature/platform-ui-integration`, cut from `origin/integration/platform-backend-merge-demo`. That branch is the source of truth: Person 2's finished backend plus a demo re-skin. This plan wires the real backend into the UI (upload, vault, processing, report, evidence, corrections, chat, language, reminders, dashboard, family sharing) and finishes with an accessibility and boundary audit. Person 1 consumes the shared contract and may not redefine it (product.md section 17).

Stack: Next.js 16 (Cache Components on; `params` and `searchParams` are Promises; request-time reads must sit behind Suspense), TypeScript strict, Tailwind v4, Supabase, Zod 4, Vitest. Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (see AGENTS.md). All code is TypeScript.

### Hard boundaries (apply to every task)

- Never edit: `product.md`, `src/contracts/**`, `supabase/migrations/**`, `src/lib/lumen/**`, `src/lib/providers/**`, `src/features/{intelligence,ocr,processing,corrections,conversations,relationships}/**`, Person 2's existing route handlers under `src/app/api/**` (only ADD new routes: reminders, shares), `src/app/prototype/**` (leave the demo as is), `src/proxy.ts`.
- Import shared types and schemas only from `@/contracts`.
- Server Components read data by calling server-only services directly with `requireUser()` (for example `listDocuments(userId)` and `getDocument(userId, id)` from `@/features/documents/services/document-queries`). Client components call `@/lib/api-client/*` (same-origin cookie session). No Server Actions for document mutations.
- No fabricated data, no fake progress percentages or ETAs, never claim an action happened that did not (no submit, sign or pay claims). Facts and inferences must stay distinguishable. Errors shown to users use fixed safe copy, never raw `error.message`, and document text is never logged.
- Reuse the branch's visual system (tokens and classes such as `text-ink`, `text-ink-muted`, `border-hairline`, `bg-surface`, `shadow-soft`, `text-title`, `text-subhead`, `text-body`, `text-body-sm`, `text-caption`, `tone-*`, `text-accent-ink`, `outline-focus`, `brand-*`) and the existing components in `src/components/ui` and `src/features/documents/report/*`. Do not invent new styling. The earlier "warm neutral" Phase 2 design is superseded by the branch's tokens.
- Accessibility: one main landmark and a meaningful h1 per page, labeled nav, visible focus, `role="status"` / `role="alert"` for async messages, 44px targets, no color-only meaning, usable from 320 to 1440px.
- Every functional task includes its own focused Vitest tests for the NEW logic (there are no separate optional test tasks). The existing 438 tests must stay green. Run `npx prettier --write` ONLY on files the task created or modified; repo-wide `format:check` already fails on files that are not ours and those must not be reformatted.
- Tasks in the same wave run in parallel. Each task stays within its own files, treats type or lint errors from files outside its scope as not its problem, and uses the named slot files (`reminder-suggestions-slot.tsx`, `follow-up-slot.tsx`, `share-slot.tsx`) instead of editing a sibling task's file.
- Per-task verification: `npm run typecheck`, `npm run lint`, `npm run test`. Run `npm run build` at the end of each wave. There is no `.env.local`, so the app cannot be exercised against live Supabase here. Say so in the task report instead of claiming a live run.

### Shared API facts (used by several tasks)

- Client wrappers in `src/lib/api-client`: `registerDocument` (POST `/api/documents` `{originalFilename, mimeType, fileSize}` returns `{documentId, storagePath, uploadToken, uploadUrl}`), `uploadToSignedUrl` (fetch PUT, no progress), `completeUpload(id)`, `listDocuments`, `getDocument(id)`, `updateDocument(id, {title?, category?})`, `deleteDocument(id)`, `requestAnalysis(id, {mode: 'START' | 'RETRY' | 'REANALYZE', idempotencyKey})`, `getAnalysis(id, language?: 'EN' | 'FIL' | 'TAGLISH')`, `getAnalysisById`, `getPage(id, page)` returning `{pageNumber, status, text, words: [{index, text, confidence | null}], averageConfidence}`, `submitCorrections`, `listCorrections`, `openConversation`, `askQuestion`, `listMessages`, plus cross-document wrappers.
- `ApiClientError` carries `code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_REQUEST`, `CONFLICT`, `NOT_READY`, `UNSUPPORTED_FILE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_ANALYSIS`, `INTERNAL_ERROR`) and `status`.
- Document list item: `{documentId, title, lifecycle, stage, category | null, analysisStatus: 'NONE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED', nextDeadline | null (from the reminders table), needsAttention, createdAt}`. Detail adds `subtype, mimeType, fileSize, originalFilename, updatedAt, latestAnalysisId`. The list already sorts attention first, then nearest deadline, then newest, and returns only documents the user OWNS.
- Lifecycle: `AWAITING_UPLOAD, UPLOADED, OCR_PROCESSING, OCR_READY, OCR_PARTIAL, OCR_FAILED, ANALYZING, NEEDS_CORRECTION, REVIEW_REQUIRED, ANALYSIS_FAILED, COMPLETED`. Use `lifecycleToStage` from the contract for the five user-facing stages (`RECEIVED, READING, UNDERSTANDING, CHECKING_DETAILS, PREPARING_REPORT`). Retry rules: RETRY on `OCR_FAILED` re-enqueues OCR, RETRY on `ANALYSIS_FAILED` re-enqueues analysis, `COMPLETED` needs `REANALYZE` (RETRY or START returns 409), analyze is rate limited (429). Use a fresh random `idempotencyKey` per user click and reuse it across automatic network retries of the same click.
- GET analysis returns `{state: 'READY', analysisId, version, analysis, translationPending?, reminderSuggestions?: [{importantDateId, title, date, remindAt, needsConfirmation}]}`, `{state: 'PROCESSING', stage}` or `{state: 'FAILED', errorCode, message}`. A non-EN language that is not yet translated returns the original with `translationPending: true` (poll again; no OCR or analysis is re-run).
- `AnalysisResult` (v1.0.0): `overview, explanation, keyInformation, obligations, watchouts (severity), consequences (kind EXPLICIT | INFERRED), nextSteps, importantDates (date | null, dateText), specializedSections [{id, title, items}], evidence [{id, documentId, pageNumber, excerpt, sourceType OCR_TEXT | USER_CORRECTION, wordStart?, wordEnd?}], limitations, reviewRequirements [{id, field, reason, impact, impactLevel, pageNumber, reviewStatus REQUIRED | OPTIONAL | RESOLVED, findingId?, evidenceId?}], analysisMetadata {partial, unavailablePages, language, analysisVersion, generatedAt}`. Every finding has `informationStatus, confidence, basis, evidenceIds`.
- Corrections are WORD-RANGE based: `submitCorrections({items: [{pageNumber, wordStart, wordEnd, correctedValue?}]})`. Omitting `correctedValue` means the user could not read it or confirms it is unreadable. A REQUIRED review resolved by a correction enqueues a REANALYZE, so the document returns to `ANALYZING` and a NEW analysis version appears.
- Conversations: POST `/api/documents/:id/conversations {}` returns `{conversationId, documentId}`; POST `/api/conversations/:id/messages {content 1..1000 chars}` returns `{messageId, answer, evidenceIds, notFoundInDocument}`; GET messages returns `{messages: [{id, role USER | ASSISTANT, content, evidenceIds?, createdAt}]}`. The message limit is 1000 characters (not 4000).
- Profile preferred language is stored lowercase `'en' | 'fil' | 'taglish'` (`src/features/profile`); the API uses `'EN' | 'FIL' | 'TAGLISH'`.

## Tasks

- [x] 1. Base cleanup and shared plumbing (Wave 0)
  - [x] 1.1 Retire the duplicate service layer, re-point reusable code to contract types, and add shared plumbing
    - **Retire (delete, together with any tests that only cover them)**: `src/features/documents/services/{documents-service.ts,index.ts,mock-documents-service.ts,supabase-documents-service.ts,supabase-row-mappers.ts}`, `src/features/documents/actions/upload-actions.ts`, `src/features/dashboard/services/dashboard-snapshot.ts`, `src/lib/env/documents.ts`. They duplicate Person 2's backend and no page imports them. Confirm with a grep before deleting. Do NOT delete `src/features/documents/services/document-queries.ts` (Person 2's) or anything else in that folder.
    - **Keep and re-point** to the real contract types: `src/features/documents/{upload/*,hooks/*,components/*,schemas/*,view-models/*}` and `src/features/dashboard/{components,view-models}`. Any type previously taken from the deleted documents-service moves to a small types file (for example `src/features/documents/types.ts`) typed from `@/contracts` (`documentListItemSchema`, `documentDetailResponseSchema`). Adjust existing tests to the new types; do not weaken them.
    - **Env**: remove the `DOCUMENTS_DATA_SOURCE` dependency everywhere. The sample-data banner (`src/components/layout/sample-data-banner.tsx`) shows when the server env `PROVIDER_MODE` is `'mock'`, with honest copy that documents are analysed with sample data. Read the env through the existing `src/lib/env/server.ts` helper, server-side only (the banner is a Server Component or receives a boolean prop from one; never import the env module in a client component).
    - **Sidebar recent documents**: `src/components/layout/recent-documents-nav.tsx` shows the real top 5 from `listDocuments(userId)` (via `requireUser()`), inside Suspense, with a safe fallback (empty or quiet "Recent documents unavailable" text) on error. Each link goes to `/documents/[documentId]` with the title as accessible name.
    - **Language mapping**: create `src/features/profile/language-code.ts` with a total, typed mapping `'en' | 'fil' | 'taglish'` <-> `'EN' | 'FIL' | 'TAGLISH'` (for example `toApiLanguage`, `fromApiLanguage`, plus a safe default `'EN'` for unknown stored values).
    - **Safe error messages**: create `src/lib/api-client/safe-messages.ts` exporting a `Record<ApiErrorCode, string>` of fixed user-facing copy for every code (UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, INVALID_REQUEST, CONFLICT, NOT_READY, UNSUPPORTED_FILE, RATE_LIMITED, PROVIDER_UNAVAILABLE, INVALID_ANALYSIS, INTERNAL_ERROR), a `safeMessageFor(error: unknown)` function (unknown or non-`ApiClientError` values map to the INTERNAL_ERROR copy, never the raw message), and a client hook `useApiError` (for example `src/lib/api-client/use-api-error.ts`) that exposes `{message, code, set(error), clear()}` for every later task. Do not edit the existing api-client files other than adding exports to its index if needed.
    - **Acceptance**: `npm run typecheck` is green at the end (every later task depends on it). No remaining import of any deleted file or of `DOCUMENTS_DATA_SOURCE`. Mapping tests are total over every value in both directions. The message map has an entry for every `ApiErrorCode` and no entry contains interpolated raw error text.
    - **Tests**: `language-code.test.ts` (round trip, unknown fallback), `safe-messages.test.ts` (every code covered, unknown input falls back, raw message never leaks), banner shows only for `PROVIDER_MODE === 'mock'`, recent-documents nav renders top 5 and the error fallback (service faked).
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` (end of wave). Prettier only on touched files.
    - _Requirements: product.md sections 9.3, 9.8, 12, 17_

- [ ] 2. Upload flow (Wave 1)
  - [ ] 2.1 Build `/documents/new` and the `UploadComposer` with real upload orchestration
    - **Files**: create `src/app/(dashboard)/documents/new/page.tsx` (h1, privacy copy, supported formats and the 10 MiB limit read from the shared policy in `@/contracts`, not hard-coded) and `src/features/documents/components/upload-composer.tsx` (client component, exported for reuse on the dashboard, with a compact variant prop). Rewrite the queue orchestration hook under `src/features/documents/hooks/` or `upload/` (reuse existing file names where present). Stay inside `src/features/documents/{upload,hooks,components}` and the new page.
    - **Composer UI**: choose files, drag and drop, camera capture input (`capture` attribute only on coarse pointers), separate gallery image input, multiple files, cap of ten files per batch, per-file chips with honest byte progress (bytes sent / total, from the XHR transport), retry, remove, duplicate rejection (same name, size and lastModified).
    - **Flow per file**: `registerDocument` -> PUT bytes to `uploadUrl` with the existing XHR transport (progress events) -> `completeUpload(id)`. Removing a file that is already registered but unfinished calls `deleteDocument`. At most 3 concurrent transfers. After the batch settles, refresh or route once (`router.refresh()` or navigate to the single document, or to `/documents` for several). Show "Document received" only after `completeUpload` succeeds and never claim reading or analysis started beyond what the lifecycle says.
    - **Errors**: map `ApiClientError` codes to the Task 1 safe messages (UNSUPPORTED_FILE, RATE_LIMITED, UNAUTHENTICATED with a sign-in link, and so on). Client-side validation messages (type, size) use fixed copy from the shared policy. Status text uses `role="status"`, failures `role="alert"`; per-file controls have accessible names including the filename; targets are at least 44px; drop zone has a keyboard-operable button equivalent.
    - **Acceptance**: a batch with one failure does not block the others; retry resumes only the failed file; removing after register cleans up server-side; the composer renders without crashing in both default and compact variants.
    - **Tests** (fake api client and fake transport): success, partial failure, retry of a failed file, remove-after-register calls `deleteDocument`, expired session (UNAUTHENTICATED) shows the sign-in link, concurrency never exceeds 3, duplicate rejection, ten-file cap, "Document received" only after `completeUpload`.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.1, 9.2, 12, 15_

- [ ] 3. Document vault (Wave 1)
  - [ ] 3.1 Build the `/documents` vault page with filters, delete confirmation and states
    - **Files**: replace `src/app/(dashboard)/documents/page.tsx` (Server Component; `searchParams` awaited inside a Suspense boundary; `requireUser()` then `listDocuments(userId)`), plus files under `src/features/documents/{components,view-models}` and a `loading`/skeleton component. Do not touch `mock-documents.ts` (Task 4 deletes it) and do not edit files owned by tasks 2 and 8. Leave a clearly named place for Task 11's "Shared with me" section (a small `shared-with-me-slot.tsx` that returns null for now, props documented) rendered below the owned list.
    - **Behaviour**: URL-backed search, category filter, status-group filter and sort using the existing `vault-query`, `filter-documents` and toolbar, adapted to `documentListItem` (no invented fields). Document rows link to `/documents/[documentId]` and show status (user-facing stage text plus an icon or text, not color only), category, upload date, next deadline (formatted in `Asia/Manila`) and a failure reason for failed lifecycles using fixed safe copy. Empty state, no-match state, loading skeleton and error state (safe copy). Refresh button (`router.refresh()`). Upload button linking to `/documents/new`.
    - **Delete**: per-row delete with an accessible confirmation dialog (focus trap, focus returns to the trigger) calling `deleteDocument`. The confirmation states plainly that the OCR provider's copy cannot be deleted through the API, using the `note` field returned by the API when present, with fixed fallback copy otherwise. Failure shows safe copy via Task 1 `useApiError`; success refreshes and announces via `role="status"`.
    - **Acceptance**: filters and sort survive reload via the URL; invalid query params fall back to defaults; only real fields are displayed; the page has one main landmark and one h1.
    - **Tests**: view-model, filter and sort on real-shaped data (including attention-first ordering preserved when sort is default), row markup (link target, status text, Manila deadline), delete confirmation flow with a fake client (cancel, success, failure, note text shown).
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.1, 9.3, 9.8, 12_

- [ ] 8. Reminders API and client (Wave 1)
  - [-] 8.1 Implement `/api/reminders` routes, mapping module, service and client wrappers
    - **Ownership**: Person 1 owns the `/api/reminders` routes (docs/contracts/README.md section 6). Do not edit `src/contracts/**` or `supabase/migrations/**`.
    - **Files**: `src/features/reminders/` (mapping module, service with a deps seam, types), routes `src/app/api/reminders/route.ts` (GET, POST) and `src/app/api/reminders/[reminderId]/route.ts` (PATCH, DELETE), `src/lib/api-client/reminders.ts` exporting `listReminders`, `createReminder`, `updateReminder`, `deleteReminder`, and add those exports to the api-client index. Read `src/contracts/api-reminders.ts` and an existing Person 2 route for conventions before writing.
    - **Contract**: reminder `{id, documentId | null, title, dueAt (iso datetime), status 'ACTIVE' | 'DONE' | 'DISMISSED', notes | null}`; create `{title, dueAt, documentId?, notes?}`; update `{title?, dueAt?, status?, notes?}`; list `{reminders}`; delete `{reminderId}`.
    - **DB table** `public.reminders`: `title`, `description`, `due_at` (nullable), `reminder_at` (nullable), `status 'PENDING' | 'SENT' | 'DISMISSED'`, `document_id` nullable, RLS owner-only insert, select, update and delete.
    - **Mapping module (single place)**: `ACTIVE <-> PENDING`, `DISMISSED <-> DISMISSED`, `DONE <-> SENT`, `notes <-> description`, `reminder_at` left null (the contract has no field for it). Total over all statuses in both directions. Put a short comment in the module describing this mismatch and record it as an open question for Person 2 in the final report (Task 13).
    - **Null due dates**: the DB `due_at` is nullable but the contract `dueAt` is required. List responses skip rows with a null `due_at` (they cannot be represented) and the behaviour is documented in a comment. Never fabricate a date.
    - **Routes follow Person 2's conventions**: `withApiErrors`, `apiOk`, `requireUser`, `AppError`, strict Zod parse (unknown keys and owner ids such as `userId`/`user_id` rejected), `params` as a Promise, and a deps seam so unit tests use in-memory fakes. Use the user (RLS) client so another user's reminder behaves as `NOT_FOUND`. A document-linked reminder requires the document to be visible to the user (otherwise `NOT_FOUND`). List ordered by due date ascending.
    - **Acceptance**: all four verbs behave per contract; responses validate against the contract response schemas; no secrets or raw DB errors reach the response.
    - **Tests**: mapping both directions and total over statuses, strict-body validation (extra keys and owner ids rejected, invalid dates rejected), `NOT_FOUND` for another user's reminder on PATCH and DELETE, document-visibility check on create, null-due rows skipped in list, client wrappers hit the right method and path (fake fetch).
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.7, 12, 17_

- [ ] 4. Real document page (Wave 2)
  - [ ] 4.1 Wire `/documents/[documentId]` to real data, polling, processing states, language and header actions
    - **Server page**: rewrite `src/app/(dashboard)/documents/[documentId]/page.tsx` as a Server Component. `params` awaited, request-time reads behind Suspense. `requireUser()`, `getDocument(userId, id)` (NOT_FOUND maps to `notFound()`), and the user's profile preferred language (mapped with Task 1 `language-code.ts`). Pass initial detail and language to the client `DocumentView`.
    - **Polling**: create `useDocumentPolling` hook. Poll `getDocument` every 3s, backing off to 10s; pause when the tab is hidden (`visibilitychange`); stop on terminal lifecycles `COMPLETED`, `REVIEW_REQUIRED`, `NEEDS_CORRECTION`, `OCR_FAILED`, `ANALYSIS_FAILED`; stop after unmount; cap total polling time and then show a calm "Taking longer than usual" message with a manual refresh button. Fetch `getAnalysis` once `analysisStatus` is `SUCCEEDED`. The hook is generic enough for Task 6 to reuse (exported options: interval, max duration, `until` predicate).
    - **Processing view**: use the real `stage` from `lifecycleToStage` with the five labels from product.md section 9.2; no percentages or ETAs; a "you can leave and come back" note; `OCR_PARTIAL` disclosure; real retry (`requestAnalysis` with `mode: 'RETRY'`, fresh `idempotencyKey` per click, reused across automatic network retries of the same click). Handle 409 and 429 with safe copy. Failed states show fixed safe copy and a retry only when retry is allowed (`OCR_FAILED`, `ANALYSIS_FAILED`; not `COMPLETED`).
    - **Report**: render the REAL analysis through the existing `AnalysisReport` / `FindingItem`. Remove the local fake correction state and the demo `CorrectionPanel` wiring from `analysis-report.tsx`; keep a prop-driven hook point for Task 6 (for example `renderReviewItem` or `onResolveReview` props, documented). Task 5 and Task 6 will edit `finding-item.tsx` / `analysis-report.tsx` later, so keep exported props stable and additive.
    - **Language switcher**: English, Filipino, Taglish. Calls `getAnalysis(id, language)`, polls while `translationPending`, defaults from the profile preference. Changing language never triggers OCR or analysis (no `requestAnalysis` call). Announce the change via `role="status"`.
    - **Header actions**: rename (`updateDocument` title), confirm or change category (`updateDocument` category; explain that a change may re-run the analysis only when needed, per product.md 9.1), delete with confirmation (navigate to `/documents` on success), re-run analysis (`REANALYZE`) with confirmation when `COMPLETED`. All errors use Task 1 safe messages.
    - **Slots**: create three tiny slot components rendered by `DocumentView`: `reminder-suggestions-slot.tsx`, `follow-up-slot.tsx`, `share-slot.tsx` (each returns `null` for now; document props in a comment, e.g. `documentId`, `analysis` / `reminderSuggestions`, `isOwner`, `onOpenEvidence`). Later tasks replace only their own slot file.
    - **Cleanup**: delete `src/features/documents/report/report-fixtures.ts` and `src/app/(dashboard)/documents/mock-documents.ts` once nothing imports them (also delete their tests if they only test fixtures). Fixtures must no longer be reachable from real routes. Person 2's contract mock fixtures stay available for tests.
    - **Acceptance**: a document in each lifecycle renders the right view; PROCESSING analysis shows the real stage; no code path shows a fake progress value; report only shows after `SUCCEEDED`.
    - **Tests**: polling hook with fake timers and a fake client (terminal detection, backoff 3s -> 10s, visibility pause and resume, unmount stop, time cap), lifecycle-to-view mapping for all eleven lifecycles, retry rules (allowed or not, 409 and 429 copy, fresh key per click, key reuse across network retries), language mapping and `translationPending` polling without any `requestAnalysis` call.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.1, 9.2, 9.4, 9.5, 9.6, 12_

- [ ] 5. Evidence navigation (Wave 3)
  - [-] 5.1 Build the `EvidenceViewer` and wire it into findings and review items
    - **Files**: new files under `src/features/documents/evidence/` (or `report/`) for `EvidenceViewer` and helpers; edit ONLY `finding-item.tsx` and `analysis-report.tsx` among existing files, and keep exported props stable (additive only).
    - **Behaviour**: accessible dialog or side panel (focus trap, Escape closes, focus returns to the opener). Opened from every evidence reference: finding evidence disclosures, review items, and chat citations (expose an `openEvidence(evidenceId)` entry point or context so Task 7 can call it through its `onOpenEvidence` prop; Task 7 has no hard dependency on these files). Shows the page text from `getPage(documentId, pageNumber)` with the cited word range (`wordStart..wordEnd`) highlighted using more than color (for example background plus underline or a mark with a visually-hidden "cited" label). Per-word low-confidence cue (underline or marker plus a legend explaining it), page number, excerpt, source type label ("OCR text" vs "Your correction"), average confidence, and a clear "this page could not be read" state for `analysisMetadata.unavailablePages` and failed pages. Previous / next page controls. "Open original file" link using the existing signed-url route (`/api/documents/:id/signed-url`) opening in a new tab (`rel="noopener noreferrer"`).
    - **Errors/loading**: loading uses `role="status"`; fetch failure shows Task 1 safe copy with retry; never shows raw OCR errors.
    - **Acceptance**: every evidence reference in the report is a button with an accessible name including its page number; the viewer works without a word range (excerpt only) when `wordStart`/`wordEnd` are absent.
    - **Tests**: range-highlight computation (inclusive range, clamped, missing range), low-confidence marker logic (null confidence treated as unknown, threshold constant), unavailable-page handling, viewer markup roles (`dialog`, labelled title, close button name), focus return.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.4, 9.5, 12_

- [ ] 7. Follow-up chat (Wave 3)
  - [-] 7.1 Replace `follow-up-slot.tsx` with the `FollowUpChat` client component
    - **Files**: `follow-up-slot.tsx` and new files under `src/features/documents/chat/` only. Before coding, read `src/app/api/documents/[documentId]/conversations/route.ts` and `src/features/conversations/services/conversations.ts` to learn whether opening a conversation is idempotent per (user, document). There is no list-conversations endpoint. If opening is idempotent, call `openConversation` on mount and reuse it; if not, persist the `conversationId` (for example `sessionStorage` keyed by document id) and reuse it, and note the finding in the task report.
    - **Behaviour**: open or reuse the conversation, load history with `listMessages`, suggested prompts from product.md 9.5 (simplify, what if I miss the deadline, which part says that, what to ask the issuing office, explain in Filipino), composer with a 1000-character counter (hard limit 1000, not 4000), send on Enter (Shift+Enter newline) and button, optimistic user message, assistant answer with citations rendered as evidence buttons that call a minimal `onOpenEvidence(evidenceId: string)` prop. `notFoundInDocument` is shown honestly as "This isn't in your document" without guessing or inventing an answer. Loading/typing state, safe errors for 429, 503 and timeouts with a retry that re-sends the same message, disabled composer while sending, scroll-to-latest, `role="log"` with polite announcements. The chat never claims actions were taken (no "I've submitted/booked/paid" language).
    - **Accessibility**: composer labeled, counter announced politely near the limit, buttons at least 44px, focus stays in the composer after send.
    - **Acceptance**: empty history shows the suggested prompts; a failed send keeps the typed text and shows retry; assistant text is rendered as plain text (no HTML injection).
    - **Tests** (fake client): history load, send with optimistic message, `notFoundInDocument` copy, error then retry, character limit (1000 allowed, 1001 blocked), citation buttons call `onOpenEvidence`, conversation reuse.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.5, 12_

- [ ] 9. Reminders UI (Wave 3)
  - [ ] 9.1 Fill the reminder suggestions slot, build `/reminders`, and add navigation
    - **Files**: `reminder-suggestions-slot.tsx`, `src/app/(dashboard)/reminders/page.tsx` (+ `loading.tsx`), `src/features/reminders/components/*` and view-models (do not edit Task 8's mapping/service/routes; only import them and the Task 8 api-client wrappers), and the sidebar and mobile nav in `src/components/layout/` (add "Reminders").
    - **Suggestions**: use the READY response's `reminderSuggestions` (`importantDateId, title, date, remindAt, needsConfirmation`). Show the date, why it was suggested (the important date title), and "needs your confirmation" when `needsConfirmation`. An explicit "Add reminder" button calls `createReminder`; never auto-create. De-duplicate against existing reminders by document + date + title. After adding, show confirmation via `role="status"` and disable that suggestion.
    - **Page**: Server Component list (`requireUser()` and a read through the reminders service or `listReminders`-equivalent server function; Suspense) grouped Overdue / This week / Later / Done, with Manila (`Asia/Manila`) date and time formatting. Create and edit dialog (title, due date and time, notes, optional document chosen from the user's documents). Actions: complete (`status: 'DONE'`), dismiss (`'DISMISSED'`), delete with confirmation. Empty state, safe errors. Overdue is shown calmly (text label, no alarmist styling, not color only).
    - **Acceptance**: no reminder is created without a click; grouping boundaries are computed in Manila time; nav shows the Reminders item on desktop sidebar and mobile nav with the current-page state.
    - **Tests**: grouping and overdue logic (boundaries around midnight Manila and week edges), suggestion dedupe, Manila formatting, form validation (empty title, missing or invalid date, notes length), no auto-create.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.3, 9.7, 12_

- [ ] 6. Correction flow (Wave 4)
  - [ ] 6.1 Replace the demo `CorrectionPanel` with the real word-range correction flow
    - **Files**: new files under `src/features/documents/corrections/` (or `report/`), plus the prop hook point in `analysis-report.tsx` left by Task 4 and delete `correction-panel.tsx` (and its tests) once unused. Reuse the Task 4 polling hook; do not duplicate it.
    - **Behaviour**: driven by `analysis.reviewRequirements`. For REQUIRED (blocking) and OPTIONAL items show field, reason, impact and the original OCR text of the cited word range (`getPage`). The user can adjust the word range by selecting words (keyboard accessible), enter the corrected value, choose "I can't read this" (submit without `correctedValue`), or "This is right" for OPTIONAL items. Show the original value kept beside the corrected one. `submitCorrections({items: [{pageNumber, wordStart, wordEnd, correctedValue?}]})`, then show an "Updating your report" state (`role="status"`) while polling until a NEW analysis version is READY (the document goes `ANALYZING` then back). Show correction history from `listCorrections`. On failure show safe copy and keep the typed value. Never invent a corrected value. The page must not look verified until required items are resolved: the NEEDS_CORRECTION banner stays.
    - **Acceptance**: three submit paths produce the exact payloads above; the old digits-only local fake is gone; read-only mode (Task 11) can disable the flow through a prop (`readOnly`), documented.
    - **Tests** (fake client): range selection logic (start/end ordering, clamping, single word), submit payloads for all three paths, pending-reanalysis polling until a higher version appears, history rendering, error preservation of the typed value, banner stays while REQUIRED items remain.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.4, 9.6, 12_

- [ ] 10. Dashboard (Wave 4)
  - [ ] 10.1 Build `/dashboard` in product priority order with a read-only reminders helper
    - **Files**: `src/app/(dashboard)/dashboard/page.tsx`, `src/features/dashboard/{components,view-models}`, and `src/features/reminders/services/list-upcoming.ts` exporting `listUpcomingReminders(userId)` (read-only; reuse Task 8's mapping; server-only). Retire the placeholder cards.
    - **Behaviour** (product.md 9.3 order, each section wrapped in its own Suspense and error boundary): greeting + upload entry (reuse `UploadComposer` in its compact form), Needs attention (`needsAttention` documents, max 5, reason text from lifecycle), Upcoming deadlines and reminders (pending reminders sorted by due date, Manila dates, overdue shown calmly, link to `/reminders`), Recently analyzed (`analysisStatus === 'SUCCEEDED'`, newest first, max 4), All documents (max 5 + link to the vault), first-run empty state, and honest copy that nothing is analysed until a document is uploaded.
    - **Acceptance**: one failing section does not break the page; no fabricated counts or demo data; one main landmark and one h1.
    - **Tests**: section selection, limits and ordering on real-shaped data, first-run branch, reminders helper (fake deps), overdue formatting.
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.3, 9.7, 12_

- [ ] 11. Family sharing foundation (Wave 4)
  - [-] 11.1 Add share routes, recipient lookup interface, Share dialog, "Shared with me", and read-only document mode
    - **Schema facts**: `public.document_shares(document_id, owner_id, shared_with_user_id, permission 'viewer' | 'editor')`. RLS: owner insert, update, delete (`owns_document`); owner and recipient select; recipients can read the shared document, pages, analyses, findings and evidence but NOT reminders or conversations. `profiles` RLS only exposes the caller's own profile and has no email column, so the user client cannot resolve emails. `listDocuments` filters on `user_id`, so shared documents do not appear in the vault today.
    - **Routes** (new only): `GET/POST /api/documents/[documentId]/shares` and `DELETE /api/documents/[documentId]/shares/[shareId]`, using the user client under RLS (owner only; others get `NOT_FOUND`), strict Zod bodies (`{email, permission}`), no owner ids from the client, conventions as in Task 8. The POST response is uniform whether or not the invited email has an account (no account enumeration). Define the request/response schemas locally in `src/features/sharing/` (the contract is not edited).
    - **Recipient lookup**: ONE server-only interface `resolveRecipientByEmail(email)` in `src/features/sharing/services`, implemented with the Supabase admin API with strict limits (capped pagination, normalised email compare, never returns user data to the client). Comment clearly that this is an interim approach that Person 2 should replace with a SECURITY DEFINER lookup. Rate-limit invites per owner in-process; reject inviting yourself and duplicates (still without leaking account existence for non-self cases).
    - **UI**: replace `share-slot.tsx` (owners only): a Share dialog listing current shares (permission, created date, "Revoke access" with confirmation) and an invite form (recipient email, viewer or editor, explicit consent text that the person will be able to read this document and its report but not reminders or conversations). Honest success copy ("If this person has an account, they will see the document") and no claim of an email being sent.
    - **Shared with me**: replace `shared-with-me-slot.tsx` (created by Task 3) with a vault section listing documents shared to the user (read `document_shares` with the user client, then the documents RLS allows reading): read-only badge, no delete, no share button, owner shown generically as "a family member".
    - **Read-only document page**: shared documents open the same `/documents/[documentId]` page in read-only mode. Provide a small `isOwner`/`readOnly` flag in the page data loader path that Task 4 already passes down to `DocumentView`; hide rename, category, delete, re-run, correction, share, reminders actions and hide chat (recipients cannot read the owner's conversations). If this requires a minimal additive change in `document-view.tsx`, keep it to the flag wiring and mention it in the report.
    - **Acceptance**: invite of an unknown email and of a known email return identical responses; non-owners get `NOT_FOUND`; revoke only works for the owner's share rows; the vault's owned list is unchanged.
    - **Tests**: service with fakes (self-invite, duplicate, enumeration-safe uniform response, revoke ownership, rate limit), strict body validation (owner ids rejected), read-only mode flags hide every mutating action and chat, shared list mapping (generic owner label).
    - **Verify**: `npm run typecheck`, `npm run lint`, `npm run test`; `npm run build` at the end of the wave. Prettier only on touched files.
    - _Requirements: product.md sections 9.1, 9.8, 12, 13_

- [ ] 12. Accessibility, responsive and final verification (Wave 5)
  - [ ] 12.1 Audit all real routes, add contrast and boundary tests, write the manual checklist, and run the final scope audit
    - **Route audit**: `/`, `/login`, `/register`, `/dashboard`, `/documents`, `/documents/new`, `/documents/[id]`, `/reminders`, `/settings`, not-found, error and loading boundaries. Check one main, one h1, labeled nav, focus order, focus return for dialogs and drawers, status/alert announcements, accessible names for icon-only controls, 44px targets. Fix issues in the owning files (small, targeted edits; do not reformat unrelated code).
    - **Contrast**: add a unit test that computes WCAG contrast ratios for the branch's main text/background token pairs (light, and dark if present) and asserts AA (4.5:1 body, 3:1 large text and UI). When a pair fails, fix token usage in components, not the palette.
    - **Responsive**: no horizontal overflow at 320/375/768/1024/1440. Use class-contract tests where static testing is appropriate (for example no fixed widths without `max-w-full`, `min-w-0` on flex children) and write `docs/qa/person-1-ui-manual-checklist.md` for what cannot be automated, covering upload, vault, processing, report, evidence, correction, chat, language, reminders and sharing, each with expected results.
    - **Static boundary tests**: no client module imports server-only code; no real route imports fixtures or mocks; no raw `error.message` rendered in components; no Lumen env in client graphs; no import of `@/contracts` internals from outside `@/contracts`.
    - **Docs**: update the route list in `README.md`.
    - **Final verification**: run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and a scope audit (`git diff --name-only origin/integration/platform-backend-merge-demo...HEAD` plus working tree) confirming no edits to the forbidden paths and `product.md` unchanged. Report prettier failures only for files this work touched. State explicitly that the app was not exercised against live Supabase because there is no `.env.local`.
    - **Acceptance**: all automated checks green; checklist file exists; scope audit lists zero forbidden-path changes.
    - **Tests**: contrast test, class-contract tests, static boundary tests.
    - _Requirements: product.md sections 11, 12, 15, 17_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`.
  - Report these open questions for Person 2: (1) reminders status `DONE` vs DB `SENT` and the missing `reminder_at` in the contract; (2) email lookup for shares needs a SECURITY DEFINER function to replace the interim admin lookup; (3) `listDocuments` excludes shared documents; (4) there is no conversation listing endpoint.

## Execution Phases

Execution is organized into four phases after the completed base cleanup. Tasks inside a phase run in parallel because their file sets are disjoint. Phases run strictly in order. The wave ids in the dependency graph map to phases as follows: wave 0 is Phase 0, wave 1 is Phase A, wave 2 is Phase B, wave 3 is Phase C, wave 4 is Phase D. Any "(Wave N)" label in a task title is a historical label from the earlier six-wave plan; the phases below and the dependency graph are authoritative for execution order.

### Phase 0 (done): Base cleanup and shared plumbing

- **Tasks**: 1.1.
- **Parallelism**: not applicable, a single task. It is already completed.
- **Starts when**: nothing is required.
- **Exit gate**: met. Typecheck is green and the shared plumbing (language mapping, safe messages, `useApiError`) is available to every later task.

### Phase A: Core loop (parallel)

- **Tasks**: 2.1 Upload, 3.1 Vault, 4.1 Document page, 8.1 Reminders API.
- **Why parallel**: 2.1 owns `/documents/new` and `src/features/documents/{upload,hooks,components}` for the composer. 3.1 owns the `/documents` vault page and its vault components and view-models. 4.1 owns `/documents/[documentId]`, the report wiring, the polling hook and the three slot files. 8.1 owns `src/features/reminders/` (mapping, service, types), `src/app/api/reminders/**` and `src/lib/api-client/reminders.ts`. Shared surfaces are limited to additive exports.
- **Before the phase starts**: Phase 0 is committed, and typecheck, lint and test are green on the branch.
- **Exit gate**: typecheck, lint, test and build all pass. The orchestrator runs the build once. There is one commit per task, and the phase is pushed at the end.

### Phase B: Report depth and home (parallel)

- **Tasks**: 5.1 Evidence viewer, 7.1 Follow-up chat, 9.1 Reminders UI, 10.1 Dashboard.
- **Why parallel**: 5.1 owns `src/features/documents/evidence/` plus `finding-item.tsx` and `analysis-report.tsx`. 7.1 owns `follow-up-slot.tsx` and `src/features/documents/chat/`. 9.1 owns `reminder-suggestions-slot.tsx`, `/reminders`, `src/features/reminders/components/**` and the navigation files `sidebar.tsx` and `mobile-nav.tsx`. 10.1 owns `src/app/(dashboard)/dashboard/page.tsx`, `src/features/dashboard/**` and one new read-only helper file under `src/features/reminders/services/`.
- **Before the phase starts**: Phase A is committed and pushed, and typecheck, lint, test and build are green. The slot files from 3.1 and 4.1 and the reminders API from 8.1 must exist.
- **Exit gate**: typecheck, lint, test and build all pass. The orchestrator runs the build once. There is one commit per task, and the phase is pushed at the end.

### Phase C: Act and share (parallel)

- **Tasks**: 6.1 Corrections, 11.1 Sharing.
- **Why parallel**: 6.1 owns `src/features/documents/corrections/`, the correction hook point in `analysis-report.tsx` and the removal of `correction-panel.tsx`. 11.1 owns `src/features/sharing/**`, the new share routes, `share-slot.tsx`, `shared-with-me-slot.tsx` and the read-only flag wiring in `document-view.tsx`. 11.1 must not edit `analysis-report.tsx`.
- **Before the phase starts**: Phase B is committed and pushed, and typecheck, lint, test and build are green. The evidence work (5.1) must be merged so 6.1 can edit `analysis-report.tsx` without conflicts.
- **Exit gate**: typecheck, lint, test and build all pass. The orchestrator runs the build once. There is one commit per task, and the phase is pushed at the end.

### Phase D: Release (sequential)

- **Tasks**: 12.1 Accessibility, responsive and final audit, then 13 final checkpoint.
- **Why sequential**: 12.1 audits and makes small fixes across all real routes, so it must not overlap with any other task. Task 13 is the checkpoint parent and is not a leaf, so it is not in the dependency graph. It runs after 12.1.
- **Before the phase starts**: Phase C is committed and pushed, and typecheck, lint, test and build are green.
- **Exit gate**: typecheck, lint, test and build all pass, the manual checklist file exists, and the scope audit lists zero forbidden-path changes. There is one commit per task, and the branch is pushed at the end.

## Notes

- Tasks run in phases (see Execution Phases). Tasks in the same phase touch disjoint files and run in parallel. The orchestrator runs `npm run build` once at the end of each phase.
- Per-task verification commands: `npm run typecheck`, `npm run lint`, `npm run test`. Use `npx prettier --write <touched files>` only; never run repo-wide formatting.
- Each functional task owns its tests; there are no stand-alone or optional test tasks, and the design has no Correctness Properties section, so no property-based tests are planned.
- The leaf id of each task is `N.1`; the dependency graph lists leaf ids only.

### Cross-task rules

1. Tasks in the same phase must not edit each other's files. If a needed file belongs to a sibling task, use the slot files created by Task 4.1 (`reminder-suggestions-slot.tsx`, `follow-up-slot.tsx`, `share-slot.tsx`) and Task 3.1 (`shared-with-me-slot.tsx`).
2. Parallel agents must NOT run `npm run build` (Next.js allows only one build at a time and it fails with a lock error). The orchestrator runs the build once at the end of each phase. Parallel agents run typecheck, lint and their own targeted vitest files, and ignore failures that originate in files owned by a sibling task, naming them in their report instead of fixing them.
3. Read-only and permissions: Task 6.1 adds an optional `canCorrect?: boolean` prop (default true) to `AnalysisReport` and hides all correction controls when false. Task 11.1 must NOT edit `analysis-report.tsx`; it passes `canCorrect={false}` and the other read-only flags from `document-view.tsx` only.
4. Task 4.1 must expose, from `document-view.tsx` and the report, the props the later tasks need: `readOnly` (boolean) passed down to every slot. The `onOpenEvidence(evidenceId)` plumbing is added by Task 5.1 inside `analysis-report.tsx` and `finding-item.tsx` only.
5. Task 9.1 owns edits to `sidebar.tsx` and `mobile-nav.tsx` (adding the Reminders link); no other task edits those files.
6. Task 10.1 owns `src/app/(dashboard)/dashboard/page.tsx` and `src/features/dashboard/**`; it may only ADD new files under `src/features/reminders/` (a read-only helper), never edit Task 8.1's files.
7. One commit per task by the orchestrator, conventional message, path-scoped staging.

### Other notes

- There is no `.env.local`, so nothing can be run against live Supabase in this environment; reports must say that instead of claiming a live run.
- Requirement references point at sections of `product.md`, which is read-only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "8.1"] },
    { "id": 2, "tasks": ["5.1", "7.1", "9.1", "10.1"] },
    { "id": 3, "tasks": ["6.1", "11.1"] },
    { "id": 4, "tasks": ["12.1"] }
  ]
}
```

Task 13 (final checkpoint) is a top-level parent task, not a leaf, so it is not in the graph. It runs after wave 4 completes.
