import type { SupabaseClient } from "@supabase/supabase-js";

/** Strip LIKE wildcards; cap length. Returns null if nothing left to search. */
export function safeIlikePattern(raw: string): string | null {
  const t = raw
    .trim()
    .slice(0, 200)
    .replace(/%/g, "")
    .replace(/_/g, "")
    .trim();
  if (!t) return null;
  return `%${t}%`;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "be",
  "this",
  "that",
  "what",
  "which",
  "who",
  "me",
  "my",
  "we",
  "you",
  "your",
  "can",
  "could",
  "should",
  "would",
  "there",
  "their",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "not",
  "no",
  "yes",
  "so",
  "if",
  "how",
  "when",
  "where",
  "why",
  "about",
  "into",
  "just",
  "also",
  "only",
  "even",
  "some",
  "all",
  "each",
  "get",
  "got",
  "out",
  "up",
  "down",
  "give",
  "tell",
  "run",
  "let",
  "way",
  "may",
  "than",
  "then",
  "too",
  "very",
  "will",
  "been",
  "it",
  "its",
  "our",
  "them",
  "they",
  "he",
  "she",
  "her",
  "his",
]);

/**
 * Tokens for multi-pattern ILIKE baseline (skip stopwords, short tokens).
 */
export function extractQueryTokens(raw: string): string[] {
  const parts = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of parts) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

const MAX_BASELINE_PATTERNS = 6;

/**
 * Full-string pattern plus distinct token patterns (cap total).
 */
export function buildSearchPatternsFromQuery(query: string): string[] {
  const patterns: string[] = [];
  const full = safeIlikePattern(query);
  if (full) patterns.push(full);
  for (const token of extractQueryTokens(query)) {
    const p = safeIlikePattern(token);
    if (!p || patterns.includes(p)) continue;
    patterns.push(p);
    if (patterns.length >= MAX_BASELINE_PATTERNS) break;
  }
  return patterns;
}

/** Heuristic: open-ended workspace questions where a literal full-string scan often returns nothing. */
export function looksLikeExploratoryWorkspaceQuery(query: string): boolean {
  const s = query.toLowerCase();
  return /match|suggest|intro|founder|investor|pair|recommend|network|opportunit|who\s+should|deal(s)?\s+to\s+match|any\s+deal|connections?|introduce/.test(
    s,
  );
}

function uniqueById<T extends { id: string }>(rows: (T | null | undefined)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function take<T>(rows: T[], n: number): T[] {
  return rows.slice(0, n);
}

export async function fetchContactsByPattern(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const { data, error } = await supabase.rpc("match_workspace_contacts_ilike", {
    p_pattern: pattern,
    p_limit: cap,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function fetchContactsByPatterns(
  supabase: SupabaseClient,
  patterns: string[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const slice = patterns.slice(0, MAX_BASELINE_PATTERNS);
  if (slice.length === 0) return [];
  const batches = await Promise.all(
    slice.map((p) => fetchContactsByPattern(supabase, p, cap)),
  );
  return take(uniqueById(batches.flat() as { id: string }[]), cap) as Record<
    string,
    unknown
  >[];
}

export async function fetchOrganisationsByPatterns(
  supabase: SupabaseClient,
  patterns: string[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const slice = patterns.slice(0, MAX_BASELINE_PATTERNS);
  if (slice.length === 0) return [];
  const batches = await Promise.all(
    slice.map((p) => fetchOrganisationsByPattern(supabase, p, cap)),
  );
  return take(uniqueById(batches.flat() as { id: string }[]), cap) as Record<
    string,
    unknown
  >[];
}

export async function fetchDealsByPatterns(
  supabase: SupabaseClient,
  patterns: string[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const slice = patterns.slice(0, MAX_BASELINE_PATTERNS);
  if (slice.length === 0) return [];
  const batches = await Promise.all(
    slice.map((p) => fetchDealsByPattern(supabase, p, cap)),
  );
  return take(uniqueById(batches.flat() as { id: string }[]), cap) as Record<
    string,
    unknown
  >[];
}

export async function fetchPendingSuggestionsByPatterns(
  supabase: SupabaseClient,
  patterns: string[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const slice = patterns.slice(0, MAX_BASELINE_PATTERNS);
  if (slice.length === 0) return [];
  const batches = await Promise.all(
    slice.map((p) => fetchPendingSuggestionsByPattern(supabase, p, cap)),
  );
  return take(uniqueById(batches.flat() as { id: string }[]), cap) as Record<
    string,
    unknown
  >[];
}

export async function fetchOrganisationsByPattern(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const [on, od, ot] = await Promise.all([
    supabase
      .from("organisations")
      .select("id,name,type,description")
      .ilike("name", pattern)
      .limit(cap),
    supabase
      .from("organisations")
      .select("id,name,type,description")
      .ilike("description", pattern)
      .limit(cap),
    supabase
      .from("organisations")
      .select("id,name,type,description")
      .ilike("type", pattern)
      .limit(cap),
  ]);
  return take(
    uniqueById([...(on.data ?? []), ...(od.data ?? []), ...(ot.data ?? [])]),
    cap,
  ) as Record<string, unknown>[];
}

export async function fetchDealsByPattern(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const [dt, dn, ds, dst, ddt] = await Promise.all([
    supabase
      .from("deals")
      .select("id,title,size,deal_type,sector,structure,status,notes")
      .ilike("title", pattern)
      .limit(cap),
    supabase
      .from("deals")
      .select("id,title,size,deal_type,sector,structure,status,notes")
      .ilike("notes", pattern)
      .limit(cap),
    supabase
      .from("deals")
      .select("id,title,size,deal_type,sector,structure,status,notes")
      .ilike("sector", pattern)
      .limit(cap),
    supabase
      .from("deals")
      .select("id,title,size,deal_type,sector,structure,status,notes")
      .ilike("structure", pattern)
      .limit(cap),
    supabase
      .from("deals")
      .select("id,title,size,deal_type,sector,structure,status,notes")
      .ilike("deal_type", pattern)
      .limit(cap),
  ]);
  return take(
    uniqueById([
      ...(dt.data ?? []),
      ...(dn.data ?? []),
      ...(ds.data ?? []),
      ...(dst.data ?? []),
      ...(ddt.data ?? []),
    ]),
    cap,
  ) as Record<string, unknown>[];
}

export async function fetchPendingSuggestionsByPattern(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const [st, sb] = await Promise.all([
    supabase
      .from("suggestions")
      .select("id,title,body,status")
      .eq("status", "pending")
      .ilike("title", pattern)
      .limit(cap),
    supabase
      .from("suggestions")
      .select("id,title,body,status")
      .eq("status", "pending")
      .ilike("body", pattern)
      .limit(cap),
  ]);
  return take(
    uniqueById([...(st.data ?? []), ...(sb.data ?? [])]),
    cap,
  ) as Record<string, unknown>[];
}

export async function fetchRecentContactsPreview(
  supabase: SupabaseClient,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id,name,role,notes,organisation_id,geography,contact_type,sector,sectors,deal_types,phone,email",
    )
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function fetchRecentDealsPreview(
  supabase: SupabaseClient,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cap = Math.min(Math.max(1, limit), 25);
  const { data, error } = await supabase
    .from("deals")
    .select("id,title,size,deal_type,sector,structure,status,notes")
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}
