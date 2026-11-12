import { PageHeader } from "@/components/shared/page-header";
import { DocumentList } from "@/features/documents/components/document-list";
import { VaultEmptyState } from "@/features/documents/components/vault-empty-state";
import { VaultToolbar } from "@/features/documents/components/vault-toolbar";
import { parseVaultQuery } from "@/features/documents/schemas/vault-query";
import {
  filterAndSortDocuments,
  toDocumentCardView,
} from "@/features/documents/view-models";

import { MOCK_DOCUMENTS, MOCK_TODAY } from "./mock-documents";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseVaultQuery(await searchParams);
  const context = { today: MOCK_TODAY, deadlineItems: [] as const };

  const matches = filterAndSortDocuments(MOCK_DOCUMENTS, query, context);
  const cards = matches.map((document) =>
    toDocumentCardView(document, context),
  );
  const hasSearchOrFilter =
    query.q !== "" || query.category !== "all" || query.status !== "all";

  return (
    <div className="mx-auto max-w-6xl min-w-0">
      <PageHeader
        eyebrow="Workspace"
        title="Documents"
        description="A private place for the documents you choose to organize and understand."
      />
      <div className="grid gap-4">
        <VaultToolbar query={query} />
        {cards.length > 0 ? (
          <DocumentList documents={cards} />
        ) : (
          <VaultEmptyState
            variant={hasSearchOrFilter ? "no-matches" : "no-documents"}
          />
        )}
      </div>
    </div>
  );
}
