import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  fetchWorkspaceTaskByIdWithClient,
  mapTaskRow,
} from "@/lib/data/workspace-tasks";
import type {
  WorkspaceTaskOutputFormat,
  WorkspaceTaskRow,
  WorkspaceTaskStatus,
  WorkspaceTaskType,
} from "@/lib/data/workspace-tasks.types";
import {
  isLegacyMatchesWithoutIntroColumnsError,
  isMissingPipelineInternalWorkspaceColumnsError,
} from "./supabase-error-guards";
import {
  normalizeInternalComments,
  normalizeInternalTodos,
} from "./workspace-matches-page";
import type {
  PipelineInternalComment,
  PipelineInternalTodo,
} from "./workspace-matches-page.types";

export async function getWorkspaceWriteClient(): Promise<SupabaseClient> {
  return tryCreateServiceRoleClient() ?? (await createServerSupabaseClient());
}

export type CreatedOrganisationRow = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
};

export async function insertWorkspaceOrganisation(
  client: SupabaseClient,
  input: { name: string; type: string | null; description: string | null },
): Promise<CreatedOrganisationRow> {
  const { data, error } = await client
    .from("organisations")
    .insert({
      name: input.name,
      type: input.type,
      description: input.description,
    })
    .select("id,name,type,description")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    type: data.type == null ? null : String(data.type),
    description: data.description == null ? null : String(data.description),
  };
}

export type CreatedContactRow = {
  id: string;
  name: string;
  contact_type: string | null;
  sector: string | null;
  role: string | null;
  geography: string | null;
  phone: string | null;
  email: string | null;
  organisation_id: string | null;
  internal_owner: string | null;
};

export async function insertWorkspaceContact(
  client: SupabaseClient,
  input: {
    name: string;
    contact_type: string;
    sector: string;
    organisation_id: string | null;
    role: string | null;
    geography: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    internal_owner: string | null;
  },
): Promise<CreatedContactRow> {
  const { data, error } = await client
    .from("contacts")
    .insert({
      name: input.name,
      contact_type: input.contact_type,
      sector: input.sector,
      organisation_id: input.organisation_id,
      role: input.role,
      geography: input.geography,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      internal_owner: input.internal_owner,
    })
    .select(
      "id,name,contact_type,sector,role,geography,phone,email,organisation_id,internal_owner",
    )
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    contact_type: data.contact_type == null ? null : String(data.contact_type),
    sector: data.sector == null ? null : String(data.sector),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    phone: data.phone == null ? null : String(data.phone),
    email: data.email == null ? null : String(data.email),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
    internal_owner:
      data.internal_owner == null ? null : String(data.internal_owner),
  };
}

export async function updateWorkspaceOrganisation(
  client: SupabaseClient,
  id: string,
  input: { name: string; type: string | null; description: string | null },
): Promise<CreatedOrganisationRow | null> {
  const { data, error } = await client
    .from("organisations")
    .update({
      name: input.name,
      type: input.type,
      description: input.description,
    })
    .eq("id", id)
    .select("id,name,type,description")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    type: data.type == null ? null : String(data.type),
    description: data.description == null ? null : String(data.description),
  };
}

export type WorkspaceContactDetail = {
  id: string;
  name: string;
  contact_type: string | null;
  sector: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_type: string | null;
  role: string | null;
  geography: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  internal_owner: string | null;
  last_contact_date: string | null;
};

function mapContactDetailFromRow(
  data: Record<string, unknown>,
  lastContactDate: string | null,
  organisationName: string | null,
  organisationType: string | null,
): WorkspaceContactDetail {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    contact_type:
      data.contact_type == null ? null : String(data.contact_type),
    sector: data.sector == null ? null : String(data.sector),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
    organisation_name: organisationName,
    organisation_type: organisationType,
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    phone: data.phone == null ? null : String(data.phone),
    email: data.email == null ? null : String(data.email),
    notes: data.notes == null ? null : String(data.notes),
    internal_owner:
      data.internal_owner == null ? null : String(data.internal_owner),
    last_contact_date: lastContactDate,
  };
}

