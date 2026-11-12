import type { DocumentCardView } from "@/features/documents/view-models";

import { DocumentRow } from "./document-row";

function DocumentList({
  documents,
  skippedCount = 0,
}: {
  documents: readonly DocumentCardView[];
  skippedCount?: number;
}) {
  return (
    <>
      {skippedCount > 0 ? (
        <p className="text-body-sm text-ink-muted mb-3" role="note">
          Some documents couldn&apos;t be shown right now.
        </p>
      ) : null}
      <ul aria-label="Your documents" className="grid gap-3">
        {documents.map((document) => (
          <DocumentRow key={document.id} view={document} />
        ))}
      </ul>
    </>
  );
}

export { DocumentList };
