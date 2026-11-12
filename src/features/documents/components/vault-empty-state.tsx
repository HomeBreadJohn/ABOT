import Link from "next/link";
import { FilePlus2, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type VaultEmptyStateVariant = "no-documents" | "no-matches";

function VaultEmptyState({ variant }: { variant: VaultEmptyStateVariant }) {
  if (variant === "no-matches") {
    return (
      <EmptyState
        title="No documents match your search."
        description="Try a different word or clear the filters."
        action={
          <Button asChild variant="secondary">
            <Link href="/documents">
              <SearchX aria-hidden="true" className="h-4 w-4" />
              Clear filters
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      title="Your documents will live here."
      description="Add your first one to get started."
      action={
        <Button asChild>
          <Link href="/documents/new">
            <FilePlus2 aria-hidden="true" className="h-4 w-4" />
            Add a document
          </Link>
        </Button>
      }
    />
  );
}

export { VaultEmptyState };
