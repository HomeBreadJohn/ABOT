import "server-only";
import { cache } from "react";
import { z } from "zod";

import { reminderSchema } from "@/contracts";
import { getDocumentsEnv } from "@/lib/env/documents";
import { getDocumentsService } from "@/features/documents/services";
import type {
  DocumentSummaryForView,
  DocumentCardView,
  DeadlineItem,
  IsoDate,
} from "@/features/documents/view-models";
import {
  buildDeadlineItems,
  toManilaDate,
} from "@/features/documents/view-models";
import { toDocumentCardView } from "@/features/documents/view-models/document-card";
import {
  buildAttentionItems,
  type AttentionItem,
} from "@/features/dashboard/view-models/attention";

export interface DashboardSnapshot {
  readonly source: "mock" | "supabase";
  readonly today: IsoDate;
  readonly totalDocuments: number;
  readonly attention: {
    readonly items: readonly AttentionItem[];
    readonly total: number;
  };
  readonly dates: {
    readonly items: readonly DeadlineItem[];
    readonly total: number;
    readonly remindersAvailable: boolean;
  };
  readonly recentlyAnalyzed: readonly DocumentCardView[];
  readonly allDocuments: {
    readonly items: readonly DocumentCardView[];
    readonly total: number;
  };
}

type Reminder = z.infer<typeof reminderSchema>;

function compareNewest(
  left: DocumentCardView,
  right: DocumentCardView,
): number {
  const leftTime = Date.parse(left.uploadedAt.iso);
  const rightTime = Date.parse(right.uploadedAt.iso);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) return rightTime - leftTime;
  } else if (left.uploadedAt.iso !== right.uploadedAt.iso) {
    return right.uploadedAt.iso.localeCompare(left.uploadedAt.iso, "en");
  }

  return left.id.localeCompare(right.id, "en");
}

function compareCompletedAt(
  left: { readonly card: DocumentCardView; readonly completedAt: string },
  right: { readonly card: DocumentCardView; readonly completedAt: string },
): number {
  const leftTime = Date.parse(left.completedAt);
  const rightTime = Date.parse(right.completedAt);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) return rightTime - leftTime;
  } else if (left.completedAt !== right.completedAt) {
    return right.completedAt.localeCompare(left.completedAt, "en");
  }

  return left.card.id.localeCompare(right.card.id, "en");
}

function mapReminderForDashboard(reminder: Reminder) {
  return {
    id: reminder.id,
    documentId: reminder.documentId,
    title: reminder.title,
    dueAt: reminder.dueAt,
    // The shared reminder contract calls an outstanding reminder ACTIVE. The
    // deadline view model uses PENDING for the same dashboard state.
    status: reminder.status === "ACTIVE" ? "PENDING" : reminder.status,
  } as const;
}

function getToday(
  source: DashboardSnapshot["source"],
  mockToday: string,
): IsoDate {
  // This runs after the request-time service reads have resolved. Current time
  // is therefore never evaluated while Cache Components builds the shell.
  return source === "mock" ? mockToday : toManilaDate(new Date());
}

function buildDocumentCards(
  documents: readonly DocumentSummaryForView[],
  today: IsoDate,
  deadlineItems: readonly DeadlineItem[],
): DocumentCardView[] {
  return documents
    .map((document) => toDocumentCardView(document, { today, deadlineItems }))
    .sort(compareNewest);
}

function buildRecentlyAnalyzed(
  documents: readonly DocumentSummaryForView[],
  today: IsoDate,
  deadlineItems: readonly DeadlineItem[],
): DocumentCardView[] {
  const completedCards = documents.flatMap((document) => {
    const analysis = document.latestAnalysis;
    const completedAt =
      analysis?.status === "COMPLETED" ? analysis.completedAt : null;

    if (!completedAt) return [];

    return [
      {
        card: toDocumentCardView(document, { today, deadlineItems }),
        completedAt,
      },
    ];
  });

  return completedCards
    .sort(compareCompletedAt)
    .slice(0, 4)
    .map(({ card }) => card);
}

/**
 * Loads the request-scoped dashboard inputs once and derives only safe view
 * models. Report payloads and analysis text never cross this boundary.
 */
export const getDashboardSnapshot = cache(
  async (): Promise<DashboardSnapshot> => {
    const env = getDocumentsEnv();
    const service = getDocumentsService();
    const [documentsResult, signals, reminders] = await Promise.all([
      service.listDocuments(),
      service.listDeadlineSignals(),
      service.listReminders(),
    ]);
    const { documents } = documentsResult;

    const today = getToday(service.source, env.mockToday);
    const documentInputs = documents as readonly DocumentSummaryForView[];
    const deadlineItems = buildDeadlineItems({
      documents: documentInputs,
      signals,
      reminders: reminders
        .filter((reminder) => reminder.status === "ACTIVE")
        .map(mapReminderForDashboard),
      today,
    });
    const allCards = buildDocumentCards(documentInputs, today, deadlineItems);
    const attentionItems = buildAttentionItems(
      documentInputs,
      deadlineItems,
      today,
    );

    return {
      source: service.source,
      today,
      totalDocuments: documents.length,
      attention: {
        items: attentionItems,
        total: attentionItems.length,
      },
      dates: {
        items: deadlineItems,
        total: deadlineItems.length,
        remindersAvailable: service.capabilities.reminders,
      },
      recentlyAnalyzed: buildRecentlyAnalyzed(
        documentInputs,
        today,
        deadlineItems,
      ),
      allDocuments: {
        items: allCards.slice(0, 5),
        total: allCards.length,
      },
    };
  },
);
