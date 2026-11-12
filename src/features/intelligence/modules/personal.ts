import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const personalModule: CategoryModule = {
  category: "PERSONAL",
  moduleIds: ["personal.purpose"],
  specializedSections: [
    {
      id: "important-dates",
      title: "Important dates",
      guidance: "Dates in the document the user may need to remember.",
    },
    {
      id: "relevant-information",
      title: "Relevant information",
      guidance: "Names, references, and details worth noting.",
    },
    {
      id: "document-purpose",
      title: "Document purpose",
      guidance: "What this document is for and why it matters to the user.",
    },
  ],
  promptGuidance:
    "This is a personal document. Explain its purpose, important dates, and relevant information in plain language.",
};
