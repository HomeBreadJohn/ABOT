import type { z } from "zod";

import {
  documentDetailResponseSchema,
  documentListItemSchema,
} from "@/contracts";

/** One row of GET /api/documents and `listDocuments(userId)`. */
export type DocumentListItem = z.infer<typeof documentListItemSchema>;

/** GET /api/documents/:id and `getDocument(userId, id)`. */
export type DocumentDetail = z.infer<typeof documentDetailResponseSchema>;
