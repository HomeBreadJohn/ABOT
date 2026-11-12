import type { CategoryModule } from "@/features/intelligence/modules/registry";

export const utilitiesModule: CategoryModule = {
  category: "UTILITIES",
  moduleIds: ["utilities.billing", "utilities.consumption"],
  specializedSections: [
    {
      id: "billing-breakdown",
      title: "Billing breakdown",
      guidance: "Each charge, line item, taxes, and the total amount due.",
    },
    {
      id: "consumption",
      title: "Consumption",
      guidance: "Usage for the period and how it compares to prior periods.",
    },
    {
      id: "due-dates",
      title: "Due dates",
      guidance: "Payment due date and any grace period.",
    },
    {
      id: "penalties",
      title: "Penalties",
      guidance: "Late fees, surcharges, and disconnection terms.",
    },
  ],
  promptGuidance:
    "This is a utility bill. Explain the billing breakdown, consumption, due dates, and penalties. Quote exact amounts and dates; do not estimate.",
};
