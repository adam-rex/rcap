import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";

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
    })
    .select("id,name,contact_type,sector,role,geography,phone,email,organisation_id")
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
  role: string | null;
  geography: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export async function fetchWorkspaceContactById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceContactDetail | null> {
  const { data, error } = await client
    .from("contacts")
    .select("id,name,contact_type,sector,organisation_id,role,geography,phone,email,notes")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    contact_type: data.contact_type == null ? null : String(data.contact_type),
    sector: data.sector == null ? null : String(data.sector),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    phone: data.phone == null ? null : String(data.phone),
    email: data.email == null ? null : String(data.email),
    notes: data.notes == null ? null : String(data.notes),
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
    })
    .eq("id", id)
    .select("id,name,contact_type,sector,role,geography,phone,email,organisation_id")
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
  };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export type MatchKind = "founder_investor" | "founder_lender";
export type MatchStage = "introduced" | "active" | "closed";
export type MatchOutcome = "won" | "lost" | "passed";

export type CreatedMatchRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: MatchKind;
  stage: MatchStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
  suggestion_id: string | null;
};

export type MatchStageHistoryRow = {
  id: number;
  match_id: string;
  from_stage: MatchStage | null;
  to_stage: MatchStage;
  changed_by: string | null;
  changed_at: string;
};

function parseStage(raw: unknown): MatchStage {
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
    stage: parseStage(data.stage),
    outcome: parseOutcome(data.outcome),
    context: data.context == null ? null : String(data.context),
    notes: data.notes == null ? null : String(data.notes),
    suggestion_id:
      data.suggestion_id == null ? null : String(data.suggestion_id),
  };
}

const MATCH_SELECT =
  "id,contact_a_id,contact_b_id,kind,stage,outcome,context,notes,suggestion_id";

export async function insertWorkspaceMatch(
  client: SupabaseClient,
  input: {
    contact_a_id: string;
    contact_b_id: string;
    kind: MatchKind;
    stage?: MatchStage;
    outcome?: MatchOutcome | null;
    context: string | null;
    notes: string | null;
    suggestion_id?: string | null;
  },
): Promise<CreatedMatchRow> {
  const stage = input.stage ?? "introduced";
  const outcome = stage === "closed" ? input.outcome ?? null : null;
  const { data, error } = await client
    .from("matches")
    .insert({
      contact_a_id: input.contact_a_id,
      contact_b_id: input.contact_b_id,
      kind: input.kind,
      stage,
      outcome,
      context: input.context,
      notes: input.notes,
      suggestion_id: input.suggestion_id ?? null,
    })
    .select(MATCH_SELECT)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return shapeMatchRow(data as Record<string, unknown>);
}

export type WorkspaceMatchDetail = CreatedMatchRow;

export async function fetchWorkspaceMatchById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceMatchDetail | null> {
  const { data, error } = await client
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return shapeMatchRow(data as Record<string, unknown>);
}

export async function updateWorkspaceMatch(
  client: SupabaseClient,
  id: string,
  input: {
    kind: MatchKind;
    stage: MatchStage;
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
    from_stage: MatchStage | null;
    to_stage: MatchStage;
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
    toStage: MatchStage;
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
    from_stage: row.from_stage == null ? null : parseStage(row.from_stage),
    to_stage: parseStage(row.to_stage),
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
 * Accept a suggestion: mark it `acted` and create a corresponding match at the
 * `introduced` stage. Returns the new match row plus the suggestion that was
 * acted on. Bails if the suggestion is missing pair fields.
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

  const match = await insertWorkspaceMatch(client, {
    contact_a_id: suggestion.contact_a_id,
    contact_b_id: suggestion.contact_b_id,
    kind: suggestion.kind,
    stage: "introduced",
    context: suggestion.body,
    notes: null,
    suggestion_id: suggestion.id,
  });
  await insertMatchStageHistory(client, {
    match_id: match.id,
    from_stage: null,
    to_stage: "introduced",
  });
  await updateWorkspaceSuggestionStatus(client, id, "acted");

  return { ok: true, match, suggestion };
}

export type CreatedRexTaskRow = {
  id: string;
  title: string;
  detail: string | null;
  status: "pending" | "running" | "done" | "dismissed";
  source: "manual" | "meeting_note" | "email" | "import";
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertWorkspaceTask(
  client: SupabaseClient,
  input: {
    title: string;
    detail: string | null;
    source: "manual" | "meeting_note" | "email" | "import";
    due_at: string | null;
  },
): Promise<CreatedRexTaskRow> {
  const { data, error } = await client
    .from("rex_tasks")
    .insert({
      title: input.title,
      detail: input.detail,
      source: input.source,
      due_at: input.due_at,
      status: "pending",
    })
    .select("id,title,detail,status,source,due_at,created_at,updated_at")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  const statusRaw = data.status;
  const status =
    statusRaw === "pending" ||
    statusRaw === "running" ||
    statusRaw === "done" ||
    statusRaw === "dismissed"
      ? statusRaw
      : "pending";
  const sourceRaw = data.source;
  const source =
    sourceRaw === "manual" ||
    sourceRaw === "meeting_note" ||
    sourceRaw === "email" ||
    sourceRaw === "import"
      ? sourceRaw
      : "manual";

  return {
    id: String(data.id ?? ""),
    title: String(data.title ?? ""),
    detail: data.detail == null ? null : String(data.detail),
    status,
    source,
    due_at: data.due_at == null ? null : String(data.due_at),
    created_at: data.created_at == null ? "" : String(data.created_at),
    updated_at: data.updated_at == null ? "" : String(data.updated_at),
  };
}
