import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
  type MatchKind,
  type MatchOutcome,
  type PipelineInternalComment,
  type PipelineInternalTodo,
  type PipelineTransactionStage,
  type WorkspaceMatchesPageResult,
  type WorkspacePipelineTransactionRow,
} from "./workspace-matches-page.types";

export type {
  MatchKind,
  MatchOutcome,
  PipelineInternalComment,
  PipelineInternalTodo,
  PipelineTransactionStage,
  WorkspacePipelineTransactionRow,
  WorkspaceMatchesPageResult,
};
export {
  WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT,
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
} from "./workspace-matches-page.types";

function parseTxnStage(raw: unknown): PipelineTransactionStage {
  return raw === "closed" ? "closed" : "active";
}

function parseOutcome(raw: unknown): MatchOutcome | null {
  return raw === "won" || raw === "lost" || raw === "passed" ? raw : null;
}

function parseKind(raw: unknown): MatchKind {
  return raw === "founder_lender" ? "founder_lender" : "founder_investor";
}

export function normalizeInternalComments(
  raw: unknown,
): PipelineInternalComment[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineInternalComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = o.id;
    const body = o.body;
    const created_at = o.created_at;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof body !== "string") continue;
    if (typeof created_at !== "string") continue;
    out.push({ id, body, created_at });
  }
  return out;
}

export function normalizeInternalTodos(raw: unknown): PipelineInternalTodo[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineInternalTodo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = o.id;
    const body = o.body;
    const done = o.done;
    const created_at = o.created_at;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof body !== "string") continue;
    if (typeof done !== "boolean") continue;
    if (typeof created_at !== "string") continue;
    out.push({ id, body, done, created_at });
  }
  return out;
}

type RawTxn = {
  id: string;
  match_id: string;
  title: string | null;
  stage: string | null;
  outcome: string | null;
  context: string | null;
  notes: string | null;
  internal_comments?: unknown;
  internal_todos?: unknown;
  match: {
    contact_a_id: string;
    contact_b_id: string;
    kind: string | null;
    contact_a: { name: string | null } | null;
    contact_b: { name: string | null } | null;
  } | null;
};

function shapeRow(raw: RawTxn): WorkspacePipelineTransactionRow | null {
  const m = raw.match;
  if (!m) return null;
  return {
    id: String(raw.id),
    match_id: String(raw.match_id),
    contact_a_id: String(m.contact_a_id),
    contact_b_id: String(m.contact_b_id),
    contact_a_name: m.contact_a?.name ?? "(unknown)",
    contact_b_name: m.contact_b?.name ?? "(unknown)",
    kind: parseKind(m.kind),
    stage: parseTxnStage(raw.stage),
    outcome: parseOutcome(raw.outcome),
    context: raw.context == null ? null : String(raw.context),
    notes: raw.notes == null ? null : String(raw.notes),
    title: raw.title == null ? null : String(raw.title),
    internal_comments: normalizeInternalComments(raw.internal_comments),
    internal_todos: normalizeInternalTodos(raw.internal_todos),
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
    "id,match_id,title,stage,outcome,context,notes,internal_comments,internal_todos," +
    "match:matches!inner(contact_a_id,contact_b_id,kind," +
    "contact_a:contacts!matches_contact_a_id_fkey(name)," +
    "contact_b:contacts!matches_contact_b_id_fkey(name))";

  let query = client
    .from("match_transactions")
    .select(select, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  const q = (params.search ?? "").trim();
  if (q.length > 0) {
    const escaped = q.replace(/[%_]/g, (ch) => `\\${ch}`);
    query = query.or(
      `title.ilike.%${escaped}%,context.ilike.%${escaped}%,notes.ilike.%${escaped}%,internal_comments::text.ilike.%${escaped}%,internal_todos::text.ilike.%${escaped}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? [])
    .map((r) => shapeRow(r as unknown as RawTxn))
    .filter((x): x is WorkspacePipelineTransactionRow => x != null);

  let filtered = rows;
  if (q.length > 0) {
    const needle = q.toLowerCase();
    filtered = rows.filter(
      (row) =>
        row.contact_a_name.toLowerCase().includes(needle) ||
        row.contact_b_name.toLowerCase().includes(needle) ||
        (row.title ?? "").toLowerCase().includes(needle) ||
        (row.context ?? "").toLowerCase().includes(needle) ||
        (row.notes ?? "").toLowerCase().includes(needle) ||
        row.internal_comments.some((c) =>
          c.body.toLowerCase().includes(needle),
        ) ||
        row.internal_todos.some((t) => t.body.toLowerCase().includes(needle)),
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
