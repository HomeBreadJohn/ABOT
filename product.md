# ABOT
## Product & Technical Specification
**Version:** 1.0  
**Status:** Architecture baseline for MVP development  
**Working name:** Kalinga AI (configurable; not hardcoded)

**Product tagline:** Understand before you act.

---

# 1. Product Overview

Kalinga AI is a document intelligence application designed to help Filipinos understand documents, identify important information, recognize obligations and potential risks, and determine appropriate next steps.

It transforms complicated documents into accessible, structured explanations.

Its primary purpose is to answer three questions:

1. What does this document mean?
2. What should I pay attention to?
3. What should I do next?

Kalinga AI is not primarily a chatbot. Its primary experience is structured document analysis, with conversational assistance available for follow-up questions.

## 1.1 Target Users

The product should accommodate a broad Filipino audience:

- Senior citizens and caregivers
- Employees and job applicants
- Students and first-time applicants
- Families managing household documents
- Overseas Filipino workers and their families
- Individuals dealing with government, financial, legal, medical, and personal paperwork

## 1.2 Core Product Principles

- Understandable: Explain complicated language in accessible terms.
- Evidence-based: Important findings must reference document evidence.
- Honest: Never invent missing information.
- Accessible: Support English, Filipino, and Taglish.
- Actionable: Help users understand possible next steps.
- Safe: Do not make unsupported legal, financial, or medical determinations.
- User-controlled: Users retain control over their documents and decisions.

---

# 2. Product Scope

## 2.1 Core MVP Capabilities

1. Document upload and scanning.
2. Automatic OCR extraction.
3. Document classification.
4. Structured document analysis.
5. Adaptive analysis reports.
6. Watch-out and obligation detection.
7. Plain-language explanations.
8. Consequence analysis.
9. Recommended next steps.
10. Evidence references.
11. Selective OCR correction.
12. Document vault.
13. Document-specific follow-up conversations.
14. Deadline and reminder management.
15. Independent document analysis.
16. User-controlled cross-document analysis.
17. English, Filipino, and Taglish explanations.

## 2.2 Future Capabilities

Designed for but not required in the initial MVP:

- Advanced document comparison
- Extensive cross-document intelligence
- Family sharing enhancements
- Advanced document history and version comparison
- Additional OCR and AI providers
- Automated external workflows

---

# 3. Document Intelligence

## 3.1 Core Analysis Capabilities

Every document should undergo applicable versions of these six analysis processes.

### A. Document Understanding
Identify:
- Document category and subtype
- Document purpose
- Issuing organization
- Parties involved
- Relevant dates
- Overall context

### B. Information Extraction
Extract relevant:
- Names
- Addresses
- Identification references
- Monetary values
- Dates
- Deadlines
- Requirements
- Terms and conditions
- Contact information

### C. Watch-out Detection
Identify:
- Unusual conditions
- Potential penalties
- Additional fees
- Restrictive clauses
- Important deadlines
- Missing information
- Contradictory statements

Unusual does not automatically mean fraudulent.

### D. Plain-language Explanation
Explain:
- Technical terminology
- Legal and financial language
- Government requirements
- Important conditions
- Document purpose

### E. Obligation and Consequence Analysis
Identify:
- What the user is expected to do
- Conditions they must satisfy
- Explicit consequences
- Potential inferred consequences

### F. Recommended Next Steps
Provide:
- Practical recommendations
- Verification suggestions
- Questions to ask organizations
- Requirement checklists
- Relevant reminders

## 3.2 Document Categories

Initial categories:

- Government
- Financial
- Employment
- Legal
- Medical
- Education
- Utilities
- Personal
- Other / Unclassified

Each category can have specialized analysis modules.

Examples:

| Category | Specialized analysis |
|---|---|
| Government | Eligibility, requirements, validity, application procedures |
| Financial | Amounts, interest, fees, payment obligations |
| Employment | Compensation, benefits, responsibilities, termination |
| Legal | Clauses, obligations, conditions, potential consequences |
| Medical | Terminology, instructions, appointments, precautions |
| Education | Enrollment, academic requirements, deadlines |
| Utilities | Billing breakdown, consumption, due dates, penalties |
| Personal | Important dates, relevant information, document purpose |

