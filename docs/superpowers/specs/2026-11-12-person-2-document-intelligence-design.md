# Person 2 Document Intelligence Phase Design

**Date:** 2026-11-12  
**Status:** Draft for approval  
**Owner:** Person 2  
**Reference:** `product.md`, especially sections 3, 5, 8, 10–18

## Intent

Build the shared contract and document-intelligence backend that turns an uploaded document into a validated, evidence-linked analysis result. Person 1 will build the dashboard and report experience against the shared contract and mock fixture. Person 2 will not build the dashboard or report UI.

The work follows a contract-first vertical slice. The contract becomes stable before provider integration, the database stores the contract's lifecycle and evidence, and each later phase extends a working path rather than introducing disconnected infrastructure.

## Goals

- Own and finalize the shared TypeScript and Zod contracts.
- Define one consistent document lifecycle and error format.
- Align Supabase tables, generated database types, and RLS policies with the product model.
- Provide a validated mock analysis result for Person 1.
- Implement document processing boundaries for upload registration, OCR, classification, chunking, analysis, evidence, and corrections.
- Keep original OCR output separate from user corrections.
- Persist versioned analyses and prevent failed work from appearing complete.
- Validate all provider output before it enters application state.
- Keep provider credentials and document contents server-side.
- Provide authenticated application endpoints with explicit ownership checks.

## Non-goals for Person 2

- Dashboard, vault, upload, processing, report, correction, reminder, or conversation UI.
- Redefining the analysis contract to match a provider response.
- Inferring undocumented Lumen endpoints, request shapes, response shapes, or capabilities.
- Introducing microservices or a new queue platform for the initial MVP.
- Building every future cross-document, sharing, reminder, and chat feature before the independent analysis path works.
- Treating valid JSON as proof that a finding is true. Evidence, certainty, confidence, and limitations remain separate.

## Constraints and current state

- The project uses Next.js 16, TypeScript strict mode, Supabase, PostgreSQL, Storage, and Zod.
- `src/contracts/` already contains a draft `AnalysisResult`, shared enums, and a mock utility-bill analysis.
- `src/lib/ai/schemas/document-analysis.ts` and `src/lib/ai/providers/ai-provider.ts` contain an older, thinner AI result shape. The finalized shared contract must become the application-facing source of truth; the older shape must be retired or explicitly isolated as a provider adapter shape.
- The current migration has documents, analyses, tasks, shares, and processing jobs, but does not yet model pages, chunks, findings, evidence references, OCR corrections, relationships, reminders, conversations, or messages from the product specification.
- The current Lumen provider is intentionally non-functional. Provider work is blocked until credentials and official API behavior are available.
- Product requirements allow partial OCR and partial analysis, but every unavailable page and limitation must be exposed in the result metadata.

## Approaches considered

### Contract-first vertical slice — selected

Finalize contracts, align persistence, publish mock data, then implement the independent document path from OCR through analysis and evidence. Extend to corrections and other intelligence only after the path has stable boundaries.

**Why selected:** Person 1 receives a stable target early, provider uncertainty is isolated, and each phase can be verified without waiting for the entire product to exist.

### Contract plus full schema first

Finalize every contract and all product tables before implementing processing.

**Trade-off:** It may reduce later migrations, but it delays a usable vertical slice and risks designing tables for features whose runtime behavior has not been tested.

### Provider-first

Integrate Lumen first and shape the application around observed provider responses.

**Trade-off:** It is currently blocked by missing credentials and undocumented behavior. It would also make an external service, rather than the product contract, the source of truth.

## Ownership boundary

### Person 2 owns

- `src/contracts/` and the analysis contract version.
- Document lifecycle, processing-job semantics, and shared error format.
- Database migrations and generated database types for document intelligence data.
- Server-side document processing services and provider adapters.
- OCR normalization, page/chunk representation, evidence mapping, and validation.
- Analysis orchestration, persistence, versioning, retry and failure behavior.
- Correction persistence and reanalysis rules.
- Backend endpoint request and response schemas.
- Backend tests, provider fixtures, contract fixtures, and security checks for these flows.