export async function fetchWorkspaceContactById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceContactDetail | null> {
  const fullSelect =
    "id,name,contact_type,sector,organisation_id,role,geography,phone,email,notes,internal_owner,last_contact_date";
  const fallbackSelect =
    "id,name,contact_type,sector,organisation_id,role,geography,phone,email,notes,internal_owner";

  let data: Record<string, unknown> | null = null;

  {
    const res = await client.from("contacts").select(fullSelect).eq("id", id).maybeSingle();
    if (res.error) {
      const code = (res.error as { code?: string }).code;
      if (code === "42703" || code === "PGRST204") {
        const retry = await client
          .from("contacts")
          .select(fallbackSelect)
          .eq("id", id)
          .maybeSingle();
        if (retry.error) throw retry.error;
        data = retry.data as Record<string, unknown> | null;
        if (data == null) return null;
        const orgId =
          data.organisation_id == null ? null : String(data.organisation_id);
        let organisation_name: string | null = null;
        let organisation_type: string | null = null;
        if (orgId) {
          const orgRes = await client
            .from("organisations")
            .select("name,type")
            .eq("id", orgId)
            .maybeSingle();
          if (!orgRes.error && orgRes.data) {
            organisation_name =
              orgRes.data.name == null ? null : String(orgRes.data.name);
            organisation_type =
              orgRes.data.type == null ? null : String(orgRes.data.type);
          }
        }
        return mapContactDetailFromRow(data, null, organisation_name, organisation_type);
      }
      throw res.error;
    }
    data = res.data as Record<string, unknown> | null;
  }

  if (data == null) return null;

  const lastRaw = data.last_contact_date;
  const lastContactDate =
    lastRaw == null || lastRaw === "" ? null : String(lastRaw);

  let organisation_name: string | null = null;
  let organisation_type: string | null = null;
  const orgId =
    data.organisation_id == null ? null : String(data.organisation_id);
  if (orgId) {
    const orgRes = await client
      .from("organisations")
      .select("name,type")
      .eq("id", orgId)
      .maybeSingle();
    if (!orgRes.error && orgRes.data) {
      organisation_name =
        orgRes.data.name == null ? null : String(orgRes.data.name);
      organisation_type =
        orgRes.data.type == null ? null : String(orgRes.data.type);
    }
  }

  return mapContactDetailFromRow(
    data,
    lastContactDate,
    organisation_name,
    organisation_type,
  );
}

export type WorkspaceContactCommentRow = {
  id: string;
  body: string;
  created_at: string;
};

export async function listWorkspaceContactComments(
  client: SupabaseClient,
  contactId: string,
): Promise<WorkspaceContactCommentRow[]> {
  const { data, error } = await client
    .from("contact_comments")
    .select("id,body,created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: String((r as { id: unknown }).id ?? ""),
    body: String((r as { body: unknown }).body ?? ""),
    created_at: String((r as { created_at: unknown }).created_at ?? ""),
  }));
}

export async function insertWorkspaceContactComment(
  client: SupabaseClient,
  contactId: string,
  body: string,
): Promise<WorkspaceContactCommentRow> {
  const { data, error } = await client
    .from("contact_comments")
    .insert({ contact_id: contactId, body })
    .select("id,body,created_at")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return {
    id: String(data.id),
    body: String(data.body ?? ""),
    created_at: String(data.created_at ?? ""),
  };
}