The frontend must render report sections dynamically rather than hardcoding category-specific interfaces.

## 3.3 Severity Classification

Every applicable watch-out receives one severity:

- Critical: Immediate attention or verification may be necessary.
- High: Significant obligations, conditions, or potential consequences.
- Medium: Important information worth reviewing.
- Low: Informational or minor conditions.

Severity must be justified by document evidence and context.

It must not be determined solely by alarming language.

## 3.4 Information Certainty Classification

Every individual finding must have an information status:

| Status | Definition |
|---|---|
| FOUND | Directly supported by the document |
| NOT_FOUND | Information is not present in the available document |
| UNCLEAR | Information exists but cannot be reliably interpreted |
| CONFLICTING | Multiple sources or statements disagree |
| INFERRED | Reasonable interpretation not explicitly stated |

Information status and confidence are separate fields.

A finding can be explicitly present but have low OCR confidence. An inference can have high reasoning confidence without becoming an established fact.

---

# 4. Adaptive Analysis Reports

## 4.1 Shared Report Sections

Every completed report should support:

1. Document overview
2. Plain-language explanation
3. Key information
4. Obligations
5. Watch-outs
6. Consequences
7. Recommended next steps
8. Important dates
9. Supporting evidence
10. Analysis limitations

Sections without applicable findings may be omitted or shown as not applicable.

## 4.2 Category-specific Sections

Additional sections are selected according to the document category.

Examples:

- Employment: compensation, benefits, working conditions, termination.
- Financial: billing breakdown, interest, fees, repayment.
- Government: eligibility, requirements, application instructions.
- Medical: instructions, medical terminology, follow-up questions.

## 4.3 Report Presentation

Three levels of detail:

**Overview**
- What the document is.
- What the user should understand.
- Most important watch-outs.
- Upcoming deadlines.
- Verification requirements.

**Detailed findings**
- Key information
- Obligations
- Watch-outs
- Consequences
- Recommendations
- Category-specific information

**Evidence**
- Original document page
- Supporting excerpt
- Extracted information
- Confidence and certainty status

Users must be able to navigate from an important finding to its source.

---

# 5. OCR and Document Processing

## 5.1 Supported Formats

Based on the supplied Lumen OCR documentation:

- PDF
- JPEG
- PNG
- TIFF
- WebP

Maximum file size: 10 MiB per document.

Lumen OCR currently supports these formats in its preview/test environment. Production availability must be confirmed before deployment.

## 5.2 Upload Methods

- Upload an existing file.
- Take a photograph.
- Select images from the device gallery.

Allow multiple documents to be uploaded, while preserving individual document identities.

## 5.3 Hybrid Long-document Processing

The processing strategy uses three analysis levels:

1. Document-wide analysis: Understand overall purpose and context.
2. Section-level analysis: Examine relevant sections in detail.
3. Consolidation: Combine findings across sections and restore document-wide context.

Each chunk must retain its source page references.

Avoid repeatedly sending entire documents to the AI.

## 5.4 Selective OCR Correction

Correction requirements depend on both OCR uncertainty and potential impact.

- Automatic: Low-impact, sufficiently reliable text.
- Optional review: Uncertain text that may affect interpretation.
- Required review: Critical information that cannot be reliably verified.

Critical examples:
- Payment amounts
- Deadlines
- Penalties
- Contractual conditions
- Identity details when relevant

Correction rules:

- Preserve original OCR output.
- Store corrected values separately.
- Display the original document region.
- Record correction history.
- Reanalyze affected findings.
- Do not force users to guess when information is unreadable.

---

# 6. Cross-document Intelligence

Two modes are supported.

## 6.1 Independent Analysis

Each document receives its own classification, OCR extraction, and analysis report.

This is the default behavior.

## 6.2 Cross-document Analysis

Users can explicitly select documents for combined analysis.

Kalinga may also suggest relationships based on matching information.

Relationship types:

- POSSIBLE_MATCH
- CONFIRMED_MATCH
- CONTRADICTS
- SUPPLEMENTS
- SUPERSEDES
- UNRELATED

Relationship confidence and supporting evidence must be retained.

Users can approve or reject suggested relationships.

Examples:

- Bill and payment receipt
- Original contract and amendment
- Government notice and application
- Invoice and purchase order

Never assume that matching amounts alone prove a payment has settled a bill.

Every cross-document finding must identify its source documents and page references.

Cross-user document analysis requires explicit sharing authorization.

---

# 7. Language and Communication

Supported languages:

- English
- Filipino
- Taglish

Default: Filipino-friendly English.

Communication requirements:

- Use clear, respectful language.
- Explain technical terminology.
- Preserve official names and terms when necessary.
- Preserve monetary values and dates accurately.
- Avoid overly technical explanations.
- Avoid condescending language.

Separate:

1. Original document content
2. Normalized structured analysis
3. User-facing explanation

Changing the user's preferred explanation language must not require another OCR extraction or complete document analysis.

---

# 8. AI Safety and Recommendation Boundaries

Kalinga may:
- Explain documents.
- Recommend next steps.
- Prepare checklists.
- Draft questions and inquiries.
- Suggest where to verify information.
- Explain possible consequences.

Kalinga must not independently:
- Submit applications.
- Sign documents.
- Accept agreements.
- Make payments.
- Contact organizations.
- Make authoritative legal, financial, or medical determinations.

Additional rules:

- Never invent missing information.
- Never silently resolve contradictions.
- Distinguish facts from interpretations.
- Cite evidence for important findings.
- Clearly communicate uncertainty.
- Do not label documents fraudulent without adequate evidence.
- Never present inferred consequences as explicitly stated consequences.

---

# 9. User Experience

## 9.1 Upload Journey

1. User selects or photographs a document.
2. Application validates the file.
3. Original file is stored.
4. Document is registered in the vault.
5. OCR processing begins.
6. Document type is automatically classified.
7. AI analysis begins.
8. Critical uncertainty is flagged.
9. User reviews required corrections.
10. Validated report is generated.

Classification should proceed automatically when sufficiently reliable.

If classification is ambiguous, ask the user to clarify.

Changing the category later should trigger reanalysis only when it materially changes applicable analysis modules.

## 9.2 Processing Interface

Display understandable stages:

- Document received
- Reading document
- Understanding contents
- Checking important details
- Preparing report

Users can leave the processing screen and return later.

Do not fabricate processing percentages.

## 9.3 Dashboard

Prioritize:

1. Documents requiring attention
2. Upcoming deadlines and reminders
3. Recently analyzed documents
4. All documents

## 9.4 Document Vault

Each document should show:

- Title
- Category
- Upload date
- Processing status
- Analysis status
- Important deadlines, if applicable

## 9.5 Follow-up Chat

Chat is embedded in the report.

Example questions:

- Explain this in simpler terms.
- What happens if I miss the deadline?
- Which part of the document says that?
- What should I ask the issuing office?
- Explain this in Filipino.

Answers must be grounded in the document and its evidence.

---

# 10. Technical Architecture

## 10.1 Recommended Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript, strict mode |
| Styling | Tailwind CSS |
| UI | shadcn/ui and Lucide |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File storage | Supabase Storage |
| Validation | Zod |
| OCR | Lumen OCR API |
| AI | Lumen AI Chat API |
| Hosting | Vercel |
| Background processing | Durable asynchronous job processing |

Recommended architecture: modular monolith.

Do not introduce microservices for the initial MVP.

## 10.2 Application Modules

- Authentication
- Documents
- OCR
- Document intelligence
- Analysis
- Evidence
- Corrections
- Cross-document relationships
- Reminders
- Sharing
- User preferences

Suggested project structure:

src/
- app/
  - dashboard/
  - documents/
  - analysis/
  - settings/
- modules/
  - auth/
  - documents/
  - ocr/
  - intelligence/
  - analysis/
  - corrections/
  - relationships/
  - reminders/
  - sharing/
