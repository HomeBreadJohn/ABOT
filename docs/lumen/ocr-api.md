# Lumen OCR API — Claude Companion

This file pairs with `ocr-openapi.yaml`. Drop both into your project (or attach both to a Claude conversation) and Claude will have everything it needs to scaffold a client, upload and read a document end to end, or debug a review call.

> **Preview.** The OCR API is published on the test and staging gateways only. It is not on live yet.

---

## What this API does

Reads documents your backend uploads and hands back the recognised text page by page, with a review log for human corrections. Thirteen operations in three groups:

- **Documents** — upload (`POST /documents`), list, read one record, re-queue a failed read, download the stored bytes.
- **Pages** — list the pages of a read document, or read one page with its words and lines.
- **Review** — submit a judgement against a word or field under an entity tag, list the judgement log, fetch a target's current tag, read the review envelope and a page in review shape, and correct a single word.

`DELETE /documents/{documentID}` exists in the backend but is refused on the developer surface and is not published. Don't call it.

---

## Base URL

The spec ships with a placeholder server:

```yaml
servers:
  - url: "https://api.staging.nonlive.lumen.bayanichain.tech/ocr"
```

Prefix every path with your Lumen API origin + `/ocr`. Replace `api.staging.nonlive.lumen.bayanichain.tech` with the gateway host for your target environment (test or staging; live does not serve this path):

```
https://api.staging.nonlive.lumen.bayanichain.tech/ocr
```

The portal sets this from `VITE_APIM_ORIGIN` at runtime — when generating code, ask the user for the actual origin for their target environment.

---

## Authentication

Every request needs **two** API key headers:

```
lumen-api-key:    <your-api-key>
lumen-api-secret: <your-api-secret>
```

Both come from the Lumen Organization Portal → Settings → API Keys. The key must carry the **OCR** grant; without it every call answers `403 ACCESS_DENIED`, and a read-only grant answers `403 VIEW_ONLY_ACCESS` on the `POST` routes. There is no Bearer / OAuth flow on this API.

---

## Response envelope

Every JSON success body is wrapped:

```json
{ "data": { ... }, "requestId": "..." }
```

Read the resource from `data`. Keep `requestId` in your logs; it is what support will ask for. Two routes are not JSON: the upload takes raw bytes in, and `GET /documents/{documentID}/file` sends raw bytes out.

---

## Credits

Every call is priced in API credits:

| Call | Credits |
|---|---|
| `POST /documents` (upload) | 6 |
| `POST /documents/{documentID}/retry` | 3 |
| `POST /documents/{documentID}/reviews` | 2 |
| `POST /documents/{documentID}/review/corrections` | 2 |
| Every `GET` | 1 |

Two different balances can refuse a call, with two different codes:

- `403 API_CREDITS_INSUFFICIENT` — the API credit balance is below the call's price. Checked before the handler runs, on every route.
- `403 LC_INSUFFICIENT` — the organization's Lumen Credits balance is at or below zero. Checked on upload and retry only.

When the charge lands differs by route. Every `GET`, review and correction is charged after its 2xx. Upload and retry are charged when the read ends: once, when it ends `READY` or `PARTIAL`. A `FAILED` read, a read that threw, or bytes that never landed charge nothing, and a `201` descriptor upload is never charged. The pre-check is unchanged — a balance below the price is still refused before the handler runs.

---

## Upload and read — step by step

### Stage 1 — upload the bytes

```
POST {base}/documents
Content-Type: application/pdf
X-Lumen-Document-Name: invoice-2026-09.pdf

<raw file bytes>
```

```bash
curl -i "{base}/documents" \
  -H "lumen-api-key: YOUR_API_KEY" \
  -H "lumen-api-secret: YOUR_API_SECRET" \
  -H "Content-Type: application/pdf" \
  -H "X-Lumen-Document-Name: invoice-2026-09.pdf" \
  --data-binary @invoice-2026-09.pdf
```

Rules:

- `Content-Type` must be one of `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`, `image/webp`. Anything else is `415`.
- The body is at most **10 MiB**. Larger is `413`, from the gateway before the service sees it.
- `X-Lumen-Document-Name` is the percent-encoded UTF-8 display name, 1 to 256 characters after decoding. Required in this mode.
- Send the bytes as the body (`--data-binary`), not as multipart form data and not base64.

The `202` carries a `Location` header pointing at the new record and a body whose `data.DocumentID` is the id for every later call.

**Descriptor mode.** Sending JSON `{ "Name", "MediaType", "ByteSize" }` with `Content-Type: application/json` registers a `PENDING` record and answers `201` instead; the bytes travel out of band. Use the bytes mode unless you have been told otherwise.

### Stage 2 — poll until the read is done

```
GET {base}/documents/{documentID}
```

`data.Status` moves `PENDING` → `PROCESSING` → `READY`, `PARTIAL` or `FAILED`. Poll every few seconds. `READY` and `PARTIAL` both have pages to read (`PARTIAL` means some pages failed); `data.PageCount` is the number of pages recognised. `FAILED` can be re-queued with `POST /documents/{documentID}/retry` (3 credits, charged only when the re-queued read ends `READY` or `PARTIAL`), which is also allowed for `PARTIAL` and for a `PROCESSING` read that has been running longer than the service's stale threshold; any other state is `409 OCR_DOCUMENT_NOT_RETRYABLE`.

### Stage 3 — read the pages

```
GET {base}/documents/{documentID}/pages?IncludeWords=true
GET {base}/documents/{documentID}/pages/{pageNumber}
```

The list gives one entry per page that was read — origin (text layer or rasterised), geometry, confidence and the transform back to the source page. `IncludeWords` is the literal string `true` or `false` (default `false`); the response's `IncludesWords` flag states whether word arrays are present, so an empty page and an omitted one are never confused. A page that failed to read has no record and answers `404` on the single-page route.

`GET /documents/{documentID}/file` returns the stored bytes exactly as uploaded, with the record's `Content-Type`, `Content-Length` and `Content-Disposition: inline`.

---

## Review and corrections

Judgements are append-only evidence, guarded by an entity tag so two reviewers cannot silently overwrite each other.

### Get the current tag, then judge

```
GET {base}/documents/{documentID}/reviews/revision?Kind=word&PageNumber=1&WordIndex=0
→ 200 { "data": { "ETag": "\"<32 hex>\"" }, "requestId": "..." }

POST {base}/documents/{documentID}/reviews
If-Match: "<32 hex>"
Content-Type: application/json

{ "Target": { "Kind": "word", "PageNumber": 1, "WordIndex": 0 }, "Action": "CORRECTED", "CorrectedValue": "Invoice", "Note": "OCR read the capital I as l" }
```

- `Target` is a word target (`Kind: "word"`, `PageNumber`, `WordIndex`) or a field target (`Kind: "field"`, `FieldPath`).
- `Action` is `CONFIRMED`, `CORRECTED` or `REJECTED`; `CorrectedValue` goes with `CORRECTED`.
- The `201` body is `{ "data": Review, "requestId" }`, where `Review` is `{ "ReviewID", "DocumentID", "Target", "Action", "OriginalValue", "OriginalConfidence", "CorrectedValue", "Engine", "ReviewedBy", "ReviewedTS", "Note" }`. It carries a strong `ETag` response header for the new revision; that is the `If-Match` for your next judgement on the same target.
- `If-Match: *` is accepted (no revision check), but the module still applies its conservative floor: replacing another reviewer's different value without a tag answers `409 OCR_REVIEW_CONFLICT`, so `*` is not a way to skip the guard.
- A request without `If-Match` (absent or blank) answers `428 ocr_review_precondition_required` before it reaches the module; a judgement against a stale tag answers `409 OCR_REVIEW_CONFLICT`; a malformed tag (not 32 lower-case hex, not `*`) answers `400 invalid_request_header`. Treat the 428 and the 409 as "fetch the tag again and resubmit", not as a retry loop.

`GET /documents/{documentID}/reviews` returns the judgement log as `data.Items`, oldest first — each item a `Review` as above. Reviews are never deleted.