export async function deleteWorkspaceContact(
  client: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("contacts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data != null;
}

export async function updateWorkspaceContact(
  client: SupabaseClient,
  id: string,
  input: {
    name: string;
    contact_type: string;
    sector: string;
    organisation_id: string | null;
    role: string | null;
    geography: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    internal_owner: string | null;
  },
): Promise<CreatedContactRow | null> {
  const { data, error } = await client
    .from("contacts")
    .update({
      name: input.name,
      contact_type: input.contact_type,
      sector: input.sector,
      organisation_id: input.organisation_id,
      role: input.role,
      geography: input.geography,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      internal_owner: input.internal_owner,
    })
    .eq("id", id)
    .select(
      "id,name,contact_type,sector,role,geography,phone,email,organisation_id,internal_owner",
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    contact_type: data.contact_type == null ? null : String(data.contact_type),
    sector: data.sector == null ? null : String(data.sector),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    phone: data.phone == null ? null : String(data.phone),
    email: data.email == null ? null : String(data.email),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
    internal_owner:
      data.internal_owner == null ? null : String(data.internal_owner),
  };
}

// ---------------------------------------------------------------------------
// Matches (opportunities — one open row per pair; stage introduced | closed)
// ---------------------------------------------------------------------------

export type MatchKind = "founder_investor" | "founder_lender";
/** Lifecycle on the opportunity (pair), not individual deals. */
export type OpportunityStage = "introduced" | "closed";
export type MatchOutcome = "won" | "lost" | "passed";
/** Stage on a pipeline transaction row. */
export type PipelineTransactionStage = "active" | "closed";

/** Legacy / history rows may still reference `active` on matches. */
export type MatchHistoryStage = OpportunityStage | "active";

export type CreatedMatchRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: MatchKind;
  stage: OpportunityStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
  suggestion_id: string | null;
  introduction_at: string | null;
  introduction_notes: string | null;
};

export type MatchStageHistoryRow = {
  id: number;
  match_id: string;
  from_stage: MatchHistoryStage | null;
  to_stage: MatchHistoryStage;
  changed_by: string | null;
  changed_at: string;
};

function parseOpportunityStage(raw: unknown): OpportunityStage {
  return raw === "closed" ? "closed" : "introduced";
}

function parseHistoryStage(raw: unknown): MatchHistoryStage {
  return raw === "active" || raw === "closed" ? raw : "introduced";
}

function parseKind(raw: unknown): MatchKind {
  return raw === "founder_lender" ? "founder_lender" : "founder_investor";
}

function parseOutcome(raw: unknown): MatchOutcome | null {
  return raw === "won" || raw === "lost" || raw === "passed" ? raw : null;
}

function shapeMatchRow(data: Record<string, unknown>): CreatedMatchRow {
  return {
    id: String(data.id),
    contact_a_id: String(data.contact_a_id),
    contact_b_id: String(data.contact_b_id),
    kind: parseKind(data.kind),
    stage: parseOpportunityStage(data.stage),
    outcome: parseOutcome(data.outcome),
    context: data.context == null ? null : String(data.context),
    notes: data.notes == null ? null : String(data.notes),
    suggestion_id:
      data.suggestion_id == null ? null : String(data.suggestion_id),
    introduction_at:
      data.introduction_at == null ? null : String(data.introduction_at),
    introduction_notes:
      data.introduction_notes == null
        ? null
        : String(data.introduction_notes),
  };
}

const MATCH_SELECT =
  "id,contact_a_id,contact_b_id,kind,stage,outcome,context,notes,suggestion_id,introduction_at,introduction_notes";

const MATCH_SELECT_LEGACY =
  "id,contact_a_id,contact_b_id,kind,stage,outcome,context,notes,suggestion_id";

