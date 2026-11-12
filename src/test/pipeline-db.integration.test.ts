/**
 * Hosted-DB integration test for the pipeline's highest-value guarantees that
 * the in-memory unit fakes cannot prove: persist_analysis idempotency runs in
 * real Postgres, and the analysis read path never serves a RUNNING or FAILED
 * analysis row as a completed (READY) report.
 *
 * Runs against the linked hosted Supabase project with the service-role admin
 * client and a throwaway auth user. Excluded from `npm run test` by the
 * vitest `*.integration.test.ts` rule; run it with:
 *   npx vitest run src/test/pipeline-db.integration.test.ts
 * Skips cleanly (does not fail) when .env.local lacks the Supabase keys.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANALYSIS_SCHEMA_VERSION,
  mockUtilityBillAnalysis,
  type AnalysisResult,
} from "@/contracts";
import { getAnalysis } from "@/features/documents/services/document-queries";
import type { Database } from "@/types/database";

function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
    const vars: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) vars[match[1]] = match[2];
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnvLocal();
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

/** The finding-list flattening persist_analysis expects, mirroring analysis-jobs.ts. */
const FINDING_LISTS = [
  ["keyInformation", "KEY_INFORMATION"],
  ["obligations", "OBLIGATION"],
  ["watchouts", "WATCHOUT"],
  ["consequences", "CONSEQUENCE"],
  ["nextSteps", "NEXT_STEP"],
  ["importantDates", "IMPORTANT_DATE"],
] as const;

function toFindingRows(result: AnalysisResult) {
  const rows: Record<string, unknown>[] = [];
  for (const [list, findingType] of FINDING_LISTS) {
    for (const f of result[list]) {
      rows.push({
        findingType,
        title: f.title,
        explanation: f.explanation,
        severity: f.severity ?? null,
        informationStatus: f.informationStatus,
        confidence: f.confidence,
        basis: f.basis,
        evidenceIds: f.evidenceIds,
      });
    }
  }
  return rows;
}

/** Rewrite the fixture so its document IDs match the real document being analyzed. */
function reportFor(documentId: string): AnalysisResult {
  return {
    ...mockUtilityBillAnalysis,
    document: { ...mockUtilityBillAnalysis.document, documentId },
    evidence: mockUtilityBillAnalysis.evidence.map((e) => ({
      ...e,
      documentId,
    })),
  };
}

/**
 * Build the persist_analysis RPC args for a report, matching analysis-jobs.ts.
 * severityDefault fills a finding's missing severity so the idempotency proof
 * is not blocked by the separate findings.severity NOT NULL defect (see the
 * "production path" test, which asserts the unpatched behavior).
 */
function persistArgs(
  documentId: string,
  key: string,
  report: AnalysisResult,
  severityDefault: string | null = null,
) {
  const findings = toFindingRows(report).map((f) => ({
    ...f,
    severity: f.severity ?? severityDefault,
  }));
  return {
    p_document_id: documentId,
    // The function derives the owner from the document; this is ignored.
    p_user_id: documentId,
    p_idempotency_key: key,
    p_report: report as unknown as Database["public"]["Functions"]["persist_analysis"]["Args"]["p_report"],
    p_schema_version: ANALYSIS_SCHEMA_VERSION,
    p_language: "EN",
    p_model_instance_id: report.analysisMetadata.modelInstanceId ?? "",
    p_findings: findings as unknown as Database["public"]["Functions"]["persist_analysis"]["Args"]["p_findings"],
    p_evidence: report.evidence as unknown as Database["public"]["Functions"]["persist_analysis"]["Args"]["p_evidence"],
    p_outcome: "COMPLETED",
  };
}

