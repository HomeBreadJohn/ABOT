import "server-only";

import { cache } from "react";

import { getDocumentsEnv } from "@/lib/env/documents";
import {
  INITIAL_SCHEMA_UPLOAD_POLICY,
  LIFECYCLE_UPLOAD_POLICY,
} from "@/features/documents/upload/upload-policy";

import {
  type DocumentsService,
  DocumentsServiceError,
  type DocumentsServiceCapabilities,
  type UploadPolicy,
} from "./documents-service";

/**
 * The concrete mock and Supabase services are added by later tasks. Keeping a
 * deferred implementation here lets the boundary and source-selection rules
 * be consumed without introducing service behavior into task 3.1.
 */
function createDeferredService(
  source: DocumentsService["source"],
  capabilities: DocumentsServiceCapabilities,
  uploadPolicy: UploadPolicy,
): DocumentsService {
  const notReady = (): never => {
    throw new DocumentsServiceError("NOT_READY", true);
  };

  return {
    source,
    capabilities,
    getUploadPolicy: () => uploadPolicy,
    listDocuments: async () => notReady(),
    getDocument: async () => notReady(),
    listDeadlineSignals: async () => notReady(),
    listReminders: async () => notReady(),
    prepareUpload: async () => notReady(),
    finalizeUpload: async () => notReady(),
    discardUpload: async () => notReady(),
  };
}

/**
 * Resolves one service per server render. Environment flags are read only in
 * the server-only environment module, and React cache() preserves one
 * selection for all callers in the same render.
 */
export const getDocumentsService = cache((): DocumentsService => {
  const env = getDocumentsEnv();
  const isLifecycle = env.schemaProfile === "lifecycle";

  if (env.dataSource === "supabase") {
    return createDeferredService(
      "supabase",
      {
        reminders: isLifecycle,
        deadlineCertainty: isLifecycle,
      },
      isLifecycle ? LIFECYCLE_UPLOAD_POLICY : INITIAL_SCHEMA_UPLOAD_POLICY,
    );
  }

  return createDeferredService(
    "mock",
    { reminders: true, deadlineCertainty: true },
    LIFECYCLE_UPLOAD_POLICY,
  );
});

export * from "./documents-service";