- lib/
  - lumen/
  - supabase/
  - validation/
- contracts/

All Lumen credentials remain server-side.

---

# 11. Lumen API Integration

## 11.1 OCR

Base path: `/ocr`

The supplied staging origin is:

`https://api.staging.nonlive.lumen.bayanichain.tech/ocr`

Authentication:
- `lumen-api-key`
- `lumen-api-secret`

Required OCR grant.

Processing:
1. Upload raw file bytes.
2. Receive DocumentID.
3. Poll document status.
4. Retrieve pages with word information.
5. Normalize and persist OCR results.

Document statuses include:
- PENDING
- PROCESSING
- READY
- PARTIAL
- FAILED

READY and PARTIAL both need to be handled.

Retry is available for FAILED and PARTIAL documents.

## 11.2 AI Chat

Base path: `/ai_chat`

The supplied staging origin is:

`https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat`

Authentication:
- `lumen-api-key`
- `lumen-api-secret`

Required AI Chat grant.

Processing:
1. Retrieve available instances.
2. Open an instance session.
3. Send analysis messages.
4. Retrieve transcript when needed.

Message limit: 4,000 characters.

The API does not document guaranteed JSON mode, schema-constrained output, file attachments, or streaming.

Therefore:

- JSON is the application's required output contract.
- AI instructions should request strict JSON.
- Responses must be parsed and validated with Zod.
- Invalid responses must enter controlled recovery.
- Never assume the AI API guarantees schema compliance.
- Test instance persona and configuration before relying on it.

AI Chat session persistence must be tested for long-document workflows. The application's database remains the source of truth for analysis history and conversations.

## 11.3 API Cost Awareness

Documented API credit costs:

| Operation | API credits |
|---|---:|
| OCR upload | 6 |
| OCR retry | 3 |
| OCR GET | 1 |
| OCR review/correction | 2 |
| AI session creation | 2 |
| AI message | 5 |
| AI transcript GET | 1 |

Cache OCR results and validated reports.

Avoid unnecessary status polling, repeated page retrieval, and duplicate AI messages.

Use durable job records and idempotency controls where possible.

## 11.4 Important Lumen Limitations

- OCR and AI Chat are currently preview/test services.
- No live OCR availability is documented.
- OCR deletion is not exposed in the supplied API.
- AI Chat sessions are tied to their creating API key.
- AI transcript retrieval has a maximum of 200 messages and no cursor.
- AI responses have a documented timeout.
- AI instance persona/configuration cannot be managed through the supplied API.

Application-level ownership, retention, and access controls must be implemented independently.

---

# 12. Database Design

The following is the recommended initial entity model.

## 12.1 profiles

- id
- display_name
- preferred_language
- created_at
- updated_at

## 12.2 documents

- id
- owner_id
- title
- original_filename
- mime_type
- file_size
- storage_path
- category
- subtype
- classification_confidence
- ocr_document_id
- processing_status
- created_at
- updated_at

## 12.3 document_pages

- id
- document_id
- page_number
- extracted_text
- ocr_status
- average_confidence
- page_metadata

## 12.4 document_chunks

- id
- document_id
- chunk_index
- page_start
- page_end
- content
- processing_status

## 12.5 analyses

- id
- document_id
- version
- status
- report_json
- schema_version
- model_instance_id
- created_at
- completed_at

## 12.6 findings

- id
- analysis_id
- finding_type
- title
- explanation
- severity
- information_status
- confidence
- basis
- created_at

## 12.7 evidence_references

- id
- finding_id
- document_id
- page_number
- excerpt
- source_type
- word_start
- word_end

## 12.8 ocr_corrections

- id
- document_id
- page_number
- original_value
- corrected_value
- correction_status
- user_id
- created_at

## 12.9 document_relationships

- id
- source_document_id
- target_document_id
- relationship_type
- confidence
- approval_status
- created_at

## 12.10 cross_document_analyses

- id
- owner_id
- status
- report_json
- created_at

## 12.11 reminders

- id
- user_id
- document_id
- title
- description
- due_at
- reminder_at
- status
- created_at

