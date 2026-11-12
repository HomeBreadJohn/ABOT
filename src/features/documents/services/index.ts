import "server-only";

import { cache } from "react";

import { getDocumentsEnv } from "@/lib/env/documents";

import { type DocumentsService } from "./documents-service";
import { createMockDocumentsService } from "./mock-documents-service";
import { createSupabaseDocumentsService } from "./supabase-documents-service";

/**
 * Resolves one service per server render. Environment flags are read only in
 * the server-only environment module, and React cache() preserves one
 * selection for all callers in the same render.
 */
export const getDocumentsService = cache((): DocumentsService => {
  const env = getDocumentsEnv();

  if (env.dataSource === "supabase") {
    return createSupabaseDocumentsService({ profile: env.schemaProfile });
  }

  return createMockDocumentsService({ today: env.mockToday });
});

export * from "./documents-service";
