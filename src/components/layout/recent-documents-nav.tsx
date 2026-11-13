import Link from "next/link";
import { Suspense } from "react";
import { FileText } from "lucide-react";

import { getRecentDocuments } from "@/features/documents/recent-documents";

export interface RecentDocumentNavItem {
  readonly id: string;
  readonly title: string;
}

/** Presentational list. Safe to render without any data access. */
export function RecentDocumentsNav({
  documents = [],
  unavailable = false,
}: Readonly<{
  documents?: readonly RecentDocumentNavItem[];
  unavailable?: boolean;
}>) {
  return (
    <nav className="px-3 py-4" aria-label="Recent documents">
      <p className="text-ink-500 px-3 text-xs font-medium tracking-wider uppercase">
        Recent
      </p>
      {unavailable ? (
        <p className="text-ink-500 mt-2 px-3 text-sm">
          Recent documents unavailable
        </p>
      ) : documents.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                title={document.title}
                className="text-ink-600 hover:bg-ink-100 hover:text-ink-950 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors"
              >
                <FileText
                  className="h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{document.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href="/documents"
        className="text-brand-800 hover:bg-ink-100 mt-2 flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors"
      >
        View all documents
      </Link>
    </nav>
  );
}

async function LoadedRecentDocumentsNav() {
  const result = await getRecentDocuments();

  return result.status === "ok" ? (
    <RecentDocumentsNav documents={result.documents} />
  ) : (
    <RecentDocumentsNav unavailable />
  );
}

/**
 * Server Component. The request-time read sits behind Suspense, so the rest of
 * the shell does not wait for it. The fallback keeps the "View all" link.
 */
export function RecentDocumentsNavSection() {
  return (
    <Suspense fallback={<RecentDocumentsNav />}>
      <LoadedRecentDocumentsNav />
    </Suspense>
  );
}