export async function insertWorkspaceMatch(
  client: SupabaseClient,
  input: {
    contact_a_id: string;
    contact_b_id: string;
    kind: MatchKind;
    stage?: OpportunityStage;
    outcome?: MatchOutcome | null;
    context: string | null;
    notes: string | null;
    suggestion_id?: string | null;
    introduction_at?: string | null;
    introduction_notes?: string | null;
  },
): Promise<CreatedMatchRow> {
  const stage = input.stage ?? "introduced";
  const outcome = stage === "closed" ? input.outcome ?? null : null;

  const insertWithIntro = {
    contact_a_id: input.contact_a_id,
    contact_b_id: input.contact_b_id,
    kind: input.kind,
    stage,
    outcome,
    context: input.context,
    notes: input.notes,
    suggestion_id: input.suggestion_id ?? null,
    introduction_at: input.introduction_at ?? null,
    introduction_notes: input.introduction_notes ?? null,
  };

  const insertLegacy = {
    contact_a_id: input.contact_a_id,
    contact_b_id: input.contact_b_id,
    kind: input.kind,
    stage,
    outcome,
    context: input.context,
    notes: input.notes,
    suggestion_id: input.suggestion_id ?? null,
  };

  async function doInsert(
    payload: typeof insertWithIntro | typeof insertLegacy,
    select: string,
  ): Promise<CreatedMatchRow> {
    const { data, error } = await client
      .from("matches")
      .insert(payload)
      .select(select)
      .single();
    if (error) throw error;
    if (!data) throw new Error("Insert returned no row");
    return shapeMatchRow(data as unknown as Record<string, unknown>);
  }

  try {
    return await doInsert(insertWithIntro, MATCH_SELECT);
  } catch (e) {
    if (isLegacyMatchesWithoutIntroColumnsError(e)) {
      return await doInsert(insertLegacy, MATCH_SELECT_LEGACY);
    }
    throw e;
  }
}

export type WorkspaceMatchDetail = CreatedMatchRow;

export async function fetchWorkspaceMatchById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceMatchDetail | null> {
  const first = await client
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (first.error && isLegacyMatchesWithoutIntroColumnsError(first.error)) {
    const legacy = await client
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle();
    if (legacy.error) throw legacy.error;
    if (!legacy.data) return null;
    return shapeMatchRow(legacy.data as Record<string, unknown>);
  }
  if (first.error) throw first.error;
  if (!first.data) return null;
  return shapeMatchRow(first.data as Record<string, unknown>);
}

export async function updateWorkspaceMatch(
  client: SupabaseClient,
  id: string,
  input: {
    kind: MatchKind;
    stage: OpportunityStage;
    outcome: MatchOutcome | null;
    context: string | null;
    notes: string | null;
  },
): Promise<CreatedMatchRow | null> {
  const outcome = input.stage === "closed" ? input.outcome : null;
  const { data, error } = await client
    .from("matches")
    .update({
      kind: input.kind,
      stage: input.stage,
      outcome,
      context: input.context,
      notes: input.notes,
    })
    .eq("id", id)
    .select(MATCH_SELECT)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return shapeMatchRow(data as Record<string, unknown>);
}

export async function insertMatchStageHistory(
  client: SupabaseClient,
  input: {
    match_id: string;
    from_stage: MatchHistoryStage | null;
    to_stage: MatchHistoryStage;
    changed_by?: string | null;
  },
): Promise<void> {
  const { error } = await client.from("match_stage_history").insert({
    match_id: input.match_id,
    from_stage: input.from_stage,
    to_stage: input.to_stage,
    changed_by: input.changed_by ?? null,
  });
  if (error) throw error;
}

export async function moveWorkspaceMatchStage(
  client: SupabaseClient,
  input: {
    id: string;
    toStage: OpportunityStage;
    outcome?: MatchOutcome | null;
    changedBy?: string | null;
  },
): Promise<CreatedMatchRow | null> {
  const current = await fetchWorkspaceMatchById(client, input.id);
  if (!current) return null;

  const targetOutcome =
    input.toStage === "closed" ? input.outcome ?? current.outcome : null;
  const stageUnchanged = current.stage === input.toStage;
  const outcomeUnchanged = current.outcome === targetOutcome;

  if (stageUnchanged && outcomeUnchanged) return current;

  const updated = await updateWorkspaceMatch(client, input.id, {
    kind: current.kind,
    stage: input.toStage,
    outcome: targetOutcome,
    context: current.context,
    notes: current.notes,
  });
  if (!updated) return null;

  if (!stageUnchanged) {
    await insertMatchStageHistory(client, {
      match_id: input.id,
      from_stage: current.stage,
      to_stage: input.toStage,
      changed_by: input.changedBy ?? null,
    });
  }
  return updated;
}

