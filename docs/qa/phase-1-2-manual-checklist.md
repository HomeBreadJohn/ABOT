# Phase 1-2 Manual QA Checklist (Person 2 pipeline)

Run this against a local dev server and the hosted Supabase project "ABOT".
It proves the upload to OCR to analysis to report path end to end in **mock
provider mode**, plus the failure, retry, and ownership paths.

The Documents UI is intentionally a placeholder in this phase (the upload
button is disabled). So this checklist drives the pipeline through the **REST
API** with an authenticated session, not through UI buttons. Person 1 builds
the vault/report UI separately.

---

## 0. Prerequisites (do this first)

- [ ] Node 20.9+ and the repo installed (npm install).
- [ ] .env.local has NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY. (These are already present.)
- [ ] **Set JOB_RUNNER_SECRET in .env.local.** Pick any non-empty string,
      e.g. JOB_RUNNER_SECRET=dev-tick-secret.
      **Why it matters:** without it, the background job runner never runs. The
      app auto-kicks the runner after upload/analyze, but that kick reads
      JOB_RUNNER_SECRET; when it is missing the kick fails silently and the
      document stays stuck in UPLOADED/OCR_PROCESSING forever. See the QA
      defect report (risk: pipeline stalls when the secret is unset).
- [ ] Leave PROVIDER_MODE unset (mock mode). No Lumen credentials are needed.
- [ ] Start the server: npm run dev. Confirm it serves on http://localhost:3000.

### Getting an auth session token for API calls

The API routes require a Supabase session. The simplest way to get a bearer
token for curl:

1. [ ] Open http://localhost:3000/register, create a test account
       (e.g. qa-tester@example.com), and sign in. Confirm you land on the
       dashboard.
2. [ ] In the browser devtools console on the signed-in app, read the Supabase
       auth-token entry from localStorage and copy its access_token (a JWT).
       This is your ACCESS_TOKEN. Any valid user access token works; the
       Supabase JS client or dashboard API can also mint one.

In the commands below, replace ACCESS_TOKEN with that JWT and SECRET with
your JOB_RUNNER_SECRET. Commands are shown for PowerShell on Windows.

A small sample file is needed. Any real PDF/JPEG/PNG works; note its exact byte
size for the fileSize field. Example assumes a 2048-byte PDF at .\sample.pdf.

---

## 1. Happy path: register to upload to pipeline to report

### 1a. Register the document (get a signed upload URL)

- [ ] POST /api/documents with JSON body
      {"originalFilename":"sample.pdf","mimeType":"application/pdf","fileSize":2048}
      and header Authorization: Bearer ACCESS_TOKEN.
- [ ] **Expected:** HTTP 200 and a JSON body with documentId, storagePath,
      uploadToken, and uploadUrl. Save documentId as DOC_ID.
- [ ] **Expected:** the API never received file bytes (you sent metadata only).

### 1b. Upload the bytes straight to Storage

- [ ] Upload the file to the signed URL returned above. Using the Supabase JS
      client uploadToSignedUrl(storagePath, uploadToken, file) is the intended
      path. (A raw PUT to uploadUrl with the file body also works.)
- [ ] **Expected:** the upload succeeds (200/201). The file now exists in the
      documents bucket at <userId>/<DOC_ID>/sample.pdf.

### 1c. Complete the upload (verify magic bytes, start OCR)

- [ ] POST /api/documents/DOC_ID/upload-complete with the Authorization header.
- [ ] **Expected:** HTTP 200 and a document summary. Lifecycle is now UPLOADED
      (an OCR_SUBMIT job was enqueued). The server also tries to auto-kick the
      job runner.

### 1d. Run the pipeline to completion

The mock pipeline is OCR_SUBMIT -> OCR_POLL (PROCESSING then READY) ->
OCR_FETCH -> ANALYZE. OCR_POLL schedules itself with a backoff, so you must
tick the runner several times, waiting for the scheduled run_after between ticks.

- [ ] Tick the runner: POST http://localhost:3000/api/internal/jobs/tick with
      header x-job-runner-secret: SECRET.
- [ ] **Expected:** HTTP 200 with {"ran":N} where N >= 1. A wrong/empty secret
      returns **401**.
- [ ] Repeat the tick every few seconds (the poll backoff is 3s, 6s, 12s...),
      checking status between ticks (step 1e), until the document reaches a
      terminal state.

### 1e. Read the processing status and the report

- [ ] GET /api/documents/DOC_ID/analysis with the Authorization header.
- [ ] **Expected while processing:** {"state":"PROCESSING","stage":...} with a
      stage label (RECEIVED/READING/UNDERSTANDING/...). **No analysis field is
      present while PROCESSING.**
- [ ] **Expected when done:** {"state":"READY","analysisId":...,"version":1,
      "analysis":{...}}. The analysis has document.documentId === DOC_ID, an
      overview, findings, and evidence.
- [ ] GET /api/documents/DOC_ID and confirm lifecycle is COMPLETED,
      REVIEW_REQUIRED, or NEEDS_CORRECTION.
- [ ] GET /api/analyses/ANALYSIS_ID. **Expected:** 200 with the same report. A
      non-SUCCEEDED id returns **404**.
- [ ] GET /api/documents/DOC_ID/pages/1. **Expected:** 200 with text, words,
      and averageConfidence.

