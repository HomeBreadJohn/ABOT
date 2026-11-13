import { afterEach, describe, expect, it, vi } from "vitest";

import { mockUtilityBillAnalysis } from "@/contracts";
import * as api from "@/lib/api-client";

/** A valid document-detail body (passes documentDetailResponseSchema). */
function documentDetail(documentId: string) {
  return {
    documentId,
    title: "Doc",
    lifecycle: "COMPLETED",
    stage: "PREPARING_REPORT",
    category: "UTILITIES",
    analysisStatus: "SUCCEEDED",
    nextDeadline: null,
    needsAttention: false,
    createdAt: new Date().toISOString(),
    subtype: null,
    mimeType: "application/pdf",
    fileSize: 1024,
    originalFilename: "doc.pdf",
    updatedAt: new Date().toISOString(),
    latestAnalysisId: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url: url as string,
    method: (init?.method as string) ?? "GET",
    body: init?.body as string | undefined,
    credentials: init?.credentials as string | undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("documents endpoints", () => {
  it("registerDocument POSTs to /api/documents with the create body", async () => {
    const res = {
      documentId: crypto.randomUUID(),
      storagePath: "u/d/file.pdf",
      uploadToken: "tok",
      uploadUrl: "https://storage.example/upload",
    };
    const fetchMock = stub(res);
    const input = {
      originalFilename: "file.pdf",
      mimeType: "application/pdf" as const,
      fileSize: 1024,
    };

    const out = await api.registerDocument(input);

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/documents");
    expect(call.method).toBe("POST");
    expect(call.credentials).toBe("same-origin");
    expect(JSON.parse(call.body!)).toEqual(input);
    expect(out).toEqual(res);
  });

  it("completeUpload POSTs to /api/documents/:id/upload-complete", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ documentId: id, lifecycle: "UPLOADED" });

    await api.completeUpload(id);

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${id}/upload-complete`);
    expect(call.method).toBe("POST");
  });

  it("listDocuments GETs /api/documents", async () => {
    const fetchMock = stub({ documents: [] });

    const out = await api.listDocuments();

    expect(lastCall(fetchMock).url).toBe("/api/documents");
    expect(lastCall(fetchMock).method).toBe("GET");
    expect(out).toEqual({ documents: [] });
  });

  it("getDocument GETs /api/documents/:id", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub(documentDetail(id));

    await api.getDocument(id);

    expect(lastCall(fetchMock).url).toBe(`/api/documents/${id}`);
    expect(lastCall(fetchMock).method).toBe("GET");
  });

  it("updateDocument PATCHes /api/documents/:id with the update body", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub(documentDetail(id));

    await api.updateDocument(id, { title: "New" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${id}`);
    expect(call.method).toBe("PATCH");
    expect(JSON.parse(call.body!)).toEqual({ title: "New" });
  });

  it("deleteDocument DELETEs /api/documents/:id", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ documentId: id, note: "gone" });

    await api.deleteDocument(id);

    expect(lastCall(fetchMock).url).toBe(`/api/documents/${id}`);
    expect(lastCall(fetchMock).method).toBe("DELETE");
  });

  it("maps a non-2xx apiError body to a thrown ApiClientError", async () => {
    stub(
      { error: { code: "FORBIDDEN", message: "No", requestId: crypto.randomUUID() } },
      403,
    );

    await expect(api.getDocument("x")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});

describe("analysis endpoints", () => {
  it("requestAnalysis POSTs mode + idempotencyKey to /api/documents/:id/analyze", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ documentId: id, jobId: crypto.randomUUID() });

    await api.requestAnalysis(id, { mode: "START", idempotencyKey: "k1" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${id}/analyze`);
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({ mode: "START", idempotencyKey: "k1" });
  });

  it("getAnalysis GETs /api/documents/:id/analysis with the language query", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ state: "PROCESSING", stage: "READING" });

    await api.getAnalysis(id, "FIL");

    expect(lastCall(fetchMock).url).toBe(
      `/api/documents/${id}/analysis?language=FIL`,
    );
  });

  it("getAnalysis omits the query when no language is given", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ state: "PROCESSING", stage: "READING" });

    await api.getAnalysis(id);

    expect(lastCall(fetchMock).url).toBe(`/api/documents/${id}/analysis`);
  });

  it("getAnalysisById GETs /api/analyses/:id", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({
      analysisId: id,
      documentId: crypto.randomUUID(),
      version: 1,
      generatedAt: new Date().toISOString(),
      analysis: mockUtilityBillAnalysis,
    });

    await api.getAnalysisById(id);

    expect(lastCall(fetchMock).url).toBe(`/api/analyses/${id}`);
  });

  it("getPage GETs /api/documents/:id/pages/:pageNumber", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({
      pageNumber: 2,
      status: "READY",
      text: "hello",
      words: [],
      averageConfidence: null,
    });

    await api.getPage(id, 2);

    expect(lastCall(fetchMock).url).toBe(`/api/documents/${id}/pages/2`);
  });
});

describe("corrections endpoints", () => {
  it("submitCorrections POSTs items to /api/documents/:id/corrections", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ corrections: [] });
    const input = {
      items: [{ pageNumber: 1, wordStart: 0, wordEnd: 1, correctedValue: "x" }],
    };

    await api.submitCorrections(id, input);

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${id}/corrections`);
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual(input);
  });

  it("listCorrections GETs /api/documents/:id/corrections", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ corrections: [] });

    await api.listCorrections(id);

    expect(lastCall(fetchMock).url).toBe(`/api/documents/${id}/corrections`);
  });
});

