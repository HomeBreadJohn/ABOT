import type { DocumentCategory } from "@/contracts";

export type CategoryIcon =
  | "landmark"
  | "wallet"
  | "briefcase-business"
  | "scale"
  | "stethoscope"
  | "graduation-cap"
  | "lightbulb"
  | "user-round"
  | "file"
  | "file-question";

export type CategoryFilterValue =
  "all" | "unsorted" | Lowercase<DocumentCategory>;

export interface CategoryView {
  readonly category: DocumentCategory | null;
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly value: CategoryFilterValue;
}

export const CATEGORY_VIEWS = {
  GOVERNMENT: {
    label: "Government",
    icon: "landmark",
    value: "government",
  },
  FINANCIAL: {
    label: "Financial",
    icon: "wallet",
    value: "financial",
  },
  EMPLOYMENT: {
    label: "Employment",
    icon: "briefcase-business",
    value: "employment",
  },
  LEGAL: {
    label: "Legal",
    icon: "scale",
    value: "legal",
  },
  MEDICAL: {
    label: "Medical",
    icon: "stethoscope",
    value: "medical",
  },
  EDUCATION: {
    label: "Education",
    icon: "graduation-cap",
    value: "education",
  },
  UTILITIES: {
    label: "Utilities",
    icon: "lightbulb",
    value: "utilities",
  },
  PERSONAL: {
    label: "Personal",
    icon: "user-round",
    value: "personal",
  },
  OTHER: {
    label: "Other",
    icon: "file",
    value: "other",
  },
} as const satisfies Record<DocumentCategory, Omit<CategoryView, "category">>;

const UNSORTED_CATEGORY: Omit<CategoryView, "category"> = {
  label: "Not yet sorted",
  icon: "file-question",
  value: "unsorted",
};

export function presentCategory(
  category: DocumentCategory | null,
): CategoryView {
  if (category === null) {
    return { category, ...UNSORTED_CATEGORY };
  }

  return { category, ...CATEGORY_VIEWS[category] };
}
