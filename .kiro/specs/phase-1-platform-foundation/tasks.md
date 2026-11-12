# Implementation Plan: Phase 1 Platform Foundation

## Overview

Implement the Phase 1 platform foundation described in `requirements.md` and `design.md` using the existing Next.js App Router, TypeScript, Supabase SSR, Tailwind, Zod, and Vitest conventions. Work must remain independent of Person 2's unresolved `Analysis_Contract`: foundation code may consume opaque primitive presentation values and deterministic mock view data, but it must not modify analysis contracts, add analysis fields, call Lumen, or persist document-domain intelligence records.

Each implementation task is an incremental prompt for a code-generation agent. Complete the tasks in dependency order, keep changes scoped to the files named by the task, and run the listed single-run verification commands after each task. Test tasks are optional only where marked `*`; core implementation tasks are required.

## Scope guardrails

- Do not implement upload, document vault behavior, OCR, processing screens, reports, evidence navigation, OCR correction, chat, reminders, sharing, Lumen integration, production analysis orchestration, or analysis-contract redesign.
- Do not add or revise fields, validation rules, meanings, or schemas in `src/contracts`.
- Do not make client code responsible for session authorization, profile ownership, service-role credentials, provider credentials, provider endpoints, or raw provider errors.
- Use only mock data or primitive view data for foundation previews. Label preview content as `Sample` or `Mock data`.
- Preserve the existing contract assertions in `src/contracts/contracts.test.ts` and existing owner/share/storage policy behavior.

## Tasks

- [x] 1. Establish shared foundation contracts and test seams
  - [x] 1.1 Define the profile language vocabulary and validation boundary
    - Create the profile feature modules under `src/features/profile/` for the `PreferredLanguage` union, ordered option metadata, display labels, stored codes, and Zod validation.
    - Support exactly `English`/`en`, `Filipino`/`fil`, and `Taglish`/`taglish`; treat `en` as the default without importing or extending any analysis contract.
    - Export only serializable profile values and safe validation messages for server and client consumers.
    - Acceptance criteria: the exported option list contains exactly three choices in the design order; `en`, `fil`, and `taglish` parse successfully; unsupported values fail before persistence; no file under `src/contracts` changes.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 2.1, 2.2, 2.5, 3.5, 6.5_

  - [x] 1.2 Define the generic presentation adapter contract
    - Create a platform-owned presentation module under `src/lib/presentation/` with serializable view types for `status`, `severity`, and `certainty`, supported labels, non-color cues, tones, and the neutral unknown result.
    - Accept category plus opaque raw values through adapter input. Keep domain contract imports out of the adapter unless an existing value is consumed without redefining it.
    - Acceptance criteria: supported values produce a category, human-readable label, and non-color cue; unsupported values produce `Unknown value`, neutral treatment, no category label, and no exception; no analysis schema or contract file is changed.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 1.3 Add reusable test doubles for session, profile, and presentation boundaries
    - Add narrowly scoped Vitest helpers or fixtures under the existing test convention for authenticated and unauthenticated Supabase responses, profile persistence outcomes, and opaque presentation values.
    - Keep fixtures deterministic and local. Do not create production user accounts, real document records, Lumen requests, or client imports of server-only modules.
    - Acceptance criteria: later service, route, auth, and presentation tests can exercise success, missing-session, ownership-mismatch, persistence-failure, supported-value, and unknown-value cases without network access.
    - Verification: `npm run test`; `npm run typecheck`.
    - _Requirements: 5.3, 5.5, 6.1, 7.1, 7.4_

