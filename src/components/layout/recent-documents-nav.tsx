import Link from "next/link";
import { FileText } from "lucide-react";

export interface RecentDocumentNavItem {
  readonly id: string;
  readonly title: string;
  readonly statusLabel?: string;
}

export function RecentDocumentsNav({
  documents = [],
}: Readonly<{
  documents?: readonly RecentDocumentNavItem[];
}>) {
  return (
    <nav className="sidebar-recent min-h-0 flex-1 px-3 py-4" aria-label="Recent documents">
      <p className="sidebar-section-label px-3 text-caption font-medium tracking-wider text-ink-subtle uppercase">
        Recent
      </p>
      {documents.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                title={document.title}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm text-ink-muted transition-colors duration-150 ease-standard hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
              >
                <FileText className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="sidebar-label min-w-0 truncate">{document.title}</span>
                {document.statusLabel ? (
                  <span className="sidebar-label sr-only">Status: {document.statusLabel}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href="/documents"
        className="mt-2 flex min-h-11 items-center rounded-md px-3 text-body-sm font-medium text-accent-ink transition-colors duration-150 ease-standard hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
      >
        <span className="sidebar-label">View all documents</span>
        <span className="sidebar-collapsed-glyph hidden text-lg" aria-hidden="true">
          +
        </span>
      </Link>
    </nav>
  );
}
