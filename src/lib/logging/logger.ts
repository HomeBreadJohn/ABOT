/**
 * Structured logging with an explicit key allowlist. Document text, OCR words,
 * AI messages, and secrets must never reach the logs (product.md section 17).
 */
const ALLOWED_KEYS = new Set([
  "documentId",
  "jobId",
  "jobType",
  "status",
  "durationMs",
  "errorCode",
  "requestId",
  "credits",
]);

type Fields = Record<string, unknown>;

function sanitize(fields?: Fields): Fields | undefined {
  if (!fields) return undefined;
  const sanitized: Fields = {};
  for (const key of Object.keys(fields)) {
    if (ALLOWED_KEYS.has(key)) sanitized[key] = fields[key];
  }
  return sanitized;
}

function write(level: "info" | "warn" | "error", message: string, fields?: Fields) {
  const allowed = sanitize(fields);
  console[level](message, allowed);
}

export const logger = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