- [x] 2. Harden authentication and protected-session behavior
  - [x] 2.1 Normalize authentication failures into safe retryable categories
    - Update `src/features/authentication/services/authenticate.ts` to retain credential validation, map provider failures to stable user-safe categories, and prevent raw provider responses, credentials, tokens, cookies, or environment values from escaping.
    - Preserve the existing browser-only Supabase client boundary and registration confirmation behavior.
    - Acceptance criteria: sign-in, registration, and sign-out failures expose only safe messages; invalid input is rejected before a provider call; no secret-bearing value appears in a thrown error or log; successful operations keep their existing navigation contract.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 1.3, 1.4, 5.4, 7.5_

  - [x] 2.2 Preserve the server-authoritative protected-route guard and expired-session redirect
    - Update `src/app/(dashboard)/layout.tsx`, the auth route pages, and related server-only session handling so missing, invalid, or expired claims redirect to `/login` before private shell or child content renders.
    - Support a non-sensitive expired-session reason where needed, and render a generic correction or sign-in message without tokens, provider errors, or private route data.
    - Keep `src/proxy.ts` and `src/lib/supabase/middleware.ts` limited to cookie/session refresh; do not move authorization into Proxy.
    - Acceptance criteria: unauthenticated and expired sessions render no private workspace HTML; authenticated claims render `DashboardShell` and the requested child route; session-expired messaging is generic and retryable; Proxy remains an optimistic cookie-refresh helper.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run build`.
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 7.5_

  - [x] 2.3 Wire accessible auth and sign-out feedback
    - Update `src/features/authentication/components/auth-form.tsx` and `src/components/shared/sign-out-button.tsx` to use safe error mapping, retry/correction actions, pending states, `role="alert"` for errors, and `role="status"` for confirmation/progress.
    - Preserve focus on the active control after asynchronous results unless the user explicitly chooses navigation. Route successful sign-out to `/login` and refresh the route tree; keep failed sign-out retryable on the current page.
    - Acceptance criteria: login and registration expose labeled controls and safe feedback; registration confirmation is announced; sign-in and sign-out success/failure behavior matches the design; no raw provider error is rendered.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 1.3, 1.4, 4.2, 4.3, 4.6, 7.5_

  - [ ]* 2.4 Add authentication and session audit tests
    - Add focused Vitest coverage for registration, sign-in, sign-out, session refresh behavior, missing claims, expired-session redirects, authentication failure mapping, and retryable UI feedback.
    - Mock Supabase and Next navigation boundaries. Do not require a production account or make a network request.
    - Record pass/fail evidence in test names and assertions for each audit area, including protected-route enforcement and secret-safe error behavior.
    - Acceptance criteria: tests fail when private content renders without claims, when sign-out does not navigate correctly, or when provider details leak into UI errors; all existing contract tests continue to run.
    - Verification: `npm run test`; `npm run typecheck`.
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 5.3, 5.5, 5.6, 7.5, 7.6_

- [x] 3. Implement the profile preferred-language service and settings flow
  - [x] 3.1 Add a profile-language database migration without changing analysis tables
    - Create a new migration under `supabase/migrations/` that normalizes existing unsupported `preferred_language` values to `en`, adds the allowed-value check for `en`, `fil`, and `taglish`, and preserves the existing profile primary key, auth foreign key, default, trigger, timestamps, and RLS.
    - Do not modify document, analysis, task, share, processing-job, storage, or analysis-contract schema behavior.
    - Acceptance criteria: the migration is repeatable through the repository's Supabase workflow; new profiles default to `en`; unsupported stored values cannot remain; exactly one profile is still created by the existing auth-user trigger; profile select/update policies remain owner-only.
    - Verification: `npm run db:reset` when local Supabase is available; `npm run db:types`; `npm run typecheck`.
    - _Requirements: 2.2, 2.5, 2.6, 2.7, 7.2, 7.3_

  - [x] 3.2 Implement the server-only current-profile service
    - Create `src/features/profile/services/profile-service.ts` with `getCurrentProfile`, `updateCurrentPreferredLanguage`, and controlled missing-profile handling using the server Supabase client.
    - Derive the owner only from the current authenticated session. Accept no client `user_id`, `owner_id`, or profile primary key. Validate the language before mutation and return generic persistence/authorization errors.
    - Acceptance criteria: reads and writes target only the current session user; invalid language leaves the previous value unchanged; missing sessions are denied; raw database errors and unrelated profile fields do not cross the service boundary; the module is server-only.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 2.3, 2.5, 2.6, 5.3, 6.4, 7.1, 7.4, 7.5_

  - [x] 3.3 Add the profile route handler
    - Create `src/app/api/profile/route.ts` with server-side `GET` and `PATCH` handlers that delegate to the profile service and set no-store behavior for per-user data.
    - Accept only the preferred-language value. Ignore any client owner field for authorization and return `401` without a valid session, `400` for unsupported language, safe success data for valid updates, and generic `500` for unexpected persistence failures.
    - Acceptance criteria: the handler never chooses a profile from URL, body, or hidden owner fields; responses contain no tokens, service-role data, raw SQL/policy errors, or unrelated profile data; invalid requests do not change persistence.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run build`.
    - _Requirements: 2.3, 2.5, 2.6, 5.3, 5.4, 7.1, 7.4, 7.5_

  - [x] 3.4 Replace the settings placeholder with the preferred-language UI
    - Update `src/app/(dashboard)/settings/page.tsx` as a Server Component to load the current profile and pass only safe serializable values to a new client component under `src/features/profile/components/`.
    - Render exactly three radio or select choices, default to the saved value or `English`, submit through `/api/profile`, announce success with `role="status"`, announce validation/persistence failures with `role="alert"`, and remain usable at 320 CSS pixels.
    - Acceptance criteria: settings displays exactly English, Filipino, and Taglish; a successful save persists and reloads the current user's choice; unsupported values cannot be submitted successfully; no owner ID is inferred from URL parameters or hidden fields.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run build`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 4.4, 6.5_

  - [ ]* 3.5 Add profile service, route, and settings tests
    - Add example-based Vitest coverage for all three supported languages, default English, unsupported values, missing sessions, mismatched owner input, persistence failures, successful reload, and safe route responses.
    - Include a local Supabase integration path when available for exactly-one-profile creation, owner read/write, and cross-user denial. Keep unit tests runnable without a local instance and without external network access.
    - Acceptance criteria: tests prove that the authenticated session determines ownership, invalid values preserve prior state, another user cannot read/update the profile, and the UI exposes exactly three choices.
    - Verification: `npm run test`; `npm run typecheck`; `npm run db:reset` when local Supabase is available.
    - _Requirements: 2.1–2.7, 5.2, 5.3, 5.5, 7.1, 7.2, 7.4, 7.6_

