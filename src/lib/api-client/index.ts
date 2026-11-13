/**
 * Typed browser-side API client for the app's own /api routes. One function per
 * endpoint; each uses a relative URL, sends same-origin cookies (the Supabase
 * session), validates the response against its contract schema, and throws
 * ApiClientError (carrying the contract's { code, message }) on a non-2xx.
 *
 * Reminders: there is no /api/reminders route — reminder CRUD is unavailable.
 * Reminder SUGGESTIONS arrive on the analysis READY response as
 * `reminderSuggestions` (see getAnalysis in ./analysis).
 */
export { ApiClientError, apiFetch, uploadToSignedUrl } from "@/lib/api-client/client";
export * from "@/lib/api-client/documents";
export * from "@/lib/api-client/analysis";
export * from "@/lib/api-client/corrections";
export * from "@/lib/api-client/conversations";
export * from "@/lib/api-client/cross-document";
