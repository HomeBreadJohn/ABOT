import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const otherModule: CategoryModule = {
  category: "OTHER",
  moduleIds: ["other.general"],
  specializedSections: [
    {
      id: "document-purpose",
      title: "Document purpose",
      guidance: "What this document appears to be and why it may matter.",
    },
  ],
  promptGuidance:
    "This document does not fit a known category. Explain what it appears to be and its key information, using only the shared report sections.",
};