- [x] 4. Complete shared UI primitives and generic presentation components
  - [x] 4.1 Complete the independent shared UI primitive set
    - Extend the existing modules under `src/components/ui/` for buttons, inputs, labels, cards, badges, separators, form feedback, loading states, and empty states.
    - Preserve existing shadcn-style and Tailwind conventions. Add explicit labels/descriptions/error linkage, disabled/pending behavior, visible focus treatment, status/alert roles, heading/description support, and non-color cues without introducing document-specific components.
    - Acceptance criteria: every primitive can be composed independently; interactive primitives expose accessible names and focus states; loading/success feedback uses `role="status"`; errors use `role="alert"`; empty states include a heading, explanation, and optional action.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run format:check`.
    - _Requirements: 3.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 4.2 Implement the reusable presentation component
    - Add a component under `src/components/ui/` that consumes the generic adapter from `src/lib/presentation/` and renders category separately from the value label.
    - Include a text/icon/symbol/shape cue that remains understandable without color. Render `Unknown value` with neutral styling and no category for unsupported values while preserving surrounding content.
    - Acceptance criteria: supported status, severity, and certainty values render their category, label, and non-color cue; unknown values render neutral fallback only; the component accepts primitive props or adapter output and does not redefine `src/contracts`.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run format:check`.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.5_

  - [ ]* 4.3 Add primitive and presentation component tests
    - Add Vitest/React tests for accessible labels, focus-visible classes, loading and success status announcements, error alerts, supported category/label rendering, non-color cues, and unknown-value fallback.
    - Keep tests independent of browser services, Lumen, real documents, and finalized analysis payloads.
    - Acceptance criteria: every affected fallback and announcement behavior is asserted; tests prove unknown values do not throw or render a category; existing contract tests remain unchanged and passing.
    - Verification: `npm run test`; `npm run typecheck`.
    - _Requirements: 3.1–3.6, 4.2, 4.3, 4.5, 5.3, 5.5, 5.6_

