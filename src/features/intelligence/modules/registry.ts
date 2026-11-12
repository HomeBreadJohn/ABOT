import type { DocumentCategory } from "@/contracts/common";
import { governmentModule } from "@/features/intelligence/modules/government";
import { financialModule } from "@/features/intelligence/modules/financial";
import { employmentModule } from "@/features/intelligence/modules/employment";
import { legalModule } from "@/features/intelligence/modules/legal";
import { medicalModule } from "@/features/intelligence/modules/medical";
import { educationModule } from "@/features/intelligence/modules/education";
import { utilitiesModule } from "@/features/intelligence/modules/utilities";
import { personalModule } from "@/features/intelligence/modules/personal";
import { otherModule } from "@/features/intelligence/modules/other";

/** A specialized report section selected by document category (product.md 4.2). */
export type SpecializedSection = { id: string; title: string; guidance: string };

/** Static analysis configuration for one document category. */
export type CategoryModule = {
  category: DocumentCategory;
  moduleIds: string[];
  specializedSections: SpecializedSection[];
  promptGuidance: string;
};

const MODULES: Record<DocumentCategory, CategoryModule> = {
  GOVERNMENT: governmentModule,
  FINANCIAL: financialModule,
  EMPLOYMENT: employmentModule,
  LEGAL: legalModule,
  MEDICAL: medicalModule,
  EDUCATION: educationModule,
  UTILITIES: utilitiesModule,
  PERSONAL: personalModule,
  OTHER: otherModule,
};

export function getModule(category: DocumentCategory): CategoryModule {
  return MODULES[category];
}

/** True when the two categories' moduleIds sets differ (ignoring order/duplicates). */
export function modulesDiffer(a: DocumentCategory, b: DocumentCategory): boolean {
  const setA = new Set(getModule(a).moduleIds);
  const setB = new Set(getModule(b).moduleIds);
  if (setA.size !== setB.size) return true;
  for (const id of setA) if (!setB.has(id)) return true;
  return false;
}
