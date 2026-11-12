import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const legalModule: CategoryModule = {
  category: "LEGAL",
  moduleIds: ["legal.clauses", "legal.obligations"],
  specializedSections: [
    {
      id: "clauses",
      title: "Clauses",
      guidance: "Key clauses and what each one commits the parties to.",
    },
    {
      id: "obligations",
      title: "Obligations",
      guidance: "What each party must do, by when, and under what conditions.",
    },
    {
      id: "conditions",
      title: "Conditions",
      guidance: "Conditions that trigger rights, penalties, or termination.",
    },
    {
      id: "consequences",
      title: "Potential consequences",
      guidance: "Stated outcomes of breach or non-compliance.",
    },
  ],
  promptGuidance:
    "This is a legal document. Explain clauses, obligations, conditions, and potential consequences in plain language. Separate what the document states from any inference.",
};
