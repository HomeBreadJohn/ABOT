import { FileText, Upload } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Documents"
        description="A private place for the documents you choose to organize and understand."
      />
      <Card>
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
            <FileText className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-ink-950">
            No documents yet
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-500">
            Document upload and processing will be introduced in a later product
            phase. This page intentionally contains no fabricated document data.
          </p>
          <Button className="mt-6" disabled>
            <Upload className="h-4 w-4" aria-hidden="true" /> Upload coming soon
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