## 12.12 conversations and messages

- id
- user_id
- document_id
- lumen_session_id
- created_at

Messages:
- id
- conversation_id
- role
- content
- created_at

## 12.13 processing_jobs

- id
- document_id
- job_type
- status
- attempt_count
- error_code
- error_message
- started_at
- completed_at

All user-owned data must have appropriate ownership constraints and Supabase Row Level Security policies.

For cross-document analysis, verify ownership or explicit sharing authorization for every referenced document.

---

# 13. Processing State Machine

Document lifecycle:

UPLOADED
→ OCR_PROCESSING
→ OCR_READY
→ ANALYZING
→ REVIEW_REQUIRED
→ COMPLETED

Additional states:

- OCR_PARTIAL
- OCR_FAILED
- ANALYSIS_FAILED
- NEEDS_CORRECTION

These must be modeled explicitly.

A partially processed document may still produce a useful report, but all unavailable pages and limitations must be disclosed.

A failed analysis must never be represented as a completed report.

Retries must not duplicate stored findings or create uncontrolled duplicate AI requests.

---

# 14. Application API Contracts

These are proposed application endpoints, not Lumen API endpoints.

## Documents

- POST `/api/documents`
- GET `/api/documents`
- GET `/api/documents/:id`
- DELETE `/api/documents/:id`

## Analysis

- POST `/api/documents/:id/analyze`
- GET `/api/documents/:id/analysis`
- GET `/api/analyses/:id`

## Corrections

- POST `/api/documents/:id/corrections`
- GET `/api/documents/:id/corrections`

## Conversations

- POST `/api/documents/:id/conversations`
- POST `/api/conversations/:id/messages`
- GET `/api/conversations/:id/messages`

## Cross-document analysis

- POST `/api/cross-document/relationships/suggest`
- POST `/api/cross-document/relationships`
- POST `/api/cross-document/analyze`

## Reminders

- POST `/api/reminders`
- GET `/api/reminders`
- PATCH `/api/reminders/:id`
- DELETE `/api/reminders/:id`

All endpoints require authentication and ownership checks.

---

# 15. Initial Analysis JSON Contract

The following is the conceptual application contract. It must be converted into concrete TypeScript interfaces and Zod schemas before integration.

AnalysisResult:

- schemaVersion
- document
  - documentType
  - documentSubtype
  - issuer
  - classificationConfidence
- overview
- explanation
- keyInformation[]
- obligations[]
- watchouts[]
- consequences[]
- nextSteps[]
- importantDates[]
- specializedSections[]
- evidence[]
- limitations[]
- reviewRequirements[]
- analysisMetadata

Each finding should support:

- id
- title
- explanation
- severity, when applicable
- informationStatus
- confidence
- basis
- evidenceIds

Each evidence reference should support:

- id
- documentId
- pageNumber
- excerpt
- sourceType

Each consequence must distinguish:

- EXPLICIT
- INFERRED

Each review requirement should support:

- field
- reason
- impact
- pageNumber
- reviewStatus

The frontend must never treat a finding as verified merely because it exists in valid JSON.

---

# 16. Security and Data Governance

- Keep all Lumen credentials server-side.
- Enable Supabase RLS for user-owned data.
- Validate every uploaded file.
- Enforce ownership on every document operation.
- Protect document downloads with authorized access.
- Never trust client-provided owner IDs.
- Keep original OCR output and corrections separate.
- Record analysis versions.
- Avoid exposing private document contents in application logs.
- Ensure family sharing requires explicit authorization.
- Document the limitations of Lumen's OCR retention and deletion API.

The application must define its own retention and deletion behavior. Because the supplied Lumen API does not expose document deletion, this must be clarified with the provider before production deployment.

---

# 17. Parallel Development Plan

The project is intended for two developers.

## Person 1 — Platform and UI

Primary responsibility: Build the application experience.

Tasks:

1. Next.js application setup.
2. Supabase authentication.
3. Dashboard.
4. Document upload interface.
5. Document vault.
6. Processing status interface.
7. Adaptive analysis report.
8. Evidence navigation.
9. OCR correction interface.
10. Follow-up conversation interface.
11. Reminders.
12. Language settings.
13. Family sharing foundation.
14. Accessibility and responsive layouts.

