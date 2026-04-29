import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import type { MatchKind, OpportunityStage } from "./workspace-matches-page.types";
import { WORKSPACE_MATCHES_PAGE_SIZE_MAX } from "./workspace-matches-page.types";
import {
  isLegacyMatchesWithoutIntroColumnsError,
  isMissingMatchTransactionsError,
} from "./supabase-error-guards";

export type WorkspaceOpportunityRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  contact_a_sector: string | null;
  contact_b_sector: string | null;
  contact_a_geography: string | null;
  contact_b_geography: string | null;
  kind: MatchKind;
  context: string | null;
  notes: string | null;
  suggestion_id: string | null;
  introduction_at: string | null;
  introduction_notes: string | null;
  transaction_count: number;
};

function parseKind(raw: unknown): MatchKind {
  return raw === "founder_lender" ? "founder_lender" : "founder_investor";
}

type RawOpp = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: string | null;
  context: string | null;
  notes: string | null;
  suggestion_id: string | null;
  introduction_at: string | null;
  introduction_notes: string | null;
  contact_a: { name: string | null; sector?: string | null; geography?: string | null } | null;
  contact_b: { name: string | null; sector?: string | null; geography?: string | null } | null;
};

const OPPORTUNITIES_SELECT_FULL =
  "id,contact_a_id,contact_b_id,kind,context,notes,suggestion_id,introduction_at,introduction_notes," +
  "contact_a:contacts!matches_contact_a_id_fkey(name,sector,geography)," +
  "contact_b:contacts!matches_contact_b_id_fkey(name,sector,geography)";

const OPPORTUNITIES_SELECT_LEGACY =
  "id,contact_a_id,contact_b_id,kind,context,notes,suggestion_id," +
  "contact_a:contacts!matches_contact_a_id_fkey(name,sector,geography)," +
  "contact_b:contacts!matches_contact_b_id_fkey(name,sector,geography)";

export async function fetchWorkspaceOpportunitiesWithClient(
  client: SupabaseClient,
): Promise<WorkspaceOpportunityRow[]> {
  let matches: unknown[] | null = null;
  let mErr: { message?: string; code?: string } | null = null;

  const resFull = await client
    .from("matches")
    .select(OPPORTUNITIES_SELECT_FULL)
    .eq("stage", "introduced")
    .order("updated_at", { ascending: false })
    .limit(200);
  matches = resFull.data as unknown[] | null;
  mErr = resFull.error;

  if (mErr && isLegacyMatchesWithoutIntroColumnsError(mErr)) {
    const resLeg = await client
      .from("matches")
      .select(OPPORTUNITIES_SELECT_LEGACY)
      .eq("stage", "introduced")
      .order("updated_at", { ascending: false })
      .limit(200);
    matches = resLeg.data as unknown[] | null;
    mErr = resLeg.error;
  }

  if (mErr) throw mErr;
  const list = (matches ?? []) as unknown as RawOpp[];
  if (list.length === 0) return [];

  const ids = list.map((m) => m.id);
  let txRows: { match_id: string }[] = [];
  const txRes = await client
    .from("match_transactions")
    .select("match_id")
    .in("match_id", ids);
  if (txRes.error) {
    if (isMissingMatchTransactionsError(txRes.error)) {
      txRows = [];
    } else {
      throw txRes.error;
    }
  } else {
    txRows = (txRes.data ?? []) as { match_id: string }[];
  }

  const counts = new Map<string, number>();
  for (const r of txRows) {
    const mid = String(r.match_id);
    counts.set(mid, (counts.get(mid) ?? 0) + 1);
  }

  return list.map((m) => ({
    id: String(m.id),
    contact_a_id: String(m.contact_a_id),
    contact_b_id: String(m.contact_b_id),
    contact_a_name: m.contact_a?.name ?? "(unknown)",
    contact_b_name: m.contact_b?.name ?? "(unknown)",
    contact_a_sector:
      m.contact_a?.sector == null || String(m.contact_a.sector).trim() === ""
        ? null
        : String(m.contact_a.sector).trim(),
    contact_b_sector:
      m.contact_b?.sector == null || String(m.contact_b.sector).trim() === ""
        ? null
        : String(m.contact_b.sector).trim(),
    contact_a_geography:
      m.contact_a?.geography == null ||
      String(m.contact_a.geography).trim() === ""
        ? null
        : String(m.contact_a.geography).trim(),
    contact_b_geography:
      m.contact_b?.geography == null ||
      String(m.contact_b.geography).trim() === ""
        ? null
        : String(m.contact_b.geography).trim(),
    kind: parseKind(m.kind),
    context: m.context == null ? null : String(m.context),
    notes: m.notes == null ? null : String(m.notes),
    suggestion_id:
      m.suggestion_id == null ? null : String(m.suggestion_id),
    introduction_at:
      m.introduction_at == null || m.introduction_at === undefined
        ? null
        : String(m.introduction_at),
    introduction_notes:
      m.introduction_notes == null || m.introduction_notes === undefined
        ? null
        : String(m.introduction_notes),
    transaction_count: counts.get(m.id) ?? 0,
  }));
}

export async function getWorkspaceOpportunities(): Promise<
  WorkspaceOpportunityRow[]
> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;
  return fetchWorkspaceOpportunitiesWithClient(client);
}

export type WorkspaceMatchPickerRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  kind: MatchKind;
  stage: OpportunityStage;
};

type RawPicker = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: string | null;
  stage: string | null;
  context: string | null;
  contact_a: { name: string | null } | null;
  contact_b: { name: string | null } | null;
};

function parseOppStage(raw: unknown): OpportunityStage {
  return raw === "closed" ? "closed" : "introduced";
}

/**
 * Paginated contact pairs (matches) for task pickers and legacy list endpoints —
 * not pipeline transactions.
 */
export async function fetchWorkspaceMatchPairsPageWithClient(
  client: SupabaseClient,
  params: { search: string | null; page: number; pageSize: number },
): Promise<{ rows: WorkspaceMatchPickerRow[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_MATCHES_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const select =
    "id,contact_a_id,contact_b_id,kind,stage,context," +
    "contact_a:contacts!matches_contact_a_id_fkey(name)," +
    "contact_b:contacts!matches_contact_b_id_fkey(name)";

  let query = client
    .from("matches")
    .select(select, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  const q = (params.search ?? "").trim();
  if (q.length > 0) {
    const escaped = q.replace(/[%_]/g, (ch) => `\\${ch}`);
    query = query.or(`context.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  let rows: WorkspaceMatchPickerRow[] = (data ?? []).map((raw) => {
    const r = raw as unknown as RawPicker;
    const kd =
      r.kind === "founder_lender" ? "founder_lender" : "founder_investor";
    return {
      id: String(r.id),
      contact_a_id: String(r.contact_a_id),
      contact_b_id: String(r.contact_b_id),
      contact_a_name: r.contact_a?.name ?? "(unknown)",
      contact_b_name: r.contact_b?.name ?? "(unknown)",
      kind: kd,
      stage: parseOppStage(r.stage),
    };
  });

  if (q.length > 0) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.contact_a_name.toLowerCase().includes(needle) ||
        row.contact_b_name.toLowerCase().includes(needle),
    );
  }

  return { rows, total: count ?? rows.length };
}

export async function getWorkspaceMatchPairsPage(params: {
  search: string | null;
  page: number;
  pageSize: number;
}): Promise<{ rows: WorkspaceMatchPickerRow[]; total: number }> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;
  return fetchWorkspaceMatchPairsPageWithClient(client, params);
}
