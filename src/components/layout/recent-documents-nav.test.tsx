import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecentDocumentsNav } from "@/components/layout/recent-documents-nav";

describe("RecentDocumentsNav", () => {
  it("labels the nav and links each document by title", () => {
    const html = renderToStaticMarkup(
      <RecentDocumentsNav
        documents={[
          { id: "aaa", title: "Barangay clearance" },
          { id: "bbb", title: "Lease agreement" },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Recent documents"');
    expect(html).toContain('href="/documents/aaa"');
    expect(html).toContain('title="Barangay clearance"');
    expect(html).toContain("Barangay clearance");
    expect(html).toContain('href="/documents/bbb"');
    expect(html).toContain('href="/documents"');
  });

  it("shows quiet fallback text when recent documents are unavailable", () => {
    const html = renderToStaticMarkup(<RecentDocumentsNav unavailable />);

    expect(html).toContain("Recent documents unavailable");
    expect(html).not.toContain("<ul");
    expect(html).toContain('href="/documents"');
  });

  it("renders only the view-all link when there are no documents", () => {
    const html = renderToStaticMarkup(<RecentDocumentsNav documents={[]} />);

    expect(html).not.toContain("<ul");
    expect(html).not.toContain("unavailable");
    expect(html).toContain("View all documents");
  });
});