### Person 1 consumes

- `AnalysisResult` and its Zod parser.
- Common enums and lifecycle values.
- `mockUtilityBillAnalysis` or a replacement fixture approved by Person 2.
- API response contracts and processing states.

Person 1 must not independently redefine the analysis JSON schema or edit shared contract files while this work is in progress. Contract changes go through Person 2 and require a version decision.

## Phases

### Phase 0 — Contract and boundary agreement

**Purpose:** Make the shared contract usable by both developers before feature work diverges.

**Person 2 deliverables:**

- Final `AnalysisResult`, finding, consequence, date, evidence, review, limitation, and metadata schemas.
- Shared enums for severity, information status, document category, lifecycle, language, relationship, and processing states.
- Request, response, and error schemas for the first document and analysis endpoints.
- A documented schema-version policy.
- A stable mock analysis fixture that exercises found, inferred, conflicting or unclear information, evidence links, limitations, and required review.
- Decision on whether the legacy thin AI schema is removed or retained only inside an adapter.

**Exit gate:** Person 1 can build the report UI using only the shared exports and mock fixture. No UI-specific fields are added outside the contract.

**Blocked by:** Human agreement on the contract, lifecycle values, endpoint shapes, and error format listed in `todo-human.md`.

### Phase 1 — Data model and lifecycle foundation

**Purpose:** Make the database represent the contract and state machine without ambiguous status values.

**Person 2 deliverables:**

- Migration changes for document metadata, OCR document identity, pages, chunks, analyses, findings, evidence references, corrections, and processing jobs.
- Explicit lifecycle transitions for uploaded, OCR processing, OCR ready, OCR partial, OCR failed, analyzing, needs correction, review required, analysis failed, and completed.
- Analysis version and schema-version persistence.
- Ownership constraints and RLS policies for every new user-owned table.
- Regenerated `src/types/database.ts`.
- Idempotency and retry rules that avoid duplicate findings and uncontrolled provider requests.

**Exit gate:** A document can be registered, moved through valid lifecycle states, and queried only by its owner or explicitly authorized recipient. A failed analysis cannot be read as a completed report.

**Blocked by:** Agreement between `product.md` section 12 and the existing migration. The existing `documents.processing_status` values do not currently match the product lifecycle and must not be silently mixed.

### Phase 2 — Mock processing vertical slice

**Purpose:** Prove the orchestration and persistence flow without depending on Lumen.

**Person 2 deliverables:**

- A provider-independent processing service interface.
- Mock OCR pages and normalized word/page data.
- Mock classification and analysis adapters that emit the shared contract.
- Document registration, processing-job creation, status updates, result validation, and persistence.
- Evidence references mapped to page numbers and excerpts.
- Authenticated backend endpoints for creating a document, starting analysis, reading document status, and reading its latest analysis.
- Tests for happy path, partial OCR, invalid AI output, retry, ownership failure, and idempotent reprocessing.

**Exit gate:** An authorized test flow can produce a persisted, validated `AnalysisResult` from fixture input without any external provider call. Person 1 can integrate against the endpoint shape while the real provider remains unavailable.

### Phase 3 — OCR integration and normalization

**Purpose:** Replace mock OCR with a server-side Lumen adapter once provider access is available.

**Person 2 deliverables:**

- Server-only Lumen OCR client using the documented key and secret headers.
- Raw upload, status polling, page retrieval, and handling for ready, partial, and failed responses.
- Normalization into the internal page, word, confidence, and metadata representation.
- Polling limits, retry policy, timeout handling, and credit-aware caching.
- Preservation of original OCR output without exposing private content in logs.
- Provider fixtures and tests for each documented response status.

**Exit gate:** Real OCR output passes internal validation and is persisted with page-level status and confidence. The mock adapter remains available for deterministic tests.

**Blocked by:** Lumen credentials, enabled OCR grant, exact page and word response schemas, rate limits, and retention/deletion answers.

### Phase 4 — Independent analysis intelligence

**Purpose:** Generate the first real report from normalized OCR while keeping the product contract authoritative.

