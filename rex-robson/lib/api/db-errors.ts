/**
 * Supabase/PostgREST throws plain objects (not Error subclasses) carrying
 * .message / .details / .hint / .code. The natural `e instanceof Error` guard
 * swallows them and replaces them with a generic fallback, which makes "Query
 * failed" / "Insert failed" noise in the UI. This helper pulls out whatever
 * text is actually there so users see "column task_type does not exist" etc.
 */
export function extractDbErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const obj = e as { message?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (typeof obj.message === "string" && obj.message) parts.push(obj.message);
    if (typeof obj.details === "string" && obj.details) parts.push(obj.details);
    if (typeof obj.hint === "string" && obj.hint) parts.push(obj.hint);
    if (parts.length > 0) return parts.join(" — ");
  }
  return fallback;
}

export function looksLikeMissingColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("column") &&
    (m.includes("does not exist") || m.includes("could not find"))
  );
}
