# todo-human

Things only a human can do or decide. Keep this list current. Tick items off as they are done.

## Needs Person 1 and Person 2 together

- [ ] Agree on the analysis contract. Draft is in `src/contracts/` (placeholder, `0.1.0-draft`).
  - Compare with the existing thin schema in `src/lib/ai/schemas/document-analysis.ts`. Pick one home (spec says `src/contracts/`) and retire the other.
  - Decide how `src/lib/ai/*` (Person 1 scaffold) maps to the planned `src/modules/*` and `src/lib/lumen`.
- [ ] Agree on the document lifecycle enum (`src/contracts/common.ts`) and check it matches `supabase/migrations/20261112000000_initial_schema.sql`.
- [ ] Compare the DB schema with product.md section 12 (findings, evidence_references, ocr_corrections, processing_jobs, etc.). Add missing tables via migration.
- [ ] Agree on endpoint request/response shapes (product.md section 14) and the shared error format.
- [ ] Confirm Person 1 builds the report UI against `mockUtilityBillAnalysis` and does not edit contract files directly.
- [ ] Settle the branch flow: `feature/platform` and `feature/document-intelligence`, merged by reviewed PR.

## Needs credentials or provider access

- [ ] Get Lumen API key and secret for OCR and AI Chat (headers `lumen-api-key`, `lumen-api-secret`). Put them in `.env.local`, never in git.
- [ ] Confirm the OCR and AI Chat grants are enabled for that key.
- [ ] Note: `.env.example` and `src/lib/env/server.ts` currently expect `LUMEN_API_KEY`, `LUMEN_API_BASE_URL`, `LUMEN_MODEL`. The spec needs a secret and two base paths (`/ocr`, `/ai_chat`). Decide the final variable names.

## Needs provider answers (product.md section 20)

- [ ] Can the AI Chat instance take a persistent persona or system instructions?
- [ ] Can it reliably return strict JSON? What is its effective context window?
- [ ] Exact OCR page and word response schemas, and the review/correction response schema.
- [ ] Rate limits, concurrency limits, and credit allocation.
- [ ] Production origins, availability, and OCR retention and deletion arrangements.

## Needs a human check before demo

- [ ] Review the mock fixture wording, including the Filipino text, with a native speaker.
- [ ] Review prompts and safety rules for legal, financial, and medical content.
