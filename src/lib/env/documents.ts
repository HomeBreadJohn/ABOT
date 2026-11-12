import "server-only";

import type {
  DocumentsDataSource,
  DocumentsSchemaProfile,
} from "@/features/documents/services/documents-service";

export const DEFAULT_DOCUMENTS_DATA_SOURCE: DocumentsDataSource = "mock";
export const DEFAULT_DOCUMENTS_SCHEMA_PROFILE: DocumentsSchemaProfile =
  "initial";
export const DEFAULT_DOCUMENTS_MOCK_TODAY = "2026-11-15";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Resolves the server-selected documents data source. */
export function resolveDocumentsDataSource(
  raw: string | undefined,
): DocumentsDataSource {
  return raw?.trim().toLowerCase() === "supabase" ? "supabase" : "mock";
}

/** Resolves the server-selected database schema profile. */
export function resolveSchemaProfile(
  raw: string | undefined,
): DocumentsSchemaProfile {
  return raw?.trim().toLowerCase() === "lifecycle" ? "lifecycle" : "initial";
}

/** Resolves the fixed calendar date used by the mock document data source. */
export function resolveMockToday(raw: string | undefined): string {
  const value = raw?.trim();
  return value && isIsoDate(value) ? value : DEFAULT_DOCUMENTS_MOCK_TODAY;
}

export interface DocumentsEnv {
  readonly dataSource: DocumentsDataSource;
  readonly schemaProfile: DocumentsSchemaProfile;
  readonly mockToday: string;
}

/** Reads document flags only on the server. */
export function getDocumentsEnv(): DocumentsEnv {
  return {
    dataSource: resolveDocumentsDataSource(process.env.DOCUMENTS_DATA_SOURCE),
    schemaProfile: resolveSchemaProfile(process.env.DOCUMENTS_SCHEMA_PROFILE),
    mockToday: resolveMockToday(process.env.DOCUMENTS_MOCK_TODAY),
  };
}
