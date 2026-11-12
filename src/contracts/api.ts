/**
 * Application API contracts: shared error format plus one request and response
 * schema per endpoint (product.md section 14). Area files are re-exported
 * here; provider types are not part of the public surface.
 */
export * from "@/contracts/api-error";
export * from "@/contracts/api-documents";
export * from "@/contracts/api-corrections";
export * from "@/contracts/api-conversations";
export * from "@/contracts/api-cross-document";
export * from "@/contracts/api-reminders";
