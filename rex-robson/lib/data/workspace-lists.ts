import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import type { MatchKind, OpportunityStage } from "./workspace-matches-page.types";

const LIST_LIMIT = 80;

export type WorkspaceOrganisationRow = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
};

export type WorkspaceMatchRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  kind: MatchKind;
  stage: OpportunityStage;
  context: string | null;
};

export type WorkspaceSuggestionRow = {
  id: string;
  title: string | null;
  body: string | null;
  status: string;
  contact_a_id: string | null;
  contact_b_id: string | null;
  contact_a_name: string | null;
  contact_b_name: string | null;
  kind: MatchKind | null;
  score: number | null;
};

export type WorkspaceLists = {
  organisations: WorkspaceOrganisationRow[];
  matches: WorkspaceMatchRow[];
  suggestions: WorkspaceSuggestionRow[];
};

const empty: WorkspaceLists = {
  organisations: [],
  matches: [],
  suggestions: [],
};

function parseStage(raw: unknown): OpportunityStage {
  return raw === "closed" ? "closed" : "introduced";
}

function parseKind(raw: unknown): MatchKind | null {
  return raw === "founder_investor" || raw === "founder_lender" ? raw : null;
}

/**
 * Loads recent rows for sidebar surfaces. Uses service role when set (same as dashboard counts)
 * so lists work before auth; otherwise anon + RLS (typically empty until login).
 */
export async function getWorkspaceLists(): Promise<WorkspaceLists> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;

  if (process.env.NODE_ENV === "development" && !service) {
    console.warn(
      "[rex-robson] Supabase: no service role key — workspace lists use anon + RLS and will be empty without an authenticated session. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  try {
    const matchesSelect =
      "id,contact_a_id,contact_b_id,kind,stage,context," +
      "contact_a:contacts!matches_contact_a_id_fkey(name)," +
      "contact_b:contacts!matches_contact_b_id_fkey(name)";
    const suggestionsSelect =
      "id,title,body,status,contact_a_id,contact_b_id,kind,score," +
      "contact_a:contacts!suggestions_contact_a_id_fkey(name)," +
      "contact_b:contacts!suggestions_contact_b_id_fkey(name)";

    const [orgsRes, matchesRes, suggestionsRes] = await Promise.all([
      client
        .from("organisations")
        .select("id,name,type,description")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
      client
        .from("matches")
        .select(matchesSelect)
        .neq("stage", "closed")
        .order("updated_at", { ascending: false })
        .limit(LIST_LIMIT),
      client
        .from("suggestions")
        .select(suggestionsSelect)
        .in("status", ["pending", "dismissed"])
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
    ]);

    if (orgsRes.error) throw orgsRes.error;
    if (matchesRes.error) throw matchesRes.error;
    if (suggestionsRes.error) throw suggestionsRes.error;

    const matches: WorkspaceMatchRow[] = (matchesRes.data ?? []).map((raw) => {
      const r = raw as unknown as {
        id: string;
        contact_a_id: string;
        contact_b_id: string;
        kind: string | null;
        stage: string | null;
        context: string | null;
        contact_a: { name: string | null } | null;
        contact_b: { name: string | null } | null;
      };
      return {
        id: String(r.id),
        contact_a_id: String(r.contact_a_id),
        contact_b_id: String(r.contact_b_id),
        contact_a_name: r.contact_a?.name ?? "(unknown)",
        contact_b_name: r.contact_b?.name ?? "(unknown)",
        kind: parseKind(r.kind) ?? "founder_investor",
        stage: parseStage(r.stage),
        context: r.context == null ? null : String(r.context),
      };
    });

    const suggestions: WorkspaceSuggestionRow[] = (suggestionsRes.data ?? []).map(
      (raw) => {
        const r = raw as unknown as {
          id: string;
          title: string | null;
          body: string | null;
          status: string | null;
          contact_a_id: string | null;
          contact_b_id: string | null;
          kind: string | null;
          score: number | string | null;
          contact_a: { name: string | null } | null;
          contact_b: { name: string | null } | null;
        };
        const score =
          typeof r.score === "number"
            ? r.score
            : typeof r.score === "string"
              ? Number.parseFloat(r.score) || null
              : null;
        return {
          id: String(r.id),
          title: r.title == null ? null : String(r.title),
          body: r.body == null ? null : String(r.body),
          status: String(r.status ?? "pending"),
          contact_a_id:
            r.contact_a_id == null ? null : String(r.contact_a_id),
          contact_b_id:
            r.contact_b_id == null ? null : String(r.contact_b_id),
          contact_a_name: r.contact_a?.name ?? null,
          contact_b_name: r.contact_b?.name ?? null,
          kind: parseKind(r.kind),
          score,
        };
      },
    );

    return {
      organisations: (orgsRes.data ?? []) as WorkspaceOrganisationRow[],
      matches,
      suggestions,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] getWorkspaceLists failed:", err);
    }
    return empty;
  }
}