**Person 2 deliverables:**

- Document classification with ambiguity handling.
- Page-aware chunking that avoids repeatedly sending entire documents.
- Document-wide, section-level, and consolidation analysis orchestration.
- Server-side Lumen AI Chat client and prompt/instruction templates.
- Strict JSON request guidance, defensive parsing, Zod validation, and controlled invalid-output recovery.
- Evidence mapping for important findings.
- Explicit separation of facts, inferences, uncertainty, limitations, and safety boundaries.
- Analysis version persistence and report caching.

**Exit gate:** A real or provider-fixture input produces a validated, versioned report with evidence IDs, confidence, information status, limitations, and partial-result metadata. Invalid provider output is never stored as a completed analysis.

**Blocked by:** AI Chat credentials, instance/session behavior, context limits, message limits, persona behavior, and confirmation of strict JSON reliability.

### Phase 5 — Selective OCR correction and reanalysis

**Purpose:** Handle uncertain high-impact values without overwriting original OCR.

**Person 2 deliverables:**

- Correction request and response contracts.
- Separate correction records with original value, corrected value, status, user, page, and history.
- Rules for automatic, optional, and required review based on uncertainty and impact.
- Affected-page or affected-chunk reanalysis path.
- Analysis versioning and evidence updates after correction.
- Tests proving original OCR remains available and correction retries are idempotent.

**Exit gate:** A required correction can move a document into review, preserve the original text, reanalyze affected findings, and produce a new validated analysis version.

### Phase 6 — Extended intelligence foundations

**Purpose:** Add the backend foundations that depend on a stable independent-analysis path.

**Person 2 deliverables:**

- Document relationship contracts and persistence.
- Ownership checks for cross-document analysis and explicit sharing authorization.
- Relationship suggestion and approval states.
- Cross-document evidence references that retain source document and page identity.
- Conversation backend contracts grounded in stored report evidence, if provider behavior supports it.
- Reminder/task extraction contracts where analysis findings produce user actions.

**Exit gate:** Extended operations cannot access unrelated users' documents, cannot treat matching values as proof, and retain the source of every cross-document finding.

**Deprioritized until:** The core independent analysis path, correction handling, and provider failure recovery are stable.

## Handoffs to Person 1

After Phase 0:

- Contract exports and schema version.
- Mock analysis fixture.
- Lifecycle and error enums.
- Endpoint request/response definitions.

After Phase 2:

- Working mock-backed endpoint behavior.
- Processing states and failure response shapes.
- Stable document and analysis identifiers.

After Phases 3–5:

- Real OCR-backed status and report data.
- Evidence and correction records for UI navigation.
- Analysis version and limitation metadata.

Person 2 should notify Person 1 before changing any shared schema. Breaking changes require a new schema version and a migration note.

## Verification strategy

- Run TypeScript, lint, formatting, and build checks for every phase.
- Validate all external and AI-shaped data with Zod at the boundary.
- Test lifecycle transitions as a state machine, including invalid transitions.
- Test every new RLS policy with owner, recipient, and unrelated-user cases.
- Use deterministic mock providers for unit and integration tests.
- Keep provider contract tests separate from application contract tests.
- Never claim real Lumen integration is complete without credentials and documented responses.

## Decisions still required before implementation

1. Confirm the final `AnalysisResult` contract and its schema version.
2. Confirm the canonical document lifecycle and how it maps to database status columns.
3. Confirm whether the product will support TIFF and WebP in the MVP. The product text lists them, while the current upload schema and Storage bucket do not.
4. Confirm the first supported real document category for the vertical slice. The existing fixture uses utilities.
5. Confirm the application error format.
6. Obtain Lumen credentials and provider response documentation before Phases 3 and 4.

## Approval boundary

Approval of this document authorizes only the phase structure and ownership boundary. The implementation plan is `docs/superpowers/plans/2026-11-12-person-2-end-to-end.md`. It puts the shared foundation (Phase 0 plus the shared database schema) first as Part A, which merges before any Person 2 pipeline work starts, and adds a Phase 7 for testing and production readiness.