describe.skipIf(!hasEnv)("pipeline DB guarantees (hosted)", () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  let documentId: string;

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const { data, error } = await admin.auth.admin.createUser({
      email: `pipeline-db-${suffix}@example.com`,
      password: "pipeline-db-test-password-1",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    userId = data.user.id;

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        user_id: userId,
        original_filename: "pipeline-db-bill.pdf",
        storage_path: `${userId}/pipeline-db/bill.pdf`,
        mime_type: "application/pdf",
        file_size: 2048,
        title: "Pipeline DB bill",
        // Analysis is expected on OCR_READY documents; set it so the state is realistic.
        processing_status: "OCR_READY",
      })
      .select("id")
      .single();
    if (docError || !doc) throw new Error(`document insert failed: ${docError?.message}`);
    documentId = doc.id;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    // Deleting the document cascades to analyses, findings, and evidence.
    if (documentId) await admin.from("documents").delete().eq("id", documentId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("persist_analysis is idempotent: the same key yields exactly one version", async () => {
    const report = reportFor(documentId);
    const key = `analyze:${documentId}:1`;
    // Fill missing severities so this test isolates idempotency from the
    // separate severity NOT NULL defect proven below.
    const args = persistArgs(documentId, key, report, "LOW");

    const first = await admin.rpc("persist_analysis", args);
    expect(first.error, first.error?.message).toBeNull();
    const second = await admin.rpc("persist_analysis", args);
    expect(second.error, second.error?.message).toBeNull();

    // Same analysis id returned both times.
    expect(second.data).toBe(first.data);

    // Exactly one row for this document — the second call inserted nothing.
    const { data: rows, error } = await admin
      .from("document_analyses")
      .select("id, version, status")
      .eq("document_id", documentId);
    expect(error, error?.message).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.version).toBe(1);
    expect(rows?.[0]?.status).toBe("SUCCEEDED");
    expect(rows?.[0]?.id).toBe(first.data);

    // Clean up so later tests start from a known state.
    await admin.from("document_analyses").delete().eq("document_id", documentId);
  });

  it("DEFECT GUARD: persist_analysis accepts a finding without severity, stored as NULL", async () => {
    // Reproduces the production path exactly: analysis-jobs.ts sends
    // `severity: f.severity ?? null`, and the utility-bill fixture's
    // keyInformation/obligations findings have no severity. severity is
    // optional in the contract (src/contracts/analysis.ts), so the column is
    // nullable (migration 20261116000000) and persist_analysis must succeed,
    // storing the severity-less finding with NULL severity.
    const report = reportFor(documentId);
    const key = `defect:${documentId}`;
    const args = persistArgs(documentId, key, report, null);

    const { data, error } = await admin.rpc("persist_analysis", args);

    expect(error, error?.message).toBeNull();
    expect(data).not.toBeNull();

    // A SUCCEEDED analysis row was written for this key.
    const { data: rows } = await admin
      .from("document_analyses")
      .select("id, status")
      .eq("document_id", documentId)
      .eq("idempotency_key", key);
    expect(rows ?? []).toHaveLength(1);
    expect(rows?.[0]?.status).toBe("SUCCEEDED");

    // At least one finding was stored with NULL severity (the severity-less ones).
    const { data: findings } = await admin
      .from("findings")
      .select("severity")
      .eq("analysis_id", data as string)
      .is("severity", null);
    expect((findings ?? []).length).toBeGreaterThan(0);

    // Clean up so later tests start from a known state.
    await admin.from("document_analyses").delete().eq("document_id", documentId);
  });

  it("a RUNNING analysis row is never served as READY by the read path", async () => {
    // Insert a real RUNNING row with a distinct key (no report yet).
    const runningKey = `running:${documentId}`;
    const { error: insertError } = await admin.from("document_analyses").insert({
      document_id: documentId,
      user_id: userId,
      provider: "lumen",
      model: "ai-chat",
      version: 99, // highest version, so it is the "latest" row.
      status: "RUNNING",
      schema_version: ANALYSIS_SCHEMA_VERSION,
      idempotency_key: runningKey,
    });
    expect(insertError, insertError?.message).toBeNull();

    // Read the latest row exactly as document-queries.latestAnalysisRow does,
    // then drive the real getAnalysis selection logic with that real row.
    const latest = await fetchLatestAnalysisRow(admin, documentId);
    expect(latest?.status).toBe("RUNNING");

    const response = await getAnalysis(userId, documentId, undefined, {
      getRow: async () => ({
        id: documentId,
        user_id: userId,
        title: "Pipeline DB bill",
        original_filename: "pipeline-db-bill.pdf",
        processing_status: "ANALYZING",
        category: null,
        subtype: null,
        mime_type: "application/pdf",
        file_size: 2048,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      latestAnalysisRow: async () => latest,
    });

    expect(response.state).not.toBe("READY");
    expect(response.state).toBe("PROCESSING");

    await admin
      .from("document_analyses")
      .delete()
      .eq("document_id", documentId)
      .eq("idempotency_key", runningKey);
  });

  it("a FAILED analysis row is never served as READY by the read path", async () => {
    const failedKey = `failed:${documentId}`;
    const { error: insertError } = await admin.from("document_analyses").insert({
      document_id: documentId,
      user_id: userId,
      provider: "lumen",
      model: "ai-chat",
      version: 99,
      status: "FAILED",
      schema_version: ANALYSIS_SCHEMA_VERSION,
      idempotency_key: failedKey,
    });
    expect(insertError, insertError?.message).toBeNull();

    const latest = await fetchLatestAnalysisRow(admin, documentId);
    expect(latest?.status).toBe("FAILED");

    const response = await getAnalysis(userId, documentId, undefined, {
      getRow: async () => ({
        id: documentId,
        user_id: userId,
        title: "Pipeline DB bill",
        original_filename: "pipeline-db-bill.pdf",
        processing_status: "ANALYSIS_FAILED",
        category: null,
        subtype: null,
        mime_type: "application/pdf",
        file_size: 2048,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      latestAnalysisRow: async () => latest,
    });

    expect(response.state).not.toBe("READY");
    expect(response.state).toBe("FAILED");

    await admin
      .from("document_analyses")
      .delete()
      .eq("document_id", documentId)
      .eq("idempotency_key", failedKey);
  });
});

/** Latest analysis row by version, the same select document-queries uses. */
async function fetchLatestAnalysisRow(
  admin: SupabaseClient<Database>,
  documentId: string,
) {
  const { data, error } = await admin
    .from("document_analyses")
    .select("id, status, version, report_json")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
