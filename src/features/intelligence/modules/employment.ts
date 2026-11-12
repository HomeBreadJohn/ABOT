import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const employmentModule: CategoryModule = {
  category: "EMPLOYMENT",
  moduleIds: ["employment.compensation", "employment.terms"],
  specializedSections: [
    {
      id: "compensation",
      title: "Compensation",
      guidance: "Salary, wage, allowances, and how and when they are paid.",
    },
    {
      id: "benefits",
      title: "Benefits",
      guidance: "Leave, insurance, bonuses, and other entitlements.",
    },
    {
      id: "working-conditions",
      title: "Working conditions",
      guidance: "Hours, place of work, responsibilities, and duties.",
    },
    {
      id: "termination",
      title: "Termination",
      guidance: "Notice periods, grounds for ending the contract, and final pay.",
    },
  ],
  promptGuidance:
    "This is an employment document. Explain compensation, benefits, working conditions, and termination terms. Flag obligations and consequences that bind the employee.",
};