> **KNOWN RISK (verify current state):** the mock analysis fixture contains
> findings with no severity, but the findings table requires severity NOT NULL.
> If this bug is unfixed, the ANALYZE job fails with a not-null violation,
> retries 5 times, then the document ends in **ANALYSIS_FAILED** and the
> analysis never reaches READY. If you see ANALYSIS_FAILED here instead of a
> report, that is the known defect. Record it, do not mark the happy path pass.

### 1f. Vault list ordering

- [ ] Register and complete a second and third document so you have a mix of
      states (e.g. one COMPLETED, one still processing, and if you can force it,
      one failed).
- [ ] GET /api/documents with the Authorization header.
- [ ] **Expected ordering:** documents that need attention first
      (NEEDS_CORRECTION, REVIEW_REQUIRED, OCR_FAILED, ANALYSIS_FAILED, or a
      deadline within 7 days), then nearest deadline, then newest first.
- [ ] **Expected analysisStatus:** SUCCEEDED for a completed doc, RUNNING while
      analyzing, FAILED after a failure, NONE before any analysis.
- [ ] **Expected needsAttention:** true for the attention states above.

---

## 2. Failure and retry paths

### 2a. Wrong file type (magic-byte check)

- [ ] Register a document claiming mimeType application/pdf but upload a PNG (or
      an MZ executable) renamed so only the metadata says PDF.
- [ ] Call upload-complete.
- [ ] **Expected:** HTTP 415 UNSUPPORTED_FILE. The stored object and the document
      row are **deleted** (a later GET /api/documents/DOC_ID returns 404).

### 2b. Size mismatch

- [ ] Register with a fileSize that does not match the uploaded object, then call
      upload-complete.
- [ ] **Expected:** HTTP 400 INVALID_REQUEST.

### 2c. Retry a failed analysis

- [ ] For a document in ANALYSIS_FAILED, POST /api/documents/DOC_ID/analyze with
      body {"mode":"RETRY","idempotencyKey":"retry-1"}.
- [ ] **Expected:** 200 with a jobId; an ANALYZE job is enqueued. Calling it
      again with the **same** idempotencyKey returns without creating a second job.
- [ ] For a document in OCR_FAILED, mode RETRY enqueues OCR_SUBMIT instead.
- [ ] For a COMPLETED document, mode RETRY or START returns **409 CONFLICT**
      (you must use REANALYZE).

### 2d. Retry does not duplicate the analysis version (idempotency)

- [ ] Let a document complete so it has analysis version 1.
- [ ] Trigger a REANALYZE and let it run. Then read the analyses. **Expected:**
      each completed run is its own version (v2, v3...), and re-running the **same**
      analyze job (same analyze:<doc>:<version> key) never creates a duplicate row
      for that version.
- [ ] This is the guarantee the automated test
      src/test/pipeline-db.integration.test.ts proves against the real DB; this
      step is the human confirmation.

### 2e. Rate limiting

- [ ] Call POST /api/documents/DOC_ID/analyze more than 10 times within an hour
      for the same user (distinct idempotency keys).
- [ ] **Expected:** the 11th+ call returns **429 RATE_LIMITED**.

### 2f. Resume after the tab closes / worker crash

- [ ] Start a document processing, then stop ticking (simulate the tab closing).
      Leave jobs queued/scheduled.
- [ ] Wait past the lease (90s) and tick again. **Expected:** a job whose lease
      expired while processing is reclaimed and its attempt count goes up; the
      pipeline resumes and finishes. A completed job is never re-run.

---

## 3. Ownership and access control

Create a **second** user (qa-stranger@example.com) and get its ACCESS_TOKEN2.

- [ ] As the stranger, GET /api/documents/DOC_ID (owned by user 1).
      **Expected:** **404 NOT_FOUND** (not 403; existence is not revealed).
- [ ] As the stranger, GET /api/documents/DOC_ID/analysis,
      /analyses/ANALYSIS_ID, and /pages/1. **Expected:** **404** for each.
- [ ] As the stranger, POST /api/documents/DOC_ID/analyze.
      **Expected:** **404 NOT_FOUND**.
- [ ] As the stranger, DELETE /api/documents/DOC_ID. **Expected:** **404**; the
      owner document is untouched.
- [ ] (Share path) If a share UI/row exists, share DOC_ID with the stranger as
      viewer. **Expected:** the recipient can now read the document, its pages,
      latest analysis, findings, and evidence, but **not** the owner reminders or
      conversations. (This recipient-read path is also covered automatically by
      npm run test:rls.)

---

## 4. Delete

- [ ] As the owner, DELETE /api/documents/DOC_ID.
- [ ] **Expected:** 200. The Storage object and the row are removed, and derived
      data (pages, analyses, findings, evidence, jobs) is cascaded away. The
      response states that the **Lumen OCR copy cannot be deleted through the API**.
- [ ] GET /api/documents/DOC_ID afterward returns **404**.

---

## 5. Cleanup

- [ ] Delete the QA test documents you created.
- [ ] Delete the throwaway auth users (qa-tester@..., qa-stranger@...) via the
      Supabase dashboard so the project is left clean.

---

## What a PASS looks like

- Section 1 reaches a READY report for a clean upload (unless blocked by the
  known severity defect in 1e, in which case record that defect).
- Sections 2-4 all behave as the **Expected** lines state.
- No throwaway users or documents remain after section 5.

Record any deviation with the exact command, the response you got, and the
response you expected, and hand it back to the Manager.
