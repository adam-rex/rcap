import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSearchPatternsFromQuery,
  fetchContactsByPatterns,
  fetchDealsByPatterns,
  fetchOrganisationsByPatterns,
  fetchPendingSuggestionsByPatterns,
  fetchRecentContactsPreview,
  fetchRecentDealsPreview,
  looksLikeExploratoryWorkspaceQuery,
  safeIlikePattern,
} from "./workspace-query-helpers";

const PER_TABLE = 10;

function formatContactLine(c: Record<string, unknown>): string {
  const name = c.name ? String(c.name) : "(unknown)";
  const meta = [
    c.contact_type ? String(c.contact_type) : null,
    c.sector ? String(c.sector) : null,
    c.geography ? String(c.geography) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return meta ? `- **${name}** — ${meta}` : `- **${name}**`;
}

/**
 * Full deterministic scan (same ILIKE strategy as tool handlers), formatted for reconciliation.
 * Uses multi-token patterns plus optional recent-row preview for exploratory questions.
 */
export async function buildWorkspaceRetrievalContext(
  supabase: SupabaseClient,
  query: string,
): Promise<string> {
  if (!safeIlikePattern(query)) {
    return [
      "## Deterministic workspace retrieval",
      "",
      "No searchable text after sanitizing the query (empty or only wildcards).",
      "Tell the user to enter a name, company, deal title, or keyword.",
    ].join("\n");
  }

  const patterns = buildSearchPatternsFromQuery(query);

  let [contacts, orgs, deals, suggestions] = await Promise.all([
    fetchContactsByPatterns(supabase, patterns, PER_TABLE),
    fetchOrganisationsByPatterns(supabase, patterns, PER_TABLE),
    fetchDealsByPatterns(supabase, patterns, PER_TABLE),
    fetchPendingSuggestionsByPatterns(supabase, patterns, PER_TABLE),
  ]);

  let exploratoryNote = "";
  const allEmpty =
    contacts.length === 0 &&
    orgs.length === 0 &&
    deals.length === 0 &&
    suggestions.length === 0;

  if (allEmpty && looksLikeExploratoryWorkspaceQuery(query)) {
    const [recentC, recentD] = await Promise.all([
      fetchRecentContactsPreview(supabase, 8),
      fetchRecentDealsPreview(supabase, 8),
    ]);
    if (recentC.length > 0 || recentD.length > 0) {
      contacts = recentC;
      deals = recentD;
      exploratoryNote = [
        "",
        "_Exploratory context: keyword scan returned no rows; showing a small **recent** sample of contacts and deals so you can reason about matches and intros without inventing data._",
        "",
      ].join("\n");
    }
  }

  const lines: string[] = [
    "## Deterministic workspace retrieval",
    "",
    "Baseline uses the user’s query as one or more ILIKE patterns (full string plus meaningful tokens). Use this as a factual anchor; tool calls may use different terms.",
    exploratoryNote,
  ];

  lines.push(`### Contacts (${contacts.length})`);
  if (contacts.length === 0) {
    lines.push("_None matched._");
  } else {
    for (const c of contacts) {
      lines.push(formatContactLine(c));
    }
  }
  lines.push("");

  lines.push(`### Organisations (${orgs.length})`);
  if (orgs.length === 0) {
    lines.push("_None matched._");
  } else {
    for (const o of orgs) {
      const bits = [
        o.type ? String(o.type) : null,
        o.description ? String(o.description).slice(0, 120) : null,
      ].filter(Boolean);
      const name = o.name ? String(o.name) : "(unknown)";
      lines.push(bits.length ? `- **${name}** — ${bits.join(" · ")}` : `- **${name}**`);
    }
  }
  lines.push("");

  lines.push(`### Deals (${deals.length})`);
  if (deals.length === 0) {
    lines.push("_None matched._");
  } else {
    for (const d of deals) {
      const bits = [
        d.status ? String(d.status) : null,
        d.sector ? String(d.sector) : null,
        d.structure ? String(d.structure) : null,
        d.size != null ? `£${d.size}` : null,
      ].filter(Boolean);
      const title = d.title ? String(d.title) : "(untitled deal)";
      lines.push(bits.length ? `- **${title}** — ${bits.join(" · ")}` : `- **${title}**`);
    }
  }
  lines.push("");

  lines.push(`### Pending suggestions (${suggestions.length})`);
  if (suggestions.length === 0) {
    lines.push("_None matched._");
  } else {
    for (const s of suggestions) {
      const bits = [
        s.body ? String(s.body).slice(0, 160) : null,
      ].filter(Boolean);
      const title = s.title ? String(s.title) : "(untitled suggestion)";
      lines.push(bits.length ? `- **${title}** — ${bits.join(" · ")}` : `- **${title}**`);
    }
  }

  return lines.join("\n");
}
