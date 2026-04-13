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
  role: string | null;
  geography: string | null;
  organisation_id: string | null;
};

export async function insertWorkspaceContact(
  client: SupabaseClient,
  input: {
    name: string;
    organisation_id: string | null;
    role: string | null;
    geography: string | null;
    notes: string | null;
  },
): Promise<CreatedContactRow> {
  const { data, error } = await client
    .from("contacts")
    .insert({
      name: input.name,
      organisation_id: input.organisation_id,
      role: input.role,
      geography: input.geography,
      notes: input.notes,
    })
    .select("id,name,role,geography,organisation_id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
  };
}

export type CreatedDealRow = {
  id: string;
  title: string;
  size: number | null;
  deal_type: string | null;
  sector: string | null;
  structure: string | null;
  status: string | null;
};

export async function insertWorkspaceDeal(
  client: SupabaseClient,
  input: {
    title: string;
    size: number | null;
    deal_type: string | null;
    sector: string | null;
    structure: string | null;
    status: string | null;
    notes: string | null;
  },
): Promise<CreatedDealRow> {
  const { data, error } = await client
    .from("deals")
    .insert({
      title: input.title,
      size: input.size,
      deal_type: input.deal_type,
      sector: input.sector,
      structure: input.structure,
      status: input.status,
      notes: input.notes,
    })
    .select("id,title,size,deal_type,sector,structure,status")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  const rawSize = data.size;
  let size: number | null = null;
  if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
    size = rawSize;
  } else if (typeof rawSize === "string") {
    const n = Number.parseFloat(rawSize);
    size = Number.isFinite(n) ? n : null;
  }

  return {
    id: String(data.id),
    title: String(data.title ?? ""),
    size,
    deal_type: data.deal_type == null ? null : String(data.deal_type),
    sector: data.sector == null ? null : String(data.sector),
    structure: data.structure == null ? null : String(data.structure),
    status: data.status == null ? null : String(data.status),
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
  organisation_id: string | null;
  role: string | null;
  geography: string | null;
  notes: string | null;
};

export async function fetchWorkspaceContactById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceContactDetail | null> {
  const { data, error } = await client
    .from("contacts")
    .select("id,name,organisation_id,role,geography,notes")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    notes: data.notes == null ? null : String(data.notes),
  };
}

export async function updateWorkspaceContact(
  client: SupabaseClient,
  id: string,
  input: {
    name: string;
    organisation_id: string | null;
    role: string | null;
    geography: string | null;
    notes: string | null;
  },
): Promise<CreatedContactRow | null> {
  const { data, error } = await client
    .from("contacts")
    .update({
      name: input.name,
      organisation_id: input.organisation_id,
      role: input.role,
      geography: input.geography,
      notes: input.notes,
    })
    .eq("id", id)
    .select("id,name,role,geography,organisation_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    role: data.role == null ? null : String(data.role),
    geography: data.geography == null ? null : String(data.geography),
    organisation_id:
      data.organisation_id == null ? null : String(data.organisation_id),
  };
}

export type WorkspaceDealDetail = CreatedDealRow & { notes: string | null };

function parseDealSize(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchWorkspaceDealById(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceDealDetail | null> {
  const { data, error } = await client
    .from("deals")
    .select("id,title,size,deal_type,sector,structure,status,notes")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    title: String(data.title ?? ""),
    size: parseDealSize(data.size),
    deal_type: data.deal_type == null ? null : String(data.deal_type),
    sector: data.sector == null ? null : String(data.sector),
    structure: data.structure == null ? null : String(data.structure),
    status: data.status == null ? null : String(data.status),
    notes: data.notes == null ? null : String(data.notes),
  };
}

export async function updateWorkspaceDeal(
  client: SupabaseClient,
  id: string,
  input: {
    title: string;
    size: number | null;
    deal_type: string | null;
    sector: string | null;
    structure: string | null;
    status: string | null;
    notes: string | null;
  },
): Promise<CreatedDealRow | null> {
  const { data, error } = await client
    .from("deals")
    .update({
      title: input.title,
      size: input.size,
      deal_type: input.deal_type,
      sector: input.sector,
      structure: input.structure,
      status: input.status,
      notes: input.notes,
    })
    .eq("id", id)
    .select("id,title,size,deal_type,sector,structure,status")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const size = parseDealSize(data.size);

  return {
    id: String(data.id),
    title: String(data.title ?? ""),
    size,
    deal_type: data.deal_type == null ? null : String(data.deal_type),
    sector: data.sector == null ? null : String(data.sector),
    structure: data.structure == null ? null : String(data.structure),
    status: data.status == null ? null : String(data.status),
  };
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

export type CreatedSuggestionRow = {
  id: string;
  title: string | null;
  body: string | null;
};

export async function insertWorkspaceSuggestion(
  client: SupabaseClient,
  input: { title: string | null; body: string | null },
): Promise<CreatedSuggestionRow> {
  const { data, error } = await client
    .from("suggestions")
    .insert({
      title: input.title,
      body: input.body,
      status: "pending",
    })
    .select("id,title,body")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return {
    id: String(data.id),
    title: data.title == null ? null : String(data.title),
    body: data.body == null ? null : String(data.body),
  };
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
