/** Postgres undefined_column / PostgREST “column does not exist”. */
export function isUndefinedColumnError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const rec = error as { code?: string; message?: string };
  const code = String(rec.code ?? "");
  const msg = String(rec.message ?? "");
  if (code === "42703") return true;
  if (/column .+ does not exist/i.test(msg)) return true;
  return false;
}

/**
 * Matches row is missing `introduction_at` / `introduction_notes` (migration not applied).
 */
export function isLegacyMatchesWithoutIntroColumnsError(error: unknown): boolean {
  if (isUndefinedColumnError(error)) return true;
  const blob = supabaseErrorSummary(error).toLowerCase();
  return (
    (blob.includes("introduction_at") || blob.includes("introduction_notes")) &&
    (blob.includes("does not exist") || blob.includes("42703"))
  );
}

/** Pipeline JSONB columns from `20260427160000_match_transactions_internal_workspace.sql` not applied. */
export function isMissingPipelineInternalWorkspaceColumnsError(
  error: unknown,
): boolean {
  if (!isUndefinedColumnError(error)) return false;
  const blob = supabaseErrorSummary(error).toLowerCase();
  return (
    blob.includes("internal_comments") ||
    blob.includes("internal_todos")
  );
}

export function isMissingMatchTransactionsError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const rec = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const blob = [rec.message, rec.details, rec.hint].filter(Boolean).join(" ");
  const code = String(rec.code ?? "");

  if (code === "PGRST205") return true;
  if (code === "42P01") return true;
  if (/match_transactions/i.test(blob) && /does not exist|could not find/i.test(blob))
    return true;
  return false;
}

/** Readable line for dev console (PostgREST errors often stringify as `{}`). */
export function supabaseErrorSummary(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error == null || typeof error !== "object") return String(error);
  const rec = error as {
    message?: string;
    code?: string;
    details?: string;
  };
  const parts = [
    rec.message,
    rec.code ? `(code ${rec.code})` : null,
    rec.details ? rec.details : null,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  return parts.length > 0 ? parts.join(" — ") : JSON.stringify(error);
}