- [x] 5. Establish the mock-only foundation preview boundary
  - [x] 5.1 Define deterministic primitive preview data with explicit sample labeling
    - Create a platform-owned mock/view-data module under `src/features/platform/` or `src/mocks/platform/` containing only deterministic titles and primitive status, severity, or certainty descriptors.
    - Include an explicit `isMock` or `contentLabel` boundary that renders as `Sample` or `Mock data`. Do not add document IDs, analysis IDs, storage paths, provider metadata, persistence calls, or new analysis-contract fields.
    - Acceptance criteria: preview data is local and deterministic; mock content is visibly labeled; no preview path imports a live Lumen client or writes document-domain records; data crosses into UI through primitive props or adapters.
    - Verification: `npm run typecheck`; `npm run lint`.
    - _Requirements: 3.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.2 Compose the preview into an existing authenticated foundation surface
    - Add a small foundation preview to the existing dashboard surface using `Card`, `Badge`/presentation components, `EmptyState` or `LoadingState` as appropriate, and the deterministic mock data from 5.1.
    - Keep the preview clearly separate from a completed user analysis and ensure it works with the authenticated shell without introducing document workflow behavior.
    - Acceptance criteria: authenticated users can render a labeled sample preview; public and protected routes do not make a Lumen request; no Phase 1 code creates, updates, or deletes analysis, OCR, evidence, correction, conversation, reminder, or sharing records.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run build`.
    - _Requirements: 3.6, 4.4, 6.1, 6.2, 6.3, 6.5_

  - [ ]* 5.3 Add mock-boundary regression tests
    - Add tests proving preview data is deterministic, visibly labeled as sample/mock, uses only primitive presentation inputs, and does not require a live provider or persistence operation.
    - Add a source-level or module-boundary assertion that client-side foundation code does not import provider credentials, service-role environment values, or Lumen modules.
    - Acceptance criteria: tests fail if mock previews are presented as completed analyses, if provider calls are introduced, or if provider secrets cross into client code.
    - Verification: `npm run test`; `npm run typecheck`; `npm run build`.
    - _Requirements: 5.5, 6.1–6.5, 7.5, 7.6_

- [x] 6. Apply accessibility, keyboard, responsive, and contrast groundwork
  - [x] 6.1 Normalize page landmarks, headings, and navigation labels
    - Update `src/app/page.tsx`, `src/app/(auth)/layout.tsx`, public fallback pages, `src/components/layout/dashboard-shell.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/mobile-nav.tsx`, and affected route pages.
    - Ensure each rendered page has exactly one page-level `main`, at least one meaningful `h1`, and explicitly labeled navigation landmarks. Give repeated desktop/mobile navigation landmarks distinct labels.
    - Acceptance criteria: public, auth, dashboard, settings, documents, and fallback pages expose one main landmark, a page-purpose heading, and labeled navigation without nested `main` elements.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run build`.
    - _Requirements: 4.1, 4.4_

  - [x] 6.2 Make keyboard focus and asynchronous interaction behavior consistent
    - Update interactive components and mobile navigation so native controls are used, no positive `tabindex` is introduced, focus-visible indicators are visible, expanded/collapsed state is exposed, hidden menu content is removed from the tab order, and focus returns to the trigger on close.
    - Wire async messages from auth, sign-out, profile, and shared feedback components so status/success/error announcements preserve the user's current focus.
    - Acceptance criteria: keyboard traversal follows reading/interaction order; every interactive control has a visible focus indicator; icon-only controls have accessible names; mobile menu focus behavior is deterministic; async errors use alerts and status updates use status announcements.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run format:check`.
    - _Requirements: 4.2, 4.3, 4.6, 1.3, 2.3_

  - [x] 6.3 Tune responsive layout and contrast for foundation surfaces
    - Update the existing Tailwind classes and shared styles in the affected app, layout, auth, settings, navigation, and preview components without introducing fixed desktop-only widths.
    - Check the design at 320, 375, 768, 1024, and 1440 CSS pixels. Ensure primary navigation, auth forms, settings controls, and previews do not require horizontal scrolling. Preserve non-color status/focus cues and meet WCAG 2.2 AA contrast targets for text and essential controls.
    - Acceptance criteria: required controls remain visible and operable across the specified widths; text and essential non-text controls meet the stated contrast thresholds; disabled/focus/status states remain distinguishable without color alone.
    - Verification: `npm run lint`; `npm run format:check`; `npm run build`.
    - _Requirements: 4.4, 4.5, 4.6, 6.2_

  - [ ]* 6.4 Add static accessibility and responsive regression tests
    - Add tests for landmark count, heading presence, navigation labels, role assignments, icon-only names, focus-visible classes, and mock preview labeling using the existing Vitest setup.
    - Add deterministic assertions for fluid/wrapping class contracts where static testing is appropriate. Keep viewport, keyboard traversal, focus return, announcement timing, and contrast checks documented as manual/browser checks in test names or comments without adding a browser framework unless required by the existing repository.
    - Acceptance criteria: automated tests catch duplicate main landmarks, missing h1/navigation labels, unlabeled icon-only controls, wrong announcement roles, and removal of sample labels.
    - Verification: `npm run test`; `npm run typecheck`; `npm run lint`.
    - _Requirements: 4.1–4.6, 5.3, 5.5_

- [x] 7. Encode ownership, RLS, and secret-handling audit checks
  - [x] 7.1 Add automated profile ownership and policy-shape audit coverage
    - Add a security-focused test module under the existing `src/**/*.test.ts` convention that checks profile service calls derive owner identity from the authenticated session, reject unauthenticated access, ignore mismatched client owner input, and preserve the profile on invalid requests.
    - Add migration/policy assertions for `profiles` RLS, owner-only select/update, the preferred-language check, the auth-user profile trigger, and continued owner/explicit-share restrictions for documents, analyses, tasks, shares, processing jobs, and private Storage.
    - Acceptance criteria: the audit has pass/fail assertions for every profile and downstream policy named in the design; test output identifies the checked route/service files, migration/policy names, and relevant automated checks.
    - Verification: `npm run test`; `npm run typecheck`; `npm run db:reset` when local Supabase is available.
    - _Requirements: 1.5, 2.6, 2.7, 5.3, 5.6, 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x] 7.2 Add server-only secret boundary checks
    - Add tests or static module-boundary checks proving `SUPABASE_SERVICE_ROLE_KEY`, future Lumen variables, provider endpoints, and raw provider/database errors remain server-only and are absent from client component imports, rendered markup, user-facing errors, and application logs.
    - Preserve the existing `server-only` boundary in `src/lib/env/server.ts` and do not add a service-role dependency to the profile flow.
    - Acceptance criteria: client-facing auth/profile/preview modules cannot import server secrets; safe error assertions reject tokens, credentials, raw provider response bodies, and secret values; the build remains provider-independent.
    - Verification: `npm run test`; `npm run typecheck`; `npm run build`.
    - _Requirements: 1.3, 5.4, 5.5, 6.4, 7.5, 7.6_

  - [ ]* 7.3 Add local Supabase RLS integration checks
    - Add a single-run integration test path using local Supabase fixtures when the local instance is available for profile creation, owner read/update, cross-user denial, unauthenticated denial, language constraint enforcement, and preservation of existing document/analysis/task/share/processing/storage policies.
    - Keep the non-database unit audit tests runnable when local Supabase is unavailable, and make the unavailable environment explicit rather than silently treating required checks as passed.
    - Acceptance criteria: local integration checks prove owner-only profile access and policy preservation without production accounts, real documents, Lumen, or external network calls.
    - Verification: `npm run db:reset` when local Supabase is available; `npm run test`.
    - _Requirements: 2.6, 2.7, 5.2, 5.3, 5.5, 5.6, 7.2, 7.3, 7.6_

- [x] 8. Complete validation wiring and regression preservation
  - [x] 8.1 Keep five repository validation commands single-run and non-interactive
    - Verify or minimally update `package.json`, Vitest configuration, ESLint configuration, Prettier configuration, TypeScript configuration, and build configuration so the repository exposes independent commands for strict type checking, linting, formatting verification, unit/contract tests, and production build.
    - Do not replace single-run commands with watch mode. If an aggregate validation command is added, run the five checks sequentially, preserve their output, and return nonzero when any check fails.
    - Acceptance criteria: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`, and `npm run build` each run without interactive prompts; failed checks return nonzero and identify the failed check; placeholder required environment values are sufficient for build/test validation.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm run test`; `npm run build`.
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ]* 8.2 Preserve and extend the repository contract regression suite
    - Keep `src/contracts/contracts.test.ts` unchanged unless a test-only compatibility adjustment is required by the existing harness. Add regression coverage around it only in separate test files for ownership, lifecycle, evidence, status, severity, certainty, and schema integrity.
    - Confirm Phase 1 presentation adapters consume, rather than redefine, any existing contract values.
    - Acceptance criteria: every pre-existing contract assertion continues to pass; no analysis contract field, meaning, or validation rule changes; Phase 1 test failures identify the affected check.
    - Verification: `npm run test`; `npm run typecheck`.
    - _Requirements: 3.5, 5.6, 6.5_

  - [ ]* 8.3 Run the final foundation validation matrix
    - Execute the complete single-run matrix after all implementation tasks and fix only failures caused by Phase 1 changes. Include the repository's supported Node.js version and placeholder environment variables.
    - Verify that tests make no Lumen request and require no real document, analysis payload, or production user account.
    - Acceptance criteria: all five commands exit zero; contract, auth, profile, UI, accessibility, mock-boundary, and security checks pass; no out-of-scope feature or analysis-contract change is introduced.
    - Verification: `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm run test`; `npm run build`.
    - _Requirements: 5.1–5.6, 6.1–6.5, 7.1–7.6_

- [x] 9. Checkpoint: ensure all required implementation and optional verification tasks pass
  - Ensure all tests pass, inspect the diff for scope violations, and ask the user if questions arise.

- [x] 10. Checkpoint: confirm Phase 1 remains independent of Person 2's analysis contract
  - Ensure no upload, vault, OCR, report, evidence, correction, chat, reminder, sharing, Lumen, production analysis, or analysis-contract redesign work was added.

## Notes

- Tasks marked with `*` are optional verification tasks and can be skipped only when the implementation owner accepts the reduced automated coverage.
- Testing tasks are example-based, static, route/service, and local integration tests. No property-based testing tasks are included because `design.md` explicitly omits a Correctness Properties section.
- Each task references the relevant requirements and names concrete repository files or directories so a spec-task-execution agent can work independently.
- The first implementation wave establishes serializable profile and presentation boundaries before feature wiring begins.
- `npm run db:reset` and local Supabase integration checks require the repository's local Docker/Supabase environment. They must not be replaced with production credentials or external Lumen calls.
- Checkpoints are planning gates and are not included in the dependency graph.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "8.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "5.2", "6.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "6.3", "7.1", "7.2"] },
    { "id": 4, "tasks": ["2.4", "3.5", "4.3", "5.3", "6.4", "7.3", "8.2"] },
    { "id": 5, "tasks": ["8.3"] }
  ]
}
```
