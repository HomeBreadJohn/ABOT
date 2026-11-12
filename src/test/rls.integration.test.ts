/**
 * RLS integration test against the linked hosted Supabase project.
 * Skips when .env.local does not carry the Supabase URL and keys (e.g. CI
 * without secrets) so the suite still passes there.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

const hasEnv = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

type Client = SupabaseClient<Database>;

describe.skipIf(!hasEnv)("document intelligence RLS (hosted)", () => {
  let admin: SupabaseClient<Database>;
  let owner: Client;
  let recipient: Client;
  let stranger: Client;
  let ownerId: string;
  let documentId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const users: { email: string; password: string }[] = [
      { email: `rls-owner-${suffix}@example.com`, password: "rls-test-password-1" },
      { email: `rls-recipient-${suffix}@example.com`, password: "rls-test-password-1" },
      { email: `rls-stranger-${suffix}@example.com`, password: "rls-test-password-1" },
    ];
    const sessions: Client[] = [];
    for (const spec of users) {
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password: spec.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
      createdUserIds.push(data.user.id);
      const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
      const { error: signInError } = await client.auth.signInWithPassword(spec);
      if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
      sessions.push(client);
    }
    [owner, recipient, stranger] = sessions;
    ownerId = createdUserIds[0];

    // Owner registers a document (row only; no storage object is needed for RLS).
    const { data: doc, error: docError } = await owner
      .from("documents")
      .insert({
        user_id: ownerId,
        original_filename: "electric-bill.pdf",
        storage_path: `${ownerId}/rls-test/electric-bill.pdf`,
        mime_type: "application/pdf",
        file_size: 2048,
        title: "Electric bill",
      })
      .select("id")
      .single();
    if (docError || !doc) throw new Error(`document insert failed: ${docError?.message}`);
    documentId = doc.id;

    // Owner shares it with the recipient as viewer.
    const { error: shareError } = await owner.from("document_shares").insert({
      document_id: documentId,
      owner_id: ownerId,
      shared_with_user_id: createdUserIds[1],
      permission: "viewer",
    });
    if (shareError) throw new Error(`share insert failed: ${shareError.message}`);

    // Pipeline-derived rows exist only through the service role.
    const { data: analysis, error: analysisError } = await admin
      .from("document_analyses")
      .insert({
        document_id: documentId,
        user_id: ownerId,
        provider: "lumen",
        model: "ai-chat",
        version: 1,
        status: "SUCCEEDED",
        report_json: { document: { documentId } },
        schema_version: "1.0.0",
        idempotency_key: `analyze:${documentId}:1`,
      })
      .select("id")
      .single();
    if (analysisError || !analysis) throw new Error(`analysis insert failed: ${analysisError?.message}`);

    const { data: finding, error: findingError } = await admin
      .from("findings")
      .insert({
        analysis_id: analysis.id,
        user_id: ownerId,
        document_id: documentId,
        finding_type: "AMOUNT_DUE",
        title: "Amount due",
        explanation: "The bill states an amount due.",
        severity: "HIGH",
        information_status: "FOUND",
        confidence: 0.95,
      })
      .select("id")
      .single();
    if (findingError || !finding) throw new Error(`finding insert failed: ${findingError?.message}`);

    const { error: evidenceError } = await admin.from("evidence_references").insert({
      finding_id: finding.id,
      document_id: documentId,
      user_id: ownerId,
      page_number: 1,
      excerpt: "Total amount due: 1,250.00",
      source_type: "OCR_TEXT",
      word_start: 0,
      word_end: 4,
      match_confidence: 1,
    });
    if (evidenceError) throw new Error(`evidence insert failed: ${evidenceError.message}`);

    const { error: pageError } = await admin.from("document_pages").insert({
      document_id: documentId,
      user_id: ownerId,
      page_number: 1,
      extracted_text: "Total amount due: 1,250.00",
      ocr_status: "READY",
      average_confidence: 0.9,
    });
    if (pageError) throw new Error(`page insert failed: ${pageError.message}`);

    // Owner-owned non-shared data the recipient must not see.
    const { error: reminderError } = await owner.from("reminders").insert({
      user_id: ownerId,
      document_id: documentId,
      title: "Pay the bill",
      due_at: new Date("2026-12-01").toISOString(),
    });
    if (reminderError) throw new Error(`reminder insert failed: ${reminderError.message}`);
  }, 60_000);

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("stranger sees zero rows of owner data", async () => {
    for (const table of [
      "documents",
      "document_pages",
      "document_chunks",
      "document_analyses",
      "findings",
      "evidence_references",
      "ocr_corrections",
      "analysis_translations",
      "document_relationships",
      "cross_document_analyses",
      "cross_document_analysis_documents",
      "reminders",
      "conversations",
      "messages",
      "provider_calls",
      "processing_jobs",
    ] as const) {
      const { count, error } = await stranger
        .from(table)
        .select("*", { count: "exact", head: true });
      expect(error, table).toBeNull();
      expect(count, `stranger rows in ${table}`).toBe(0);
    }
  });

  it("recipient can read the shared document, pages, latest analysis, findings, and evidence", async () => {
    const doc = await recipient
      .from("documents")
      .select("id, title, processing_status")
      .eq("id", documentId)
      .maybeSingle();
    expect(doc.error).toBeNull();
    expect(doc.data?.title).toBe("Electric bill");

    const pages = await recipient
      .from("document_pages")
      .select("page_number, extracted_text")
      .eq("document_id", documentId);
    expect(pages.error).toBeNull();
    expect(pages.data).toHaveLength(1);
    expect(pages.data?.[0]?.extracted_text).toContain("1,250.00");

    const analyses = await recipient
      .from("document_analyses")
      .select("id, version, status")
      .eq("document_id", documentId)
      .order("version", { ascending: false })
      .limit(1);
    expect(analyses.error).toBeNull();
    expect(analyses.data?.[0]?.status).toBe("SUCCEEDED");

    const findings = await recipient
      .from("findings")
      .select("title")
      .eq("document_id", documentId);
    expect(findings.error).toBeNull();
    expect(findings.data?.[0]?.title).toBe("Amount due");

    const evidence = await recipient
      .from("evidence_references")
      .select("excerpt")
      .eq("document_id", documentId);
    expect(evidence.error).toBeNull();
    expect(evidence.data?.[0]?.excerpt).toContain("1,250.00");
  });

  it("recipient cannot read the owner's reminders or conversations", async () => {
    const reminders = await recipient
      .from("reminders")
      .select("*", { count: "exact", head: true });
    expect(reminders.error).toBeNull();
    expect(reminders.count).toBe(0);

    const conversations = await recipient
      .from("conversations")
      .select("*", { count: "exact", head: true });
    expect(conversations.error).toBeNull();
    expect(conversations.count).toBe(0);
  });

  it("owner cannot update documents.processing_status", async () => {
    const { error } = await owner
      .from("documents")
      .update({ processing_status: "COMPLETED" })
      .eq("id", documentId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|row-level security/i);
  });

  it("owner can update documents.title", async () => {
    const { error } = await owner
      .from("documents")
      .update({ title: "Electric bill (November)" })
      .eq("id", documentId);
    expect(error).toBeNull();
    const { data } = await owner
      .from("documents")
      .select("title")
      .eq("id", documentId)
      .single();
    expect(data?.title).toBe("Electric bill (November)");
  });

  it("owner cannot insert into pipeline tables", async () => {
    const deniedRows: [keyof Database["public"]["Tables"], Record<string, unknown>][] = [
      [
        "document_analyses",
        {
          document_id: documentId,
          user_id: ownerId,
          provider: "lumen",
          model: "ai-chat",
          version: 2,
          status: "RUNNING",
          idempotency_key: `analyze:${documentId}:2`,
        },
      ],
      [
        "findings",
        {
          analysis_id: "00000000-0000-0000-0000-000000000000",
          user_id: ownerId,
          document_id: documentId,
          finding_type: "X",
          title: "X",
          explanation: "x",
          severity: "LOW",
          information_status: "FOUND",
        },
      ],
      [
        "evidence_references",
        {
          finding_id: "00000000-0000-0000-0000-000000000000",
          document_id: documentId,
          user_id: ownerId,
          page_number: 1,
          excerpt: "x",
          source_type: "OCR_TEXT",
        },
      ],
      [
        "document_pages",
        {
          document_id: documentId,
          user_id: ownerId,
          page_number: 2,
          extracted_text: "x",
          ocr_status: "READY",
        },
      ],
      [
        "processing_jobs",
        {
          document_id: documentId,
          user_id: ownerId,
          job_type: "OCR_SUBMIT",
        },
      ],
    ];
    for (const [table, row] of deniedRows) {
      const { error } = await owner.from(table).insert(row as never);
      expect(error, table).not.toBeNull();
      expect(error?.message, table).toMatch(/permission denied|row-level security/i);
    }
  });

  it("owner can insert own ocr_corrections, reminders, conversations, and messages", async () => {
    const correction = await owner.from("ocr_corrections").insert({
      document_id: documentId,
      user_id: ownerId,
      page_number: 1,
      original_value: "1,250.00",
      corrected_value: "1,260.00",
      correction_status: "PENDING",
    });
    expect(correction.error).toBeNull();

    const conversation = await owner
      .from("conversations")
      .insert({ user_id: ownerId, document_id: documentId })
      .select("id")
      .single();
    expect(conversation.error).toBeNull();

    const message = await owner.from("messages").insert({
      conversation_id: conversation.data!.id,
      user_id: ownerId,
      role: "user",
      content: "What is the due date on this bill?",
    });
    expect(message.error).toBeNull();

    const reminder = await owner.from("reminders").insert({
      user_id: ownerId,
      document_id: documentId,
      title: "Second reminder",
    });
    expect(reminder.error).toBeNull();
  });

  it("authenticated cannot execute claim_processing_job", async () => {
    const { error } = await owner.rpc("claim_processing_job", { lease_seconds: 60 });
    expect(error).not.toBeNull();
  });
});
