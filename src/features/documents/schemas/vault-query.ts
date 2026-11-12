import { z } from "zod";
import type { DocumentCategory } from "@/contracts";

export const VAULT_SORTS = [
  "newest",
  "oldest",
  "next_date",
  "title",
  "attention",
] as const;

export const VAULT_STATUS_FILTERS = [
  "all",
  "attention",
  "in_progress",
  "ready",
] as const;

const LOWERCASE_CATEGORIES = [
  "government",
  "financial",
  "employment",
  "legal",
  "medical",
  "education",
  "utilities",
  "personal",
  "other",
] as const;

export const CATEGORY_FILTERS = [
  "all",
  "unsorted",
  ...LOWERCASE_CATEGORIES,
] as const;

export const vaultQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  category: z.enum(CATEGORY_FILTERS).catch("all"),
  status: z.enum(VAULT_STATUS_FILTERS).catch("all"),
  sort: z.enum(VAULT_SORTS).catch("newest"),
});

export type VaultQuery = z.infer<typeof vaultQuerySchema>;
export type VaultSort = (typeof VAULT_SORTS)[number];
export type VaultStatusFilter = (typeof VAULT_STATUS_FILTERS)[number];
export type CategoryFilterValue = (typeof CATEGORY_FILTERS)[number];

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Parses URL search params defensively, including repeated and invalid values. */
export function parseVaultQuery(
  params: Record<string, string | string[] | undefined>,
): VaultQuery {
  try {
    return vaultQuerySchema.parse({
      q: firstParam(params, "q"),
      category: firstParam(params, "category"),
      status: firstParam(params, "status"),
      sort: firstParam(params, "sort"),
    });
  } catch {
    return vaultQuerySchema.parse({});
  }
}

/** Creates the canonical query string; default values stay out of the URL. */
export function serializeVaultQuery(query: VaultQuery): string {
  const params = new URLSearchParams();
  const normalized = vaultQuerySchema.parse(query);

  if (normalized.q) {
    params.set("q", normalized.q);
  }
  if (normalized.category !== "all") {
    params.set("category", normalized.category);
  }
  if (normalized.status !== "all") {
    params.set("status", normalized.status);
  }
  if (normalized.sort !== "newest") {
    params.set("sort", normalized.sort);
  }

  return params.toString();
}

export const CATEGORY_LABELS: Readonly<
  Record<Exclude<CategoryFilterValue, "all" | "unsorted">, string>
> = {
  government: "Government",
  financial: "Financial",
  employment: "Employment",
  legal: "Legal",
  medical: "Medical",
  education: "Education",
  utilities: "Utilities",
  personal: "Personal",
  other: "Other",
};

export function categoryFilterValue(
  category: DocumentCategory | null,
): CategoryFilterValue {
  return category === null ? "unsorted" : category.toLowerCase() as CategoryFilterValue;
}
