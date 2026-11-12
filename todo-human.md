# todo-human

Things only a human can do or decide. Keep this list current. Tick items off as they are done.

## Needs Person 1 and Person 2 together

- [x] Agree on the analysis contract. Finalized in `src/contracts/` at schema version `1.0.0`. The legacy thin schema under `src/lib/ai/` was removed in Part A.
- [x] Agree on the document lifecycle enum (`src/contracts/common.ts`). Finalized with `AWAITING_UPLOAD` first; the hosted DB `processing_status` check matches it (migration `20261113000000`).
- [x] Compare the DB schema with product.md section 12. Added findings, evidence_references, ocr_corrections, document_pages, document_chunks, analyses, relationships, reminders, conversations, messages, provider_calls, and job fields via migration `20261113000000` (RLS verified against the hosted DB).
- [x] Agree on endpoint request/response shapes (product.md section 14) and the shared error format. Defined in `src/contracts/api*.ts` with a single `apiErrorSchema` + `API_ERROR_HTTP_STATUS`.
- [x] Confirm Person 1 builds the report UI against the shared fixtures and does not edit contract files directly. Documented in `docs/contracts/README.md`.
- [ ] Settle the branch flow: Person 1 to rebase `feature/platform` onto the merged shared foundation and drop their competing contract/migration files (see `docs/contracts/README.md` section 9). Merge by reviewed PR.

## Needs credentials or provider access

- [ ] Get Lumen API key and secret for OCR and AI Chat (headers `lumen-api-key`, `lumen-api-secret`). Put them in `.env.local`, never in git. Blocks Part B Phase 3 (OCR) and the AI Chat parts of Phase 4.
- [ ] Confirm the OCR and AI Chat grants are enabled for that key.
- [x] Final env variable names decided: `PROVIDER_MODE`, `LUMEN_API_KEY`, `LUMEN_API_SECRET`, `LUMEN_OCR_BASE_URL`, `LUMEN_AI_CHAT_BASE_URL`, `LUMEN_AI_INSTANCE_ID`, `JOB_RUNNER_SECRET`. See `.env.example`.

## Needs provider answers (product.md section 20)

- [ ] Can the AI Chat instance take a persistent persona or system instructions?
- [ ] Can it reliably return strict JSON? What is its effective context window?
- [ ] Exact OCR page and word response schemas, and the review/correction response schema.
- [ ] Rate limits, concurrency limits, and credit allocation.
- [ ] Production origins, availability, and OCR retention and deletion arrangements.

## Needs a human check before demo

- [ ] Review the mock fixture wording, including the Filipino text, with a native speaker.
- [ ] Review prompts and safety rules for legal, financial, and medical content.
