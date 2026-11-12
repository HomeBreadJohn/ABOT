# Implementation Plan: Phase 2 Documents and Dashboard

## Overview

Implement the Phase 2 document upload, document vault, dashboard, and placeholder detail experience as a TypeScript Next.js UI/platform slice. Follow the existing `design.md` architecture: shared pure upload and view-model modules, a server-only `DocumentsService` boundary with mock mode as the default, Server Actions for small upload metadata mutations, direct browser-to-Storage byte transfer only in the Supabase implementation, and Server Components for reads.

This plan is limited to Person 1 platform/UI work. It does not change `product.md`, `src/contracts`, Supabase migrations, the Lumen integration, or the behavior of processing, reports, evidence, corrections, chat, reminder editing, or sharing.

## Tasks

- [ ] 1. Establish the visual foundation and accessible application shell
  - [-] 1.1 Implement the semantic visual tokens and typography foundation
    - Update `src/app/globals.css` with the light/dark semantic tokens, Tailwind v4 `@theme inline` mappings, reduced-motion rules, focus treatment, radius, shadow, and type-scale rules from the design.
    - Update `src/app/layout.tsx` to apply the configured Geist and Source Serif variables through `next/font`, while preserving `brand.name` as the configurable brand source.
    - Use semantic token utilities only; do not add raw palette utilities or `dark:` component classes.
    - Keep large-text and future manual-theme attributes supported without adding their controls in Phase 2.
    - _Design: Visual Design System > Color tokens, Typography, Shape/depth/motion, Token wiring; product.md: §1.2, §7, §9.2, §9.3._
  - [ ]* 1.2 Add visual-foundation and contrast regression tests
    - Test that both dark-mode token blocks define matching token names and values, and that reduced-motion and text-size hooks remain present.
    - Render the updated shared primitives where practical and assert visible labels, focusable controls, and semantic token usage rather than class-name-only behavior.
    - _Design: Visual Design System > Verified contrast ratios and Token wiring; Testing Strategy > Example-based unit tests and Markup/accessibility tests; product.md: §1.2, §9._
  - [ ] 1.3 Refresh shared UI primitives without changing their public contracts
    - Update `button`, `card`, `badge`, `input`, `label`, `separator`, `empty-state`, `loading-state`, `form-message`, and `presentation-value` to use semantic tokens and the shared `:focus-visible` treatment.
    - Add the native token-styled `Select`, `StatusShape`, `StatusPill`, and `Skeleton` components with accessible labels, decorative SVG shapes, and no color-only status meaning.
    - Preserve existing props and behavior unless the design explicitly adds a required prop.
    - _Design: Components and Interfaces > Component inventory; Visual Design System > Iconography/status shapes and Shape/depth/motion; product.md: §9.2, §9.3, §9.4._
  - [ ] 1.4 Build the responsive shell and navigation frame
    - Update `DashboardShell` and the server-rendered sidebar content to use `brand.name`, the warm-neutral canvas, sample banner slot, one `main`, and the skip link target.
    - Add `SidebarFrame`, `SidebarNavLink`, `RecentDocumentsNav`, `AccountMenu`, `MobileTopBar`, and the redesigned `MobileNav` with expanded/rail state, `aria-expanded`, `aria-controls`, route-aware `aria-current`, Escape/scrim closing, and focus return.
    - Preserve `Settings` and sign-out access, the New upload action, and recent-document navigation while keeping the sidebar collapsed state in the documented cookie.
    - Keep Server Components as children of client shell components; do not move server-only reads or actions into client modules.
    - _Design: Architecture > Boundaries; Route map; Components and Interfaces > Component inventory and component trees; Visual Design System > App shell wireframes; product.md: §9, §16._
  - [ ] 1.5 Add shell loading, error, identity, and mock-mode presentation
    - Update dashboard loading and error states to use tokens and fixed safe copy.
    - Add the profile service display-name read, greeting/account initial data, `SampleDataBanner`, and mock-source indication without exposing raw errors or document content.
    - Implement `sidebar_state` cookie parsing and persistence with the documented defaults and attributes.
    - Add shell markup tests for one main, skip link, primary/recent navigation labels, accessible drawer behavior, and visible mock banner behavior.
    - _Design: Components and Interfaces > Component inventory; Sidebar state cookie; Error Handling; Security Considerations; product.md: §9.3, §16, §19.17._

- [ ] 2. Implement shared upload policy, validation, and queue state
  - [x] 2.1 Create the shared upload policy and action input schemas
    - Replace `src/features/documents/schemas/upload.ts` with policy-driven prepare, finalize, and discard schemas.
    - Add lifecycle and initial-schema policies for PDF, JPEG, PNG, TIFF, and WebP, with the initial profile excluding TIFF and WebP, a 10 MiB limit, a ten-file batch limit, accept attributes, and user-facing format labels.
    - Keep policy and schema modules free of `server-only` and React imports so the browser and server can share them.
    - _Design: Data Models > Upload policy and upload schemas; Data source/schema profile selection; product.md: §5.1, §5.2, §9.1._
  - [ ] 2.2 Implement pure filename, MIME, magic-byte, and storage-path helpers
    - Add `resolveMimeType`, `validateFileForUpload`, `sniffMimeType`, `sanitizeStorageFilename`, and `buildStoragePath` under `src/features/documents/upload`.
    - Preserve safe original filenames for metadata, derive storage extensions from validated MIME types, reject content/type mismatches, and avoid date or content inference.
    - Ensure helpers are deterministic and usable by both the composer and server service without importing server-only modules.
    - _Design: Key Functions with Formal Specifications; Security Considerations > Validation in depth and Filenames; product.md: §5.1, §9.1, §16._
  - [ ] 2.3 Implement the upload queue state machine
    - Add the reducer and upload item types for rejected, queued, preparing, uploading, finalizing, done, and failed phases.
    - Enforce valid transitions, monotonic byte progress, duplicate fingerprints, the ten non-rejected item cap, retryability, and removal behavior described by the state diagram.
    - Keep processing status separate from byte-upload progress and never model an invented OCR/analysis percentage.
    - _Design: Data Models > Upload queue item; Key Functions with Formal Specifications > uploadQueueReducer; product.md: §5.2, §9.1, §9.2._
  - [ ]* 2.4 Write property tests for upload validation and storage helpers
    - Add separate fast-check test coverage for **Property 1: Upload validation accepts exactly the allowed set**, **Property 2: Rejection reasons follow the check order**, and **Property 3: Initial schema never accepts TIFF or WebP**.
    - Add separate fast-check test coverage for **Property 4: Sanitized filenames are safe and idempotent**, **Property 5: Storage paths stay inside the owner's folder**, and **Property 6: Magic-byte sniffing recognizes exactly the five signatures**.
    - Run at least 200 cases per property and keep all tests in shared pure-module test files.
    - _Design: Correctness Properties 1–6; Testing Strategy > Property-based tests; product.md: §5.1, §5.2, §16._
  - [ ]* 2.5 Write property tests for queue limits and honest progress
    - Add separate fast-check test coverage for **Property 18: Upload progress is honest and monotonic** and **Property 19: The queue respects batch and duplicate limits**.
    - Assert that invalid transitions return the same state reference, percentages are shown only with positive totals, and `done` follows `finalizing` only.
    - _Design: Correctness Properties 18–19; Testing Strategy > Property-based tests; product.md: §5.2, §9.2._

- [ ] 3. Establish the documents data boundary and mock-first upload flow
  - [-] 3.1 Add documents environment resolution and the server-only service factory
    - Add `src/lib/env/documents.ts` with pure resolvers for `DOCUMENTS_DATA_SOURCE`, `DOCUMENTS_SCHEMA_PROFILE`, and `DOCUMENTS_MOCK_TODAY`, defaulting to mock/initial/fixed mock date as designed.
    - Add the `DocumentsService`, `DocumentsServiceError`, safe error-code messages, capability types, upload transport types, deadline signals, and list result types without changing shared contracts.
    - Add the cached server-only `getDocumentsService()` factory; any value other than trimmed case-insensitive `supabase` must select mock mode.
    - _Design: Architecture > Data source and schema profile selection, DocumentsService interface, Service factory; Security Considerations; product.md: §10, §16._
  - [ ]* 3.2 Test environment resolution and service-boundary invariants
    - Add unit tests for mock-default and exact Supabase selection, schema profile resolution, date fallback, safe fixed error messages, and service capabilities.
    - Add boundary tests proving client graphs cannot reach `server-only`, server secrets, service implementations, actions, or `@/mocks`, and that application code does not use `console.*` or render `error.message`.
    - _Design: Correctness Property 20; Testing Strategy > Boundary tests; product.md: §16._
  - [ ] 3.3 Implement pure Supabase row mapping for both schema profiles
    - Add row mappers that validate mapped `DocumentSummary` values, map initial lowercase statuses to the documented lifecycle statuses, derive titles where needed, and count skipped invalid rows.
    - Handle lifecycle columns, latest analysis/deadline data, capability differences, retry flags, and safe fallback values without changing `src/contracts`.
    - _Design: Data source/schema profile selection > Behavior under each migration; Data Models > Document status/card view inputs; product.md: §9.3, §9.4, §12, §13._
  - [ ]* 3.4 Test status mapping and skipped-row behavior
    - Add separate fast-check coverage for **Property 21: Legacy status mapping is total**.
    - Add example tests for both schema profiles, invalid rows, title fallback, retryability, and the no-reminders initial profile.
    - _Design: Correctness Property 21; Testing Strategy > Service/action tests; product.md: §9.2, §9.4, §13._
  - [ ] 3.5 Implement the server-only mock documents service
    - Import fixtures only from `src/features/documents/services/mock-documents-service.ts`; keep all other application modules free of `@/mocks` imports.
    - Require the authenticated session for every method, scope in-memory uploaded documents by session user, expose fixture documents plus session uploads, and implement mock prepare/finalize/discard behavior.
    - Return the lifecycle upload policy, mock transport, fixed safe errors, empty/available deadline and reminder data, and the configured mock source.
    - _Design: Architecture > Mocks, Authorization, Mock upload sequence; DocumentsService interface; product.md: §5.2, §9.3, §9.4, §16._
  - [ ] 3.6 Implement the Supabase service boundary without processing
    - Add the server-only Supabase service with session-derived ownership, initial/lifecycle policy selection, signed upload preparation, server revalidation, storage path recomputation, object validation/removal, idempotent finalization, list/detail reads, deadline reads, and capability mapping.
    - Use the user-scoped client for database operations and the narrowly scoped admin client only for post-upload object info/ranged validation/removal as documented.
    - Do not create processing jobs, call OCR, import Lumen code, accept owner IDs/storage paths from input, or change migrations/contracts.
    - Preserve the existing signed-url route as unchanged/deferred; direct browser bytes use the signed URL, while metadata mutations remain Server Actions.
    - _Design: Architecture > Boundaries, route map, Mutations, Supabase sequences; Key Functions > prepare/finalize/discard; Security Considerations; product.md: §5.1, §9.1, §10.2, §11, §13, §14, §16._
  - [ ]* 3.7 Test service ownership, idempotency, and non-processing guarantees
    - Mock Supabase clients to verify user IDs come from claims, paths are recomputed, initial/lifecycle profiles map correctly, mismatches remove objects, repeated finalization returns the existing owned row, and another user's document is not disclosed.
    - Assert no processing job, OCR, Lumen, report, or contract mutation is invoked by the Phase 2 service.
    - _Design: Security Considerations; Testing Strategy > Service/action tests and integration checks; product.md: §9.1, §13, §16._
  - [ ] 3.8 Implement upload Server Actions and safe action results
    - Add `prepareDocumentUploadAction`, `finalizeDocumentUploadAction`, and `discardDocumentUploadAction` in a `
server-only action module.
    - Parse unknown inputs with the corresponding Zod schema, re-check authentication through the service, return discriminated `ActionResult` values, map known service errors to safe API codes, and map unknown failures to generic `INTERNAL` without raw messages.
    - Keep the actions out of client import graphs; pages pass action functions to the client composer as props.
    - _Design: Mutations > Server Actions; Components and Interfaces > Server Actions in client UI; Error Handling > Upload errors; product.md: §9.1, §14, §16._
  - [ ]* 3.9 Test action parsing and safe error envelopes
    - Test malformed inputs, unsupported formats, expired sessions, provider failures, retryability, and unknown exceptions.
    - Assert action results never include raw Supabase/Postgres text and remain serializable to the client.
    - _Design: Error Handling; Testing Strategy > Service and action tests; product.md: §10.2, §14, §16._

- [ ] 4. Build document status, date, attention, and vault view models
  - [ ] 4.1 Implement total document and analysis presentation models
    - Add total status, analysis status, category, card, and presentation helpers under `src/features/documents/view-models`.
    - Map every contract `DocumentStatus` to visible label, description, icon, tone, shape, group, processing flag, and attention reason; map every analysis status/document-status pair without inventing processing progress.
    - Format category, file type, file size, page count, uploaded date, failure reason, and document links for the vault/detail UI.
    - _Design: Data Models > Document status view, Analysis status view, Categories, Document card view; Visual Design System > Iconography/status shapes; product.md: §3.4, §9.2, §9.4, §13._
  - [ ] 4.2 Implement Manila date and deadline helpers
    - Add date-only parsing/formatting and Asia/Manila helpers that never parse `yyyy-mm-dd` with `new Date(string)`.
    - Add deadline item construction, conflict grouping, fallback summaries, provisional cues, reminder merging, bucket assignment, total ordering, and dashboard-window filtering.
    - Preserve every source date verbatim, keep null dates as unclear/to-confirm, and never silently choose among conflicting dates.
    - _Design: Deadline and Reminder Logic; Key Functions > buildDeadlineItems and date helpers; product.md: §3.4, §9.3, §9.4, §16._
  - [ ] 4.3 Implement attention classification and vault filtering/query models
    - Add attention reason classification and ordering, including status, past/soon dates, unreadable pages, and uncertain/conflicting dates.
    - Add vault query parsing/serialization, category/status filters, accent-folded term search, all five sorts, and deterministic ID tie-breakers.
    - Keep the vault status groups distinct from dashboard date-based attention, as specified.
    - _Design: Attention Classification; Data Models > Vault query; Correctness specifications > filterAndSortDocuments and query helpers; product.md: §9.3, §9.4._
  - [ ]* 4.4 Write property tests for status presentation and group partitioning
    - Add separate fast-check coverage for **Property 7: Status presentation is total and never color-only** and **Property 8: Vault status groups partition the lifecycle**.
    - Assert each status has visible text, icon, shape, tone, and exactly one vault group.
    - _Design: Correctness Properties 7–8; Testing Strategy > Property-based tests; product.md: §3.4, §9.2, §9.4, §13._
  - [ ]* 4.5 Write property tests for attention membership and ordering
    - Add separate fast-check coverage for **Property 9: Attention membership matches its definition** and **Property 10: Attention order is sorted and complete**.
    - Assert completed documents without relevant dates or uncertain information are excluded, and emitted attention items are a complete deterministically ordered set.
    - _Design: Correctness Properties 9–10; Testing Strategy > Property-based tests; product.md: §3.4, §9.3._
  - [ ]* 4.6 Write property tests for deadline provenance and ordering
    - Add separate fast-check coverage for **Property 11: Deadline items never invent dates**, **Property 12: Deadline order is total and input-order independent**, **Property 13: Conflicting dates are always grouped and shown together**, and **Property 14: Buckets depend only on the day difference**.
    - Assert merged reminders occur once, null dates remain to-confirm, conflict dates remain together, and dates outside the dashboard window are omitted.
    - _Design: Correctness Properties 11–14; Testing Strategy > Property-based tests; product.md: §3.4, §8, §9.3, §9.4._
  - [ ]* 4.7 Write property tests for dates and vault filtering/query round trips
    - Add separate fast-check coverage for **Property 15: Manila dates and date-only formatting do not shift days**, **Property 16: Vault filtering is sound**, and **Property 17: Vault query parsing is total and round-trips**.
    - Add example tests for Filipino/diacritic search, every sort, default-query permutation, invalid URL values, and date formatting around midnight/time-zone boundaries.
    - _Design: Correctness Properties 15–17; Testing Strategy > Property-based tests and example tests; product.md: §7, §9.3, §9.4._
  - [ ]* 4.8 Test view-model examples from the mock fixtures
    - Assert all fixture documents render status, analysis, category, card, and deadline views without throwing.
    - Verify the government notice produces the two-date conflict, provisional state, and merged reminder; verify completed-needs-correction analysis displays "Done, provisional".
    - _Design: Example Usage; Testing Strategy > Example-based unit tests; product.md: §3.4, §9.3, §9.4._

- [ ] 5. Implement the upload composer and upload interaction layer
  - [ ] 5.1 Implement direct upload transport and drop-zone helpers
    - Add the client-only XHR transport with progress, timeout, abort, HTTP 409 handling, and network/error classification as specified.
    - Add the drag/drop hook as an enhancement while retaining keyboard and button input paths, and add the queue orchestration hook that serializes actions, limits byte-transfer concurrency to three, reuses valid tickets, and refreshes once after the batch settles.
    - Keep browser file bytes out of Server Actions and never expose signed paths in the URL bar or logs.
    - _Design: Upload composer props/hooks; Mutations; Upload sequences; Error Handling > Upload errors; product.md: §5.2, §9.1, §16._
  - [ ] 5.2 Implement queued-file chips and per-file state presentation
    - Add `QueuedFileChip` with file identity, size, phase text, honest byte progress, retry/remove controls, fixed safe error copy, and polite/alert announcements.
    - Represent rejected, preparing, uploading, finalizing, received, and failed states without claiming OCR/analysis has begun.
    - Ensure controls have 44px targets, visible labels, progress semantics, and no reliance on color alone.
    - _Design: Components and Interfaces > QueuedFileChip; Wireframes > Upload composer; Error Handling > Upload errors; Visual Design System > Readable for everyone; product.md: §5.2, §9.1, §9.2._
  - [ ] 5.3 Implement the accessible upload composer and input variants
    - Add `UploadComposer` and `ComposerActions` as client components with choose-files, coarse-pointer camera capture, gallery, drag/drop, multi-file queue, upload submit, live region, and policy-derived helper text.
    - Include visually hidden but labeled file inputs with the exact accept/capture behavior, support wrapping at 320px without horizontal scroll, and disable submission until a valid queued file exists.
    - Pass Server Actions and serializable policy props from Server Component pages; never import service/action modules into the client component.
    - _Design: Components and Interfaces > UploadComposer/ComposerActions and component trees; Wireframes > Dashboard and upload composer; Visual Design System > Layout metrics; product.md: §5.1, §5.2, §9.1, §9.2._
  - [ ] 5.4 Wire mock-default upload into dashboard and focused upload routes
    - Update `/dashboard` with the static greeting/composer shell and the configured upload policy/actions.
    - Create `/documents/new` with the focused upload heading, privacy copy, and the same composer action boundary.
    - Make mock mode the default demonstration path, show the mock banner, finalize uploads into the per-user mock store, and call `router.refresh()` once after a batch.
    - _Design: Route map; Mutations; Mock upload sequence; Component trees; product.md: §5.2, §9.1, §9.3._
  - [ ]* 5.5 Test composer markup and upload interaction boundaries
    - Test rendered input attributes, labels, live-region messages, disabled submit behavior, retry/remove affordances, progress semantics, and no invented OCR/analysis copy.
    - Test that pages pass actions as props and that no client module imports actions, service implementations, `server-only`, or `@/mocks`.
    - _Design: Testing Strategy > Markup/accessibility and boundary tests; Security Considerations; product.md: §5.2, §9.1, §16._

- [ ] 6. Build the document vault
  - [ ] 6.1 Implement vault rows, lists, toolbar, and empty-state variants
    - Add `DocumentRow`, `DocumentList`, `VaultToolbar`, `VaultEmptyState`, and `RefreshButton` using the card/status/deadline view models.
    - Render one stretched title link per row with title, category/subtype, upload date, processing status, analysis status, next deadline or failure reason, and mobile card layout.
    - Include debounced search, URL-backed category/status/sort controls, deterministic query serialization, a skipped-row notice, and a refresh action that announces completion.
    - _Design: Components and Interfaces > VaultToolbar, DocumentRow/List, VaultEmptyState, RefreshButton; Wireframes > Vault list and empty states; product.md: §9.3, §9.4._
  - [ ] 6.2 Implement the server-rendered vault content and route
    - Add `VaultContent` and update `/documents` to await `searchParams` inside Suspense, parse invalid values to defaults, load service data/signals/reminders in parallel, build deadline items, filter/sort rows, and render summary/list/empty states.
    - Use the service interface only, keep all data reads server-side, and preserve the mock banner and ownership boundary.
    - Add token-based loading and generic error states with no raw error text.
    - _Design: Component tree for `/documents`; Caching and Suspense strategy; Route map; Error Handling; product.md: §9.3, §9.4, §16._
  - [ ]* 6.3 Test vault component markup and query behavior
    - Test heading/row/link structure, visible processing and analysis labels, deadline/failure metadata, empty/no-match variants, skipped-row notice, refresh announcement, and responsive-friendly markup.
    - Test query URL updates for search/filter/sort and invalid query fallback without introducing a Route Handler.
    - _Design: Testing Strategy > Markup/accessibility tests; Data Models > Vault query; product.md: §9.3, §9.4, §14._

- [ ] 7. Build the dashboard priority sections
  - [ ] 7.1 Implement the cached dashboard snapshot and greeting data flow
    - Add the server-only cached `getDashboardSnapshot()` that loads documents, deadline signals, reminders, and source data in parallel, computes today once, and derives the dashboard view models.
    - Add `Greeting` with Asia/Manila morning/afternoon/evening copy and a nameless fallback, and keep request-time reads behind Suspense.
    - Never use current time during prerendering and never expose a report or analysis text in the Phase 2 dashboard.
    - _Design: Caching and Suspense strategy; Dashboard snapshot; Display name; Components and Interfaces > Greeting; product.md: §7, §9.3, §16._
  - [ ] 7.2 Implement attention and deadline/reminder sections
    - Add `AttentionSection` with up to five ordered items, reason-specific messages/actions, review/open links, and the total count link.
    - Add `DeadlinesSection` with bucket headings, conflict/unclear/provisional cues, Manila labels, reminder bell cues, the capability-off message, and the eight-item cap/link.
    - Keep past dates calm, never invent dates, and never expose reminder editing controls.
    - _Design: Attention Classification; Deadline and Reminder Logic; Components and Interfaces > AttentionSection/DeadlinesSection; product.md: §3.4, §8, §9.3, §9.4._
  - [ ] 7.3 Implement recent/all sections, first-run state, and dashboard composition
    - Add `RecentlyAnalyzedSection`, `AllDocumentsSection`, and `FirstRunCard` with the documented limits, links, and honest first-visit copy.
    - Update `/dashboard` to compose the greeting, upload composer, priority sections, section-level Suspense/error boundaries, and the no-documents first-run branch in the specified order.
    - Ensure each section can fail independently with the fixed safe fallback and that the page remains usable at mobile widths.
    - _Design: Components and Interfaces > dashboard component tree; Wireframes > Dashboard and empty/error states; Error Handling; product.md: §9.3, §19.17._
  - [ ]* 7.4 Test dashboard section behavior and accessibility
    - Test priority ordering, attention count/link, deadline buckets/conflict copy, recent/all limits, reminder capability messaging, first-run copy, and section error fallback.
    - Test accessible headings, links, status labels, live updates, and absence of report/evidence/processing-percentage claims.
    - _Design: Testing Strategy > Markup/accessibility tests and example tests; product.md: §9.2, §9.3, §9.4, §19.17._

- [ ] 8. Add the placeholder document detail route
  - [ ] 8.1 Implement the server-only detail route and placeholder view
    - Create `/documents/[documentId]` with awaited `params`, UUID/ownership-safe `getDocument`, Suspense fallback, refresh action, page header, status/analysis/category/date/file facts, page count/failure reason, and upcoming dates.
    - Render only the fixed notice that the detailed report is not available here yet; do not render report text, evidence, correction controls, retry controls, chat, or download/preview content.
    - Use `notFound()` for invalid, missing, or not-visible IDs without revealing whether another user's document exists.
    - _Design: Route map; Placeholder detail page; Component inventory > DocumentDetailPlaceholder; Security Considerations; product.md: §9.4, §13, §14, §16._
  - [ ]* 8.2 Test detail routing and scope exclusions
    - Test valid mock detail rendering, invalid/missing/foreign-document not-found behavior, fixed safe copy, facts/status/deadline presentation, and refresh behavior.
    - Assert the placeholder contains no report/evidence/OCR correction/chat/reminder-editing/sharing/Lumen UI or Phase 3 retry action.
    - _Design: Testing Strategy > Markup/accessibility and service tests; Open Questions > retry path; product.md: §4, §5.4, §9.5, §14, §17._

- [ ] 9. Complete cross-route responsive, accessibility, and integration verification
  - [ ] 9.1 Add cross-route integration tests for mock-first platform behavior
    - Exercise authenticated mock flows for shell, dashboard, upload preparation/finalization, vault listing/filtering, refresh, and placeholder detail navigation.
    - Verify uploaded documents are visible only to the current mock user, fixture documents are clearly marked as sample data, and no Phase 2 operation triggers OCR, Lumen, processing jobs, reports, or contract changes.
    - _Design: Architecture > Mock behavior and authorization; Testing Strategy > Service/action tests and integration checks; product.md: §5.2, §9.1, §9.3, §16._
  - [ ] 9.2 Add responsive/accessibility regression coverage
    - Cover 320, 375, 768, 1024, and 1440px layouts, no horizontal overflow, expanded/rail/drawer shell states, keyboard-only navigation, focus return, reduced motion, dark mode, browser zoom, and default font-size changes.
    - Assert accessible names, heading hierarchy, landmark labels, focus-visible styling, 44px targets, status icon/shape/text combinations, and contrast-token usage across shell, composer, vault, dashboard, and detail views.
    - _Design: Visual Design System > Verified contrast ratios, Layout metrics, Iconography, Wireframes; Testing Strategy > Manual verification; product.md: §1.2, §7, §9, §16._
  - [ ] 9.3 Run the complete Phase 2 verification suite and preserve excluded boundaries
    - Run the commands in the Notes section, fix failures without editing `product.md`, `src/contracts`, Supabase migrations, `src/lib/ai`, proxy/session-refresh behavior, or existing signed-url route behavior.
    - Confirm the final diff contains only Phase 2 UI/platform files and tests, and that no new Lumen/OCR/report/evidence/correction/chat/reminder-editing/sharing implementation was introduced.
    - _Design: Handoff Notes > How to verify; Testing Strategy > Validation commands and boundary tests; product.md: §10.2, §11, §14, §17, §19._

- [ ] 10. Checkpoint - Ensure all tests pass, ask the user if questions arise.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Implementation language: TypeScript, following the existing Next.js App Router project conventions and the specific Next.js guidance referenced by `AGENTS.md` and `design.md`.
- Tasks marked with `*` are optional test tasks. Core implementation tasks are not optional.
- Correctness-property tasks are separate by property group and must use fast-check with at least 200 cases per property, as required by `design.md`.
- Use Server Components for reads and pass Server Actions as props to client components. Do not import service implementations, actions, `server-only`, secrets, or `@/mocks` into client graphs.
- The default path is mock mode. The Supabase implementation is a boundary for authenticated storage/database behavior only; Phase 2 never calls Lumen, submits OCR, creates processing jobs, renders processing percentages, or shows a report.
- Preserve `src/contracts`, all migrations, `product.md`, Lumen modules/configuration, proxy/session refresh behavior, and the existing signed-url Route Handler unless a task explicitly identifies a non-behavioral integration point. No task edits `product.md`.
- API choice: use Server Actions for prepare/finalize/discard metadata mutations and direct signed-URL browser uploads for bytes. Do not add the deferred REST document endpoints in Phase 2.
- Required verification commands:

  ```text
  npm run typecheck
  npm run lint
  npm run format:check
  npm run test
  npm run build
  ```

- Local Supabase checks, when available, use `npm run db:start` with `DOCUMENTS_DATA_SOURCE=supabase` and `DOCUMENTS_SCHEMA_PROFILE=initial`; they are integration checks for the service boundary, not a request to apply the proposal migration.
- Checkpoint format: ensure all tests pass and ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "3.3", "4.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["1.2", "2.4", "2.5", "3.2", "3.4", "3.5", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 3, "tasks": ["1.4", "3.6", "3.8", "5.1", "5.2", "6.1", "7.1"] },
    { "id": 4, "tasks": ["1.5", "3.7", "3.9", "5.3", "6.2", "7.2"] },
    { "id": 5, "tasks": ["5.4", "6.3", "7.3", "8.1"] },
    { "id": 6, "tasks": ["5.5", "7.4", "8.2", "9.1", "9.2"] },
    { "id": 7, "tasks": ["9.3"] }
  ]
}
```
