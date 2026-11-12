import "server-only";

import { z } from "zod";

import {
  openConversationResponseSchema,
  sendMessageResponseSchema,
  listMessagesResponseSchema,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAnalysisResult } from "@/contracts";
import { requestJson } from "@/features/intelligence/services/json-reply";
import {
  buildFollowUpPrompt,
  type PromptEvidence,
} from "@/features/intelligence/prompts/follow-up";
import { selectEvidence } from "@/features/conversations/services/retrieve-context";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/providers/chat-provider";
import { getChatProvider, type ChatProvider } from "@/lib/providers";

/** At most this many questions per user per hour. */
const RATE_LIMIT_PER_HOUR = 30;

/** Messages replayed when a lost Lumen session must be recreated. */
const SESSION_SEED_MESSAGES = 6;

/** The reply shape the assistant must return (validated before use). */
const followUpReplySchema = z.object({
  answer: z.string(),
  evidenceIds: z.array(z.string()),
  notFoundInDocument: z.boolean(),
});

export type StoredMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  evidenceIds: string[];
  createdAt: string;
};

/** Data-access seam so unit tests run against in-memory fakes. */
export type ConversationsDeps = {
  /** True when the user owns or is shared the document. */
  authorize: (userId: string, documentId: string) => Promise<boolean>;
  createConversation: (userId: string, documentId: string) => Promise<string>;
  getConversation: (
    conversationId: string,
  ) => Promise<{
    userId: string;
    documentId: string;
    sessionId: string | null;
  } | null>;
  /** Report summary and the evidence excerpts of the latest analysis. */
  loadAnalysis: (
    documentId: string,
  ) => Promise<{ summary: string; evidence: PromptEvidence[] }>;
  listMessages: (conversationId: string) => Promise<StoredMessage[]>;
  insertMessage: (
    m: Omit<StoredMessage, "id" | "createdAt">,
  ) => Promise<StoredMessage>;
  setSession: (
    conversationId: string,
    sessionId: string | null,
  ) => Promise<void>;
  /** Questions this user asked in the last hour. */
  countRecentQuestions: (userId: string) => Promise<number>;
  /** One chat provider instance per conversation request. */
  getChat: () => ChatProvider;
};

/**
 * Open a conversation on a document. The caller must own the document or have
 * it shared with them; otherwise we hide its existence with NOT_FOUND. The
 * conversation row belongs to the caller, so a recipient opens their OWN
 * conversation and never sees the owner's.
 */
export async function openConversation(
  userId: string,
  documentId: string,
  deps: ConversationsDeps = defaultDeps(),
): Promise<z.infer<typeof openConversationResponseSchema>> {
  if (!(await deps.authorize(userId, documentId))) {
    throw new AppError("NOT_FOUND");
  }
  const conversationId = await deps.createConversation(userId, documentId);
  return openConversationResponseSchema.parse({ conversationId, documentId });
}

/**
 * Ask a grounded follow-up question. The answer is produced from the report
 * summary plus the evidence excerpts most relevant to the question, wrapped as
 * untrusted DATA. The assistant's cited evidence IDs are filtered to those that
 * exist in the current analysis (unknown IDs are dropped, never invented). Both
 * the user question and the assistant answer are persisted; the database is the
 * source of truth. A lost Lumen session is recreated once, seeded with the last
 * six messages summarized.
 */
export async function askQuestion(
  userId: string,
  conversationId: string,
  content: string,
  deps: ConversationsDeps = defaultDeps(),
): Promise<z.infer<typeof sendMessageResponseSchema>> {
  const conversation = await deps.getConversation(conversationId);
  // Only the conversation's owner may ask in it; anyone else gets NOT_FOUND.
  if (!conversation || conversation.userId !== userId) {
    throw new AppError("NOT_FOUND");
  }

  // Rate limit before any provider call so a flood cannot spend credits.
  if ((await deps.countRecentQuestions(userId)) > RATE_LIMIT_PER_HOUR) {
    throw new AppError("RATE_LIMITED");
  }

  const { summary, evidence } = await deps.loadAnalysis(
    conversation.documentId,
  );
  const validIds = new Set(evidence.map((e) => e.id));

  // Reserve budget for the fixed header/question, then rank evidence to fit.
  const evidenceBudget = Math.max(
    0,
    CHAT_MESSAGE_MAX_LENGTH - content.length - summary.length - 512,
  );
  const picked = selectEvidence(content, evidence, evidenceBudget);
  const message = buildFollowUpPrompt({ summary, evidence: picked, question: content });

  // Store the user's question first: the DB is the source of truth.
  await deps.insertMessage({
    conversationId,
    userId,
    role: "user",
    content,
    evidenceIds: [],
  });

  const chat = deps.getChat();
  const reply = await askWithSessionRecovery(
    chat,
    conversationId,
    conversation.sessionId,
    message,
    deps,
  );

  // Keep only evidence IDs that exist in the current analysis.
  const evidenceIds = reply.notFoundInDocument
    ? []
    : reply.evidenceIds.filter((id) => validIds.has(id));
  const answer = reply.answer;

  const stored = await deps.insertMessage({
    conversationId,
    userId,
    role: "assistant",
    content: answer,
    evidenceIds,
  });

  return sendMessageResponseSchema.parse({
    messageId: stored.id,
    answer,
    evidenceIds,
    notFoundInDocument: reply.notFoundInDocument,
  });
}

