# Lumen AI Chat API — Claude Companion

This file pairs with `ai-chat-openapi.yaml`. Drop both into your project (or attach both to a Claude conversation) and Claude will have everything it needs to scaffold a client, run a conversation end to end, or debug a call.

> **Preview.** The AI Chat API is published on the test and staging gateways only. It is not on live yet.

---

## What this API does

Lets your backend talk to the AI Chat instances your organization has configured in the Lumen Organization Portal. Four operations, all JSON, all under the `AI Chat` tag:

- **`GET /instances`** — the instances your key may open sessions against (`InstanceID`, `Name`, `Description`, `Status`).
- **`POST /instances/{id}/sessions`** — open a persistent session against one instance.
- **`POST /instances/{id}/sessions/{sessionID}/messages`** — send one user message and get the assistant's answer. The only call that invokes the model.
- **`GET /instances/{id}/sessions/{sessionID}/messages`** — the persisted transcript of a session.

Instances are created and configured by organization admins in the portal, not through this API.

---

## Base URL

The spec ships with a placeholder server:

```yaml
servers:
  - url: "https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat"
```

Prefix every path with your Lumen API origin + `/ai_chat`. Replace `api.staging.nonlive.lumen.bayanichain.tech` with the gateway host for your target environment (test or staging; live does not serve this path):

```
https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat
```

The portal sets this from `VITE_APIM_ORIGIN` at runtime — when generating code, ask the user for the actual origin for their target environment.

---

## Authentication

Every request needs **two** API key headers:

```
lumen-api-key:    <your-api-key>
lumen-api-secret: <your-api-secret>
```

Both come from the Lumen Organization Portal → Settings → API Keys. The key must carry the **AI Chat** grant; without it every call answers `403 ACCESS_DENIED`, and a read-only grant answers `403 VIEW_ONLY_ACCESS` on the two `POST` routes. There is no Bearer / OAuth flow on this API.

---

## Credits

Every call is priced in API credits and charged only after a 2xx:

| Call | Credits |
|---|---|
| `GET /instances` | 1 |
| `POST /instances/{id}/sessions` | 2 |
| `POST .../sessions/{sessionID}/messages` | 5 |
| `GET .../sessions/{sessionID}/messages` | 1 |

Two different balances can refuse a call, with two different codes:

- `403 API_CREDITS_INSUFFICIENT` — the API credit balance is below the call's price. Checked before the handler runs, on every route.
- `403 LC_INSUFFICIENT` — the organization's Lumen Credits balance is at or below zero. Checked on the message route only.

A turn the model does not answer within 25 s ends `504 AI_CHAT_REPLY_TIMEOUT` and is not charged; the question stays in the transcript without an answer.

---

## The conversation — step by step

### Stage 1 — list instances

```
GET {base}/instances
```

Response `{ "Instances": [{ "InstanceID", "Name", "Description", "Status" }], "Count" }`. Pick the `InstanceID` you want to talk to. An empty list means the organization has not configured an instance yet — nothing in this API can create one.

### Stage 2 — open a session

```
POST {base}/instances/{id}/sessions
Content-Type: application/json

{ "title": "Order support conversation" }
```

The body is optional; `title` is 1 to 200 characters and defaults to a timestamped name. The `201` body is `{ "Session": { "id", "organizationID", "title", "isArchived", "createdTS", "updatedTS", "metadata" } }` — keep `Session.id` for the next two calls. An unknown instance is `404`.

### Stage 3 — send a message (the turn)

```
POST {base}/instances/{id}/sessions/{sessionID}/messages
Content-Type: application/json

{ "message": "What are your support hours?" }
```

`message` is required, 1 to 4000 characters. The `200` body is `{ "Answer": { "sessionID", "answer", "citations", "degradedSources" } }` — the reply text is `Answer.answer`, already persisted together with your message. A non-empty `degradedSources` means a source the assistant normally consults was unavailable for this turn. Expect this call to take seconds, not milliseconds: it waits on the model. Budget a client timeout above 25 s, since that is where the backend gives up and answers `504`.

### Stage 4 — read the transcript

```
GET {base}/instances/{id}/sessions/{sessionID}/messages?limit=50
```

`limit` is 1 to 200 and defaults to 50; an invalid value falls back to 50 rather than failing. Response `{ "Messages": [{ "id", "sessionID", "role", "content", "createdTS" }], "Count" }` in chronological order, oldest first — the first `limit` messages of the transcript. There is no cursor on this surface (`before` is not accepted), so a session longer than 200 messages cannot be read past its 200th message through this API.

---

## Things that will trip people up

- **A session is owned by the key that created it.** Another key reading or writing it gets `403 SESSION_NOT_OWNED`. Rotating keys means old sessions become unreachable; open new ones.
- **A session is bound to its instance.** Calling it under a different `{id}` answers `404 SESSION_NOT_FOR_INSTANCE`.
- **The transcript is oldest first and stops at 200.** `GET .../messages` returns the first `limit` messages in chronological order; there is no cursor (`before` is not accepted), so messages past the 200th cannot be read through this API. Keep your own copy of a long conversation.
- **Replies stop at 25 s.** The backend ends the turn with `504 AI_CHAT_REPLY_TIMEOUT`, does not charge it, and leaves the question in the transcript with no answer. Retrying sends a new turn (and a new charge if it succeeds).
- **A turn the model cannot take is a status, not a charge.** `409 AI_CHAT_CONFLICT` means the session is archived; `429 AI_CHAT_MODEL_RATE_LIMITED` means the model provider is rate-limiting, retry after a pause; `502 AI_CHAT_MODEL_UPSTREAM_ERROR` means the provider failed; `503 AI_CHAT_MODEL_UNAVAILABLE` means a model call ran past its own budget. None of them charge credits.
- **Two 403 codes mean two different balances.** `API_CREDITS_INSUFFICIENT` is the per-call price; `LC_INSUFFICIENT` is the Lumen Credits gate on the message route. Top up the right one.
- **`503` is the environment, not your request.** `AI_CHAT_NOT_CONFIGURED` means the service has no model settings; `FEATURE_DISABLED` means you are calling an environment where the product is switched off (live, today); `PERMISSIONS_UPDATING` means a key edit is still settling — retry shortly.
- **Not on live.** The `/ai_chat` path is published on the test and staging gateways only. On live the gateway answers before any backend does.
- **The portal's Try It panel sends JSON and waits for a single response**, which suits all four routes. The message route can take most of the 25 s window; do not treat a slow spinner as a failure.

---

## Useful prompts to give Claude

Once both this file and the YAML spec are attached:

- *"Generate a typed TypeScript client for this API using the OpenAPI spec. Use the two header names and the base URL convention from the companion .md."*
- *"Write a Node.js function that lists instances, opens a session on the first one whose Status allows it, sends a message, and prints the Answer and then the transcript."*
- *"My POST .../messages returns 403. Tell me how to tell API_CREDITS_INSUFFICIENT, LC_INSUFFICIENT, SESSION_NOT_OWNED and ACCESS_DENIED apart and what to fix for each."*
- *"Build a small chat loop that reuses one session, keeps `Session.id` in a store, and handles 504 AI_CHAT_REPLY_TIMEOUT by offering a retry instead of showing an error."*

---

## Versioning

Spec version is in `info.version` of the YAML. This companion doc tracks alongside that spec — if you bump one, bump the other.
