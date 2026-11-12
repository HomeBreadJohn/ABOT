import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const financialModule: CategoryModule = {
  category: "FINANCIAL",
  moduleIds: ["financial.amounts", "financial.obligations"],
  specializedSections: [
    {
      id: "billing-breakdown",
      title: "Billing breakdown",
      guidance: "Each charge, line item, and the total amount.",
    },
    {
      id: "interest",
      title: "Interest",
      guidance: "Stated interest rate, how it is applied, and over what period.",
    },
    {
      id: "fees",
      title: "Fees",
      guidance: "Processing, late, penalty, and service fees and when they apply.",
    },
    {
      id: "repayment",
      title: "Repayment",
      guidance: "Payment amounts, schedule, due dates, and obligations.",
    },
  ],
  promptGuidance:
    "This is a financial document. Explain amounts, interest, fees, and repayment obligations. Quote exact figures; do not estimate numbers that are not stated.",
};