### The review widget routes

`GET /documents/{documentID}/review` is the envelope a review UI reads first — engine stamp, fingerprint, aggregate confidence and the banding thresholds. Its `pages` array is empty on purpose; load pages one at a time with `GET /documents/{documentID}/review/pages/{pageNumber}`. The envelope answers `409` while the document is still `PENDING`, `PROCESSING` or `FAILED`.

`POST /documents/{documentID}/review/corrections` replaces one word's text and appends a `CORRECTED` judgement in one call:

```json
{ "documentId": "<same as the path>", "pageNumber": 1, "wordIndex": 0, "text": "Invoice", "fingerprint": "<from the envelope, optional>" }
```

`documentId` must equal the path. `fingerprint`, when sent, must equal the record's current one or the call is `409`. The corrected word comes back with an unmeasured, human-supplied confidence, never a fabricated score. Note the lower-case field names on this route; every other body in this API is PascalCase.

---

## Things that will trip people up

- **Everything JSON is wrapped in `{ data, requestId }`.** `data.DocumentID`, not `DocumentID`. A client that reads the top level gets `undefined` everywhere.
- **The upload is raw bytes, not JSON.** The portal's Try It panel sends JSON bodies only, so it can exercise the descriptor mode (`201`) but not the bytes mode. Use the curl above for a real upload. The Try It panel can call `GET .../file` but shows the bytes as text; use curl with `-o` to download.
- **`Content-Type` decides the mode.** `application/json` means descriptor; one of the five document types means bytes. A body with a mismatched type is `400` or `415`.
- **10 MiB, five media types.** `413` and `415` come back before any credits are charged.
- **`If-Match` is required on judgements** (`428 ocr_review_precondition_required` without it); a stale tag is `409 OCR_REVIEW_CONFLICT`. Fetch the tag with `GET .../reviews/revision` before the first judgement on a target and use the `ETag` from each `201` after that.
- **`409` has three meanings on this API:** not retryable (`retry`, `OCR_DOCUMENT_NOT_RETRYABLE`), not read yet (`review` envelope, `OCR_DOCUMENT_NOT_READY`), stale (`reviews` with a wrong tag, `OCR_REVIEW_CONFLICT`; `corrections` with a wrong fingerprint). The error `code` tells them apart.
- **`IncludeWords` is a string.** Send `true` or `false` literally. Coerced truthiness would read `false` as true and load every word of every page, which is why the service refuses anything else.
- **Another organization's document is `404`,** identical to one that does not exist. A `404` is not proof the id is wrong.
- **No DELETE.** The developer surface refuses it and the gateway does not publish it. Archive or delete from the Organization Portal.
- **Not on live.** The `/ocr` path is published on the test and staging gateways only. On live the gateway answers before any backend does.
- **`503` is the environment, not your request.** `OCR_NOT_CONFIGURED` means the service has no engine; `OCR_READ_QUEUE_FULL` means try the upload again shortly; `FEATURE_DISABLED` means the product is switched off where you are calling; `PERMISSIONS_UPDATING` means a key edit is still settling.

---

## Useful prompts to give Claude

Once both this file and the YAML spec are attached:

- *"Generate a typed TypeScript client for this API using the OpenAPI spec. Unwrap the `{ data, requestId }` envelope in one place and use the two header names from the companion .md."*
- *"Write a Node.js function that uploads a local PDF with `--data-binary` semantics (raw bytes, `Content-Type: application/pdf`, percent-encoded `X-Lumen-Document-Name`), polls `GET /documents/{id}` until READY or PARTIAL, then prints the words of page 1."*
- *"My POST /documents returns 400. Check whether I sent multipart form data or JSON instead of raw bytes, and whether the media type is one of the five accepted."*
- *"Implement a review step: fetch the entity tag for word 0 on page 1, submit a CORRECTED judgement with If-Match, and on a 409 refetch the tag and resubmit once."*

---

## Versioning

Spec version is in `info.version` of the YAML. This companion doc tracks alongside that spec — if you bump one, bump the other.
