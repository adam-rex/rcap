import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSearchPatternsFromQuery,
  fetchContactsByPatterns,
  fetchMatchesByPatterns,
  fetchOrganisationsByPatterns,
  fetchPendingSuggestionsByPatterns,
  fetchRecentContactsPreview,
  fetchRecentMatchesPreview,
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

function contactName(raw: unknown): string {
  if (raw && typeof raw === "object" && "name" in raw) {
    const n = (raw as { name?: unknown }).name;
    if (typeof n === "string" && n.length > 0) return n;
  }
  return "(unknown)";
}

function formatMatchLine(m: Record<string, unknown>): string {
  const a = contactName(m.contact_a);
  const b = contactName(m.contact_b);
  const bits = [
    m.stage ? String(m.stage) : null,
    m.kind ? String(m.kind) : null,
    m.outcome ? `outcome: ${String(m.outcome)}` : null,
    m.context ? String(m.context).slice(0, 120) : null,
  ].filter(Boolean);
  return bits.length
    ? `- **${a} ↔ ${b}** — ${bits.join(" · ")}`
    : `- **${a} ↔ ${b}**`;
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
      "Tell the user to enter a name, company, or keyword.",
    ].join("\n");
  }

  const patterns = buildSearchPatternsFromQuery(query);

  const [contactsInitial, orgs, matchesInitial, suggestions] = await Promise.all([
    fetchContactsByPatterns(supabase, patterns, PER_TABLE),
    fetchOrganisationsByPatterns(supabase, patterns, PER_TABLE),
    fetchMatchesByPatterns(supabase, patterns, PER_TABLE),
    fetchPendingSuggestionsByPatterns(supabase, patterns, PER_TABLE),
  ]);
  let contacts = contactsInitial;
  let matches = matchesInitial;

  let exploratoryNote = "";
  const allEmpty =
    contacts.length === 0 &&
    orgs.length === 0 &&
    matches.length === 0 &&
    suggestions.length === 0;

  if (allEmpty && looksLikeExploratoryWorkspaceQuery(query)) {
    const [recentC, recentM] = await Promise.all([
      fetchRecentContactsPreview(supabase, 8),
      fetchRecentMatchesPreview(supabase, 8),
    ]);
    if (recentC.length > 0 || recentM.length > 0) {
      contacts = recentC;
      matches = recentM;
      exploratoryNote = [
        "",
        "_Exploratory context: keyword scan returned no rows; showing a small **recent** sample of contacts and matches so you can reason about intros without inventing data._",
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

  lines.push(`### Matches (${matches.length})`);
  if (matches.length === 0) {
    lines.push("_None matched._");
  } else {
    for (const m of matches) {
      lines.push(formatMatchLine(m));
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