Person 1 must use mock analysis responses initially.

Person 1 must not independently redefine the analysis JSON schema.

## Person 2 — AI and Document Intelligence

Primary responsibility: Build the document processing and analysis engine.

Tasks:

1. Lumen OCR client.
2. OCR upload and polling.
3. Page extraction and normalization.
4. Document classification.
5. Document chunking.
6. Hybrid analysis orchestration.
7. Lumen AI Chat client.
8. AI prompt and instruction design.
9. JSON parsing and validation.
10. Evidence mapping.
11. Severity classification.
12. Consequence and obligation analysis.
13. Selective OCR correction.
14. Cross-document intelligence foundation.
15. AI failure recovery and testing.

Person 2 must not build the dashboard or report UI.

## Shared Responsibilities

Before parallel development begins:

- Agree on TypeScript contracts.
- Agree on database schema.
- Agree on document lifecycle.
- Agree on endpoint request/response formats.
- Agree on error handling.
- Agree on mock data.

Suggested branches:

- `feature/platform`
- `feature/document-intelligence`

Merge through reviewed pull requests.

Avoid simultaneous edits to shared contract files.

---

# 18. Implementation Milestones

## Milestone 1 — Foundation

- Repository and application setup.
- Supabase configuration.
- Authentication.
- Database migrations.
- Shared TypeScript contracts.
- Mock analysis response.

## Milestone 2 — Upload and OCR

- File upload.
- Storage.
- Lumen OCR integration.
- Processing jobs.
- OCR result persistence.
- Processing status UI.

## Milestone 3 — Intelligence

- Classification.
- Chunking.
- Hybrid analysis.
- JSON validation.
- Evidence references.
- Adaptive report generation.

## Milestone 4 — Review and Interaction

- Selective correction.
- Reanalysis.
- Follow-up chat.
- Language switching.
- Failure recovery.

## Milestone 5 — Extended Intelligence

- Cross-document relationships.
- Combined analysis.
- Reminders.
- Sharing foundation.

## Milestone 6 — Testing and Deployment

- Security testing.
- RLS testing.
- OCR quality testing.
- AI hallucination testing.
- Long-document testing.
- Cost testing.
- Responsive UI testing.
- Production provider readiness.

---

# 19. Acceptance Criteria

The MVP is ready for demonstration when:

1. A user can register and authenticate.
2. A user can upload a supported document.
3. The backend can securely submit it to Lumen OCR.
4. OCR results are stored and mapped to their pages.
5. The application can classify a document.
6. The AI can produce a validated structured analysis.
7. The report adapts to the document category.
8. Important findings contain evidence references.
9. Facts and inferences are distinguished.
10. Critical uncertain OCR information triggers review.
11. Corrections preserve original extraction history.
12. The user can ask grounded follow-up questions.
13. The user can change explanation language.
14. The user can see processing failures and retry where supported.
15. Documents are isolated by user ownership.
16. Users can explicitly select documents for combined analysis.
17. The application does not claim to have completed actions it cannot perform.

---

# 20. Open Technical Questions Before Production

These are provider or implementation uncertainties, not settled product decisions:

1. Can the Lumen AI Chat instance be configured with a persistent persona or system instructions?
2. Can the instance reliably produce strict JSON?
3. What is its effective context window?
4. How well does it retain context across multiple messages?
5. What are the exact OCR page and word response schemas?
6. What is the complete review and correction response schema?
7. What are the production API origins and availability requirements?
8. What retention and deletion arrangements exist for Lumen OCR documents?
9. How many API credits and Lumen Credits will be allocated?
10. What are the rate limits and concurrency restrictions?

These must be tested or confirmed before production claims are made.

---

# Final Product Direction

Kalinga AI is a structured document intelligence platform, not simply an OCR tool or AI chatbot.

Its job is to help people understand documents, recognize important conditions, identify uncertainty, and make better-informed decisions.

**Understand before you act.**