import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const governmentModule: CategoryModule = {
  category: "GOVERNMENT",
  moduleIds: ["government.eligibility", "government.application"],
  specializedSections: [
    {
      id: "eligibility",
      title: "Eligibility",
      guidance:
        "Who qualifies, the conditions that must be met, and who is excluded.",
    },
    {
      id: "requirements",
      title: "Requirements",
      guidance:
        "Documents, fees, and supporting materials the applicant must provide.",
    },
    {
      id: "application",
      title: "Application instructions",
      guidance:
        "Where and how to apply, the steps in order, and any deadlines.",
    },
    {
      id: "validity",
      title: "Validity",
      guidance: "How long the document or benefit stays valid and renewal terms.",
    },
  ],
  promptGuidance:
    "This is a government document. Explain eligibility, requirements, application steps, and validity in plain language. Do not tell the user they qualify unless the document states the criteria they meet.",
};