/** Message history for a conversation the caller owns. */
export async function listConversationMessages(
  userId: string,
  conversationId: string,
  deps: ConversationsDeps = defaultDeps(),
): Promise<z.infer<typeof listMessagesResponseSchema>> {
  const conversation = await deps.getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new AppError("NOT_FOUND");
  }
  const messages = await deps.listMessages(conversationId);
  return listMessagesResponseSchema.parse({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role === "user" ? "USER" : "ASSISTANT",
      content: m.content,
      evidenceIds: m.role === "assistant" ? m.evidenceIds : undefined,
      createdAt: m.createdAt,
    })),
  });
}

/**
 * Ask on the stored session; if there is none, or the send fails because the
 * Lumen session was lost, open a fresh session ONCE, seed it with the last six
 * messages summarized, persist the new id, and retry. A second failure
 * propagates. One provider instance is used throughout the request.
 */
async function askWithSessionRecovery(
  chat: ChatProvider,
  conversationId: string,
  current: string | null,
  message: string,
  deps: ConversationsDeps,
): Promise<z.infer<typeof followUpReplySchema>> {
  if (current) {
    try {
      return await requestJson(chat, current, message, followUpReplySchema);
    } catch (error) {
      // Only a lost session is recoverable here; contract errors propagate.
      if (error instanceof AppError) throw error;
    }
  }

  const sessionId = await recreateSession(chat, conversationId, deps);
  return requestJson(chat, sessionId, message, followUpReplySchema);
}

/** Open and seed a new session from recent history, then persist its id. */
async function recreateSession(
  chat: ChatProvider,
  conversationId: string,
  deps: ConversationsDeps,
): Promise<string> {
  const { sessionId } = await chat.openSession();
  const history = await deps.listMessages(conversationId);
  const recent = history.slice(-SESSION_SEED_MESSAGES);
  if (recent.length > 0) {
    // Seeding is best-effort context; a failure must not block the question.
    try {
      await chat.send(sessionId, buildSeedMessage(recent));
    } catch {
      /* ignore: the question itself follows */
    }
  }
  await deps.setSession(conversationId, sessionId);
  return sessionId;
}

/** A compact recap of recent turns, kept within the chat length budget. */
function buildSeedMessage(messages: StoredMessage[]): string {
  const lines = messages.map(
    (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
  );
  const body = [
    "Here is a summary of the recent conversation so far. Use it only as context for the next question.",
    ...lines,
  ].join("\n");
  return body.length > CHAT_MESSAGE_MAX_LENGTH
    ? body.slice(0, CHAT_MESSAGE_MAX_LENGTH)
    : body;
}

/* -------------------------------------------------------------------------- */
/* Production data access via the service-role admin client. The app-level     */
/* owner-or-shared check is the real authorization gate.                       */
/* -------------------------------------------------------------------------- */

function defaultDeps(): ConversationsDeps {
  const admin = createAdminClient();
  return {
    async authorize(userId, documentId) {
      const { data: doc } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc) return false;
      if (doc.user_id === userId) return true;
      const { data: share } = await admin
        .from("document_shares")
        .select("id")
        .eq("document_id", documentId)
        .eq("shared_with_user_id", userId)
        .maybeSingle();
      return Boolean(share);
    },
    async createConversation(userId, documentId) {
      const { data, error } = await admin
        .from("conversations")
        .insert({ user_id: userId, document_id: documentId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    async getConversation(conversationId) {
      const { data } = await admin
        .from("conversations")
        .select("user_id, document_id, lumen_session_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!data) return null;
      return {
        userId: data.user_id as string,
        documentId: data.document_id as string,
        sessionId: (data.lumen_session_id as string | null) ?? null,
      };
    },
    async loadAnalysis(documentId) {
      const { data: analysis } = await admin
        .from("document_analyses")
        .select("report_json")
        .eq("document_id", documentId)
        .eq("status", "SUCCEEDED")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!analysis) return { summary: "", evidence: [] };
      const result = parseAnalysisResult(analysis.report_json, { documentId });
      const summary = [result.overview, result.explanation]
        .filter(Boolean)
        .join("\n\n");
      return {
        summary,
        evidence: result.evidence.map((e) => ({ id: e.id, excerpt: e.excerpt })),
      };
    },
    async listMessages(conversationId) {
      const { data } = await admin
        .from("messages")
        .select("id, conversation_id, user_id, role, content, evidence_ids, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return (data ?? []).map((m) => ({
        id: m.id as string,
        conversationId: m.conversation_id as string,
        userId: m.user_id as string,
        role: m.role as "user" | "assistant",
        content: m.content as string,
        evidenceIds: (m.evidence_ids as string[] | null) ?? [],
        createdAt: m.created_at as string,
      }));
    },
    async insertMessage(m) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: m.conversationId,
          user_id: m.userId,
          role: m.role,
          content: m.content,
          evidence_ids: m.evidenceIds,
        })
        .select("id, created_at")
        .single();
      if (error) throw error;
      return {
        ...m,
        id: data.id as string,
        createdAt: data.created_at as string,
      };
    },
    async setSession(conversationId, sessionId) {
      await admin
        .from("conversations")
        .update({ lumen_session_id: sessionId })
        .eq("id", conversationId);
    },
    async countRecentQuestions(userId) {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", since);
      return count ?? 0;
    },
    getChat: getChatProvider,
  };
}
