import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
  type MatchKind,
  type MatchOutcome,
  type MatchStage,
  type WorkspaceMatchPageRow,
  type WorkspaceMatchesPageResult,
} from "./workspace-matches-page.types";

export type {
  MatchKind,
  MatchOutcome,
  MatchStage,
  WorkspaceMatchPageRow,
  WorkspaceMatchesPageResult,
};
export {
  WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT,
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
} from "./workspace-matches-page.types";

function parseStage(raw: unknown): MatchStage {
  return raw === "active" || raw === "closed" ? raw : "introduced";
}

function parseOutcome(raw: unknown): MatchOutcome | null {
  return raw === "won" || raw === "lost" || raw === "passed" ? raw : null;
}

function parseKind(raw: unknown): MatchKind {
  return raw === "founder_lender" ? "founder_lender" : "founder_investor";
}

type RawMatch = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: string | null;
  stage: string | null;
  outcome: string | null;
  context: string | null;
  notes: string | null;
  contact_a: { id: string; name: string | null } | null;
  contact_b: { id: string; name: string | null } | null;
};

function shapeRow(raw: RawMatch): WorkspaceMatchPageRow {
  return {
    id: String(raw.id),
    contact_a_id: String(raw.contact_a_id),
    contact_b_id: String(raw.contact_b_id),
    contact_a_name: raw.contact_a?.name ?? "(unknown)",
    contact_b_name: raw.contact_b?.name ?? "(unknown)",
    kind: parseKind(raw.kind),
    stage: parseStage(raw.stage),
    outcome: parseOutcome(raw.outcome),
    context: raw.context == null ? null : String(raw.context),
    notes: raw.notes == null ? null : String(raw.notes),
  };
}

export async function fetchWorkspaceMatchesPageWithClient(
  client: SupabaseClient,
  params: { search: string | null; page: number; pageSize: number },
): Promise<WorkspaceMatchesPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_MATCHES_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const select =
    "id,contact_a_id,contact_b_id,kind,stage,outcome,context,notes," +
    "contact_a:contacts!matches_contact_a_id_fkey(id,name)," +
    "contact_b:contacts!matches_contact_b_id_fkey(id,name)";

  let query = client
    .from("matches")
    .select(select, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  const q = (params.search ?? "").trim();
  if (q.length > 0) {
    // Search across context + notes; client-side filtering on contact names is layered on top
    // by the UI when needed. (Postgres OR with FK joins via embedded resources is fiddly.)
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(
      `context.ilike.%${escaped}%,notes.ilike.%${escaped}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((r) => shapeRow(r as unknown as RawMatch));

  // If a search was provided, also keep rows whose contact names match (client-side filter
  // since we couldn't OR across embedded resources cleanly).
  let filtered = rows;
  if (q.length > 0) {
    const needle = q.toLowerCase();
    filtered = rows.filter(
      (row) =>
        row.contact_a_name.toLowerCase().includes(needle) ||
        row.contact_b_name.toLowerCase().includes(needle) ||
        (row.context ?? "").toLowerCase().includes(needle) ||
        (row.notes ?? "").toLowerCase().includes(needle),
    );
  }

  return { rows: filtered, total: count ?? rows.length };
}

export async function getWorkspaceMatchesPage(params: {
  search: string | null;
  page: number;
  pageSize: number;
}): Promise<WorkspaceMatchesPageResult> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;
  return fetchWorkspaceMatchesPageWithClient(client, params);
}