describe("conversations endpoints", () => {
  it("openConversation POSTs to /api/documents/:id/conversations", async () => {
    const id = crypto.randomUUID();
    const fetchMock = stub({ conversationId: "c1", documentId: id });

    await api.openConversation(id);

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${id}/conversations`);
    expect(call.method).toBe("POST");
  });

  it("askQuestion POSTs content to /api/conversations/:id/messages", async () => {
    const fetchMock = stub({
      messageId: "m1",
      answer: "a",
      evidenceIds: [],
      notFoundInDocument: false,
    });

    await api.askQuestion("c1", { content: "hi" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/conversations/c1/messages");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({ content: "hi" });
  });

  it("listMessages GETs /api/conversations/:id/messages", async () => {
    const fetchMock = stub({ messages: [] });

    await api.listMessages("c1");

    expect(lastCall(fetchMock).url).toBe("/api/conversations/c1/messages");
    expect(lastCall(fetchMock).method).toBe("GET");
  });
});

describe("cross-document endpoints", () => {
  it("suggestRelationships POSTs the pair to /api/cross-document/relationships/suggest", async () => {
    const fetchMock = stub({ suggestions: [] });

    await api.suggestRelationships({ documentIdA: "a", documentIdB: "b" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/cross-document/relationships/suggest");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({ documentIdA: "a", documentIdB: "b" });
  });

  it("reviewRelationship POSTs to /api/cross-document/relationships", async () => {
    const fetchMock = stub({ relationshipId: "r1", type: "CONFIRMED_MATCH" });

    await api.reviewRelationship({ relationshipId: "r1", action: "APPROVE" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/cross-document/relationships");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({
      relationshipId: "r1",
      action: "APPROVE",
    });
  });

  it("requestCrossAnalysis POSTs documentIds to /api/cross-document/analyze", async () => {
    const fetchMock = stub({ crossAnalysisId: "x1", documentIds: ["a", "b"] });

    await api.requestCrossAnalysis({ documentIds: ["a", "b"] });

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/cross-document/analyze");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({ documentIds: ["a", "b"] });
  });

  it("getCrossAnalysis GETs /api/cross-document/analyses/:id", async () => {
    const fetchMock = stub({
      crossAnalysisId: "x1",
      documentIds: ["a", "b"],
      status: "RUNNING",
    });

    await api.getCrossAnalysis("x1");

    expect(lastCall(fetchMock).url).toBe("/api/cross-document/analyses/x1");
  });
});
