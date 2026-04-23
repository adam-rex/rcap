import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchContactsByPattern,
  fetchMatchesByPattern,
  fetchOrganisationsByPattern,
  fetchPendingSuggestionsByPattern,
  safeIlikePattern,
} from "./workspace-query-helpers";

export type WorkspaceToolName =
  | "search_contacts"
  | "search_organisations"
  | "search_matches"
  | "search_suggestions";

export async function runWorkspaceTool(
  supabase: SupabaseClient,
  name: WorkspaceToolName,
  input: Record<string, unknown>,
): Promise<string> {
  const term = typeof input.search_term === "string" ? input.search_term : "";
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.floor(input.limit)
      : 12;

  const pattern = safeIlikePattern(term);
  if (!pattern) {
    return JSON.stringify({
      error: "search_term empty or invalid after sanitizing",
      rows: [],
    });
  }

  try {
    let rows: Record<string, unknown>[];
    switch (name) {
      case "search_contacts":
        rows = await fetchContactsByPattern(supabase, pattern, limit);
        break;
      case "search_organisations":
        rows = await fetchOrganisationsByPattern(supabase, pattern, limit);
        break;
      case "search_matches":
        rows = await fetchMatchesByPattern(supabase, pattern, limit);
        break;
      case "search_suggestions":
        rows = await fetchPendingSuggestionsByPattern(
          supabase,
          pattern,
          limit,
        );
        break;
      default:
        return JSON.stringify({ error: "unknown_tool", rows: [] });
    }
    return JSON.stringify({ rows, count: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "tool_failed";
    return JSON.stringify({ error: message, rows: [] });
  }
}