export async function listMatchStageHistory(
  client: SupabaseClient,
  matchId: string,
): Promise<MatchStageHistoryRow[]> {
  const { data, error } = await client
    .from("match_stage_history")
    .select("id,match_id,from_stage,to_stage,changed_by,changed_at")
    .eq("match_id", matchId)
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    match_id: String(row.match_id),
    from_stage:
      row.from_stage == null ? null : parseHistoryStage(row.from_stage),
    to_stage: parseHistoryStage(row.to_stage),
    changed_by: row.changed_by == null ? null : String(row.changed_by),
    changed_at: String(row.changed_at ?? ""),
  }));
}

/** ISO date (YYYY-MM-DD) from an inbound email timestamp for last_contact_date. */
function isoDateFromReceivedAt(receivedAt: string): string {
  const d = new Date(receivedAt);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export async function touchWorkspaceContactLastContactDate(
  client: SupabaseClient,
  contactId: string,
  receivedAtIso: string,
): Promise<boolean> {
  const dateStr = isoDateFromReceivedAt(receivedAtIso);
  const { data, error } = await client
    .from("contacts")
    .update({ last_contact_date: dateStr })
    .eq("id", contactId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data != null;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type CreatedSuggestionRow = {
  id: string;
  title: string | null;
  body: string | null;
  contact_a_id: string | null;
  contact_b_id: string | null;
  kind: MatchKind | null;
  score: number | null;
};

export type WorkspaceSuggestionDetail = CreatedSuggestionRow & {
  status: SuggestionStatus;
};

const SUGGESTION_SELECT =
  "id,title,body,status,contact_a_id,contact_b_id,kind,score";

function parseSuggestionKind(raw: unknown): MatchKind | null {
  return raw === "founder_investor" || raw === "founder_lender" ? raw : null;
}

function parseSuggestionScore(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function insertWorkspaceSuggestion(
  client: SupabaseClient,
  input: {
    title: string | null;
    body: string | null;
    contact_a_id?: string | null;
    contact_b_id?: string | null;
    kind?: MatchKind | null;
    score?: number | null;
  },
): Promise<CreatedSuggestionRow | null> {
  const { data, error } = await client
    .from("suggestions")
    .insert({
      title: input.title,
      body: input.body,
      status: "pending",
      contact_a_id: input.contact_a_id ?? null,
      contact_b_id: input.contact_b_id ?? null,
      kind: input.kind ?? null,
      score: input.score ?? null,
    })
    .select(SUGGESTION_SELECT)
    .maybeSingle();

  if (error) {
    // Unique-violation on the per-pair partial index = duplicate pending suggestion.
    // Treat as a no-op so callers can lean on the DB for dedupe.
    const code = (error as { code?: string }).code;
    if (code === "23505") return null;
    throw error;
  }
  if (!data) return null;

  return {
    id: String(data.id),
    title: data.title == null ? null : String(data.title),
    body: data.body == null ? null : String(data.body),
    contact_a_id:
      data.contact_a_id == null ? null : String(data.contact_a_id),
    contact_b_id:
      data.contact_b_id == null ? null : String(data.contact_b_id),
    kind: parseSuggestionKind(data.kind),
    score: parseSuggestionScore(data.score),
  };
}

export async function fetchWorkspaceSuggestionById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceSuggestionDetail | null> {
  const { data, error } = await client
    .from("suggestions")
    .select(SUGGESTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const status = (data.status as SuggestionStatus) ?? "pending";
  return {
    id: String(data.id),
    title: data.title == null ? null : String(data.title),
    body: data.body == null ? null : String(data.body),
    contact_a_id:
      data.contact_a_id == null ? null : String(data.contact_a_id),
    contact_b_id:
      data.contact_b_id == null ? null : String(data.contact_b_id),
    kind: parseSuggestionKind(data.kind),
    score: parseSuggestionScore(data.score),
    status,
  };
}

export type SuggestionStatus = "pending" | "dismissed" | "acted";

export async function updateWorkspaceSuggestionStatus(
  client: SupabaseClient,
  id: string,
  status: SuggestionStatus,
): Promise<void> {
  const { error } = await client
    .from("suggestions")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Mark profile suggestion as done: create an opportunity (match) at `introduced`
 * and record introduction time. Pipeline deals are separate `match_transactions` rows.
 */
export async function acceptSuggestionAsMatch(
  client: SupabaseClient,
  id: string,
): Promise<
  | { ok: true; match: CreatedMatchRow; suggestion: WorkspaceSuggestionDetail }
  | { ok: false; reason: "not_found" | "already_handled" | "missing_pair" }
> {
  const suggestion = await fetchWorkspaceSuggestionById(client, id);
  if (!suggestion) return { ok: false, reason: "not_found" };
  if (suggestion.status !== "pending") {
    return { ok: false, reason: "already_handled" };
  }
  if (
    !suggestion.contact_a_id ||
    !suggestion.contact_b_id ||
    !suggestion.kind
  ) {
    return { ok: false, reason: "missing_pair" };
  }

  const introIso = new Date().toISOString();
  const match = await insertWorkspaceMatch(client, {
    contact_a_id: suggestion.contact_a_id,
    contact_b_id: suggestion.contact_b_id,
    kind: suggestion.kind,
    stage: "introduced",
    context: suggestion.body,
    notes: null,
    suggestion_id: suggestion.id,
    introduction_at: introIso,
    introduction_notes: null,
  });
  await insertMatchStageHistory(client, {
    match_id: match.id,
    from_stage: null,
    to_stage: "introduced",
  });
  await updateWorkspaceSuggestionStatus(client, id, "acted");

  return { ok: true, match, suggestion };
}

export async function updateWorkspaceMatchIntroduction(
  client: SupabaseClient,
  matchId: string,
  input: { introduction_at: string | null; introduction_notes: string | null },
): Promise<CreatedMatchRow | null> {
  const { data, error } = await client
    .from("matches")
    .update({
      introduction_at: input.introduction_at,
      introduction_notes: input.introduction_notes,
    })
    .eq("id", matchId)
    .select(MATCH_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return shapeMatchRow(data as Record<string, unknown>);
}

export async function countMatchTransactions(
  client: SupabaseClient,
  matchId: string,
): Promise<number> {
  const { count, error } = await client
    .from("match_transactions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Revert an introduction: delete the opportunity row (cascades pipeline deals
 * and Rex tasks scoped to the match). Linked suggestion becomes dismissed so
 * it appears under Suggestions → Archived.
 */
export async function undoMatchIntroduction(
  client: SupabaseClient,
  matchId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "not_introduced";
    }
> {
  const match = await fetchWorkspaceMatchById(client, matchId);
  if (!match) return { ok: false, reason: "not_found" };
  if (match.stage !== "introduced") {
    return { ok: false, reason: "not_introduced" };
  }

  const { error: delErr } = await client.from("matches").delete().eq("id", matchId);
  if (delErr) throw delErr;
  if (match.suggestion_id) {
    await updateWorkspaceSuggestionStatus(client, match.suggestion_id, "dismissed");
  }
  return { ok: true };
}

export type CreatedMatchTransactionRow = {
  id: string;
  match_id: string;
  title: string | null;
  stage: PipelineTransactionStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
  internal_comments: PipelineInternalComment[];
  internal_todos: PipelineInternalTodo[];
};

const TX_SELECT_FULL =
  "id,match_id,title,stage,outcome,context,notes,internal_comments,internal_todos";
const TX_SELECT_LEGACY =
  "id,match_id,title,stage,outcome,context,notes";

function parsePipelineTxnStage(raw: unknown): PipelineTransactionStage {
  return raw === "closed" ? "closed" : "active";
}

function shapeMatchTransactionRow(
  data: Record<string, unknown>,
): CreatedMatchTransactionRow {
  return {
    id: String(data.id),
    match_id: String(data.match_id),
    title: data.title == null ? null : String(data.title),
    stage: parsePipelineTxnStage(data.stage),
    outcome: parseOutcome(data.outcome),
    context: data.context == null ? null : String(data.context),
    notes: data.notes == null ? null : String(data.notes),
    internal_comments: normalizeInternalComments(data.internal_comments),
    internal_todos: normalizeInternalTodos(data.internal_todos),
  };
}

export async function insertWorkspaceMatchTransaction(
  client: SupabaseClient,
  input: {
    match_id: string;
    title?: string | null;
    context?: string | null;
    notes?: string | null;
    stage?: PipelineTransactionStage;
  },
): Promise<CreatedMatchTransactionRow> {
  const stage = input.stage ?? "active";
  const { data, error } = await client
    .from("match_transactions")
    .insert({
      match_id: input.match_id,
      title: input.title ?? null,
      stage,
      outcome: null,
      context: input.context ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data || typeof (data as { id?: unknown }).id !== "string") {
    throw new Error("Insert returned no row");
  }
  const row = await fetchWorkspaceMatchTransactionById(
    client,
    String((data as { id: string }).id),
  );
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function fetchWorkspaceMatchTransactionById(
  client: SupabaseClient,
  id: string,
): Promise<CreatedMatchTransactionRow | null> {
  let { data, error } = await client
    .from("match_transactions")
    .select(TX_SELECT_FULL)
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingPipelineInternalWorkspaceColumnsError(error)) {
    ({ data, error } = await client
      .from("match_transactions")
      .select(TX_SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle());
  }
  if (error) throw error;
  if (!data) return null;
  return shapeMatchTransactionRow(data as Record<string, unknown>);
}

export async function updateWorkspaceMatchTransaction(
  client: SupabaseClient,
  id: string,
  input: {
    title: string | null;
    stage: PipelineTransactionStage;
    outcome: MatchOutcome | null;
    context: string | null;
    notes: string | null;
    internal_comments: PipelineInternalComment[];
    internal_todos: PipelineInternalTodo[];
  },
): Promise<CreatedMatchTransactionRow | null> {
  const outcome = input.stage === "closed" ? input.outcome : null;
  const payloadFull = {
    title: input.title,
    stage: input.stage,
    outcome,
    context: input.context,
    notes: input.notes,
    internal_comments: input.internal_comments,
    internal_todos: input.internal_todos,
  };
  const payloadLegacy = {
    title: input.title,
    stage: input.stage,
    outcome,
    context: input.context,
    notes: input.notes,
  };

  let { data, error } = await client
    .from("match_transactions")
    .update(payloadFull)
    .eq("id", id)
    .select(TX_SELECT_FULL)
    .maybeSingle();
  if (error && isMissingPipelineInternalWorkspaceColumnsError(error)) {
    ({ data, error } = await client
      .from("match_transactions")
      .update(payloadLegacy)
      .eq("id", id)
      .select(TX_SELECT_LEGACY)
      .maybeSingle());
  }
  if (error) throw error;
  if (!data) return null;
  return shapeMatchTransactionRow(data as Record<string, unknown>);
}

export async function moveWorkspaceMatchTransactionStage(
  client: SupabaseClient,
  input: {
    id: string;
    toStage: PipelineTransactionStage;
    outcome?: MatchOutcome | null;
  },
): Promise<CreatedMatchTransactionRow | null> {
  const current = await fetchWorkspaceMatchTransactionById(client, input.id);
  if (!current) return null;
  const targetOutcome =
    input.toStage === "closed" ? input.outcome ?? current.outcome : null;
  if (input.toStage === "closed" && !targetOutcome) return null;
  return updateWorkspaceMatchTransaction(client, input.id, {
    title: current.title,
    stage: input.toStage,
    outcome: targetOutcome,
    context: current.context,
    notes: current.notes,
    internal_comments: current.internal_comments,
    internal_todos: current.internal_todos,
  });
}

export type InsertWorkspaceTaskInput = {
  title: string;
  detail: string | null;
  source: "manual" | "meeting_note" | "email" | "import";
  due_at: string | null;
  task_type: WorkspaceTaskType;
  prompt: string | null;
  match_id: string | null;
  contact_id: string | null;
};

const TASK_INSERT_RETURN_COLUMNS =
  "id,title,detail,status,source,task_type,prompt,output,output_format,error," +
  "match_id,contact_id,due_at,started_at,completed_at,created_at,updated_at," +
  "match:matches!rex_tasks_match_id_fkey(" +
    "id," +
    "contact_a:contacts!matches_contact_a_id_fkey(id,name)," +
    "contact_b:contacts!matches_contact_b_id_fkey(id,name)" +
  ")," +
  "contact:contacts!rex_tasks_contact_id_fkey(id,name)";

export async function insertWorkspaceTask(
  client: SupabaseClient,
  input: InsertWorkspaceTaskInput,
): Promise<WorkspaceTaskRow> {
  const { data, error } = await client
    .from("rex_tasks")
    .insert({
      title: input.title,
      detail: input.detail,
      source: input.source,
      due_at: input.due_at,
      status: "pending",
      task_type: input.task_type,
      prompt: input.prompt,
      match_id: input.match_id,
      contact_id: input.contact_id,
    })
    .select(TASK_INSERT_RETURN_COLUMNS)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return mapTaskRow(data as unknown as Record<string, unknown>);
}

export async function markWorkspaceTaskRunning(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("rex_tasks")
    .update({
      status: "running" as WorkspaceTaskStatus,
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markWorkspaceTaskDone(
  client: SupabaseClient,
  id: string,
  output: { text: string; format: WorkspaceTaskOutputFormat },
): Promise<WorkspaceTaskRow | null> {
  const now = new Date().toISOString();
  const { error } = await client
    .from("rex_tasks")
    .update({
      status: "done" as WorkspaceTaskStatus,
      output: output.text,
      output_format: output.format,
      error: null,
      completed_at: now,
    })
    .eq("id", id);
  if (error) throw error;
  return fetchWorkspaceTaskByIdWithClient(client, id);
}

export async function markWorkspaceTaskFailed(
  client: SupabaseClient,
  id: string,
  message: string,
): Promise<WorkspaceTaskRow | null> {
  const now = new Date().toISOString();
  const { error } = await client
    .from("rex_tasks")
    .update({
      status: "failed" as WorkspaceTaskStatus,
      error: message.slice(0, 2000),
      completed_at: now,
    })
    .eq("id", id);
  if (error) throw error;
  return fetchWorkspaceTaskByIdWithClient(client, id);
}

export async function updateWorkspaceTaskStatus(
  client: SupabaseClient,
  id: string,
  status: Extract<WorkspaceTaskStatus, "pending" | "dismissed">,
): Promise<WorkspaceTaskRow | null> {
  const patch: Record<string, unknown> = { status };
  if (status === "pending") {
    patch.error = null;
    patch.completed_at = null;
  } else if (status === "dismissed") {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await client
    .from("rex_tasks")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
  return fetchWorkspaceTaskByIdWithClient(client, id);
}
