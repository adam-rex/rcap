import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  WORKSPACE_TASKS_PAGE_SIZE_DEFAULT,
  WORKSPACE_TASKS_PAGE_SIZE_MAX,
  type WorkspaceTaskOutputFormat,
  type WorkspaceTaskRow,
  type WorkspaceTaskStatus,
  type WorkspaceTaskType,
  type WorkspaceTasksPageResult,
} from "@/lib/data/workspace-tasks.types";

export {
  WORKSPACE_TASKS_PAGE_SIZE_DEFAULT,
  WORKSPACE_TASKS_PAGE_SIZE_MAX,
};
export type { WorkspaceTaskRow, WorkspaceTasksPageResult };

const TASK_COLUMNS =
  "id,title,detail,status,source,task_type,prompt,output,output_format,error," +
  "match_id,contact_id,due_at,started_at,completed_at,created_at,updated_at," +
  "match:matches!rex_tasks_match_id_fkey(" +
    "id," +
    "contact_a:contacts!matches_contact_a_id_fkey(id,name)," +
    "contact_b:contacts!matches_contact_b_id_fkey(id,name)" +
  ")," +
  "contact:contacts!rex_tasks_contact_id_fkey(id,name)";

function parseStatus(raw: unknown): WorkspaceTaskStatus {
  return raw === "running" ||
    raw === "done" ||
    raw === "dismissed" ||
    raw === "failed" ||
    raw === "pending"
    ? raw
    : "pending";
}

function parseSource(raw: unknown): "manual" | "meeting_note" | "email" | "import" {
  return raw === "manual" ||
    raw === "meeting_note" ||
    raw === "email" ||
    raw === "import"
    ? raw
    : "manual";
}

function parseTaskType(raw: unknown): WorkspaceTaskType {
  return raw === "draft_intro_email" ||
    raw === "compile_match_brief" ||
    raw === "research_counterparty" ||
    raw === "summarise_call_notes" ||
    raw === "custom"
    ? raw
    : "custom";
}

function parseOutputFormat(raw: unknown): WorkspaceTaskOutputFormat | null {
  return raw === "email_draft" ||
    raw === "brief" ||
    raw === "research" ||
    raw === "summary" ||
    raw === "note"
    ? raw
    : null;
}

type RawMatchJoin = {
  id: string;
  contact_a: { id: string; name: string | null } | null;
  contact_b: { id: string; name: string | null } | null;
} | null;

type RawContactJoin = {
  id: string;
  name: string | null;
} | null;

export function mapTaskRow(r: Record<string, unknown>): WorkspaceTaskRow {
  const match = r.match as RawMatchJoin | undefined;
  const contact = r.contact as RawContactJoin | undefined;
  return {
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    detail: r.detail == null ? null : String(r.detail),
    status: parseStatus(r.status),
    source: parseSource(r.source),
    taskType: parseTaskType(r.task_type),
    prompt: r.prompt == null ? null : String(r.prompt),
    output: r.output == null ? null : String(r.output),
    outputFormat: parseOutputFormat(r.output_format),
    error: r.error == null ? null : String(r.error),
    matchId: r.match_id == null ? null : String(r.match_id),
    match:
      match && match.id
        ? {
            id: String(match.id),
            contactAName: match.contact_a?.name ?? "(unknown)",
            contactBName: match.contact_b?.name ?? "(unknown)",
          }
        : null,
    contactId: r.contact_id == null ? null : String(r.contact_id),
    contact:
      contact && contact.id
        ? { id: String(contact.id), name: contact.name ?? "(unknown)" }
        : null,
    dueAt: r.due_at == null ? null : String(r.due_at),
    startedAt: r.started_at == null ? null : String(r.started_at),
    completedAt: r.completed_at == null ? null : String(r.completed_at),
    createdAt: r.created_at == null ? "" : String(r.created_at),
    updatedAt: r.updated_at == null ? "" : String(r.updated_at),
  };
}

export async function fetchWorkspaceTasksPageWithClient(
  client: SupabaseClient,
  params: {
    page: number;
    pageSize: number;
    status: string | null;
    matchId?: string | null;
    contactId?: string | null;
  },
): Promise<WorkspaceTasksPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_TASKS_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let q = client
    .from("rex_tasks")
    .select(TASK_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (
    params.status === "pending" ||
    params.status === "running" ||
    params.status === "done" ||
    params.status === "dismissed" ||
    params.status === "failed"
  ) {
    q = q.eq("status", params.status);
  }

  if (typeof params.matchId === "string" && params.matchId.length > 0) {
    q = q.eq("match_id", params.matchId);
  }
  if (typeof params.contactId === "string" && params.contactId.length > 0) {
    q = q.eq("contact_id", params.contactId);
  }

  const { data, error, count } = await q.range(start, end);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map((r) =>
    mapTaskRow(r as unknown as Record<string, unknown>),
  );
  const total =
    typeof count === "number" && Number.isFinite(count) ? count : rows.length;
  return { rows, total };
}

export async function getWorkspaceTasksPage(params: {
  page: number;
  pageSize: number;
  status: string | null;
  matchId?: string | null;
  contactId?: string | null;
}): Promise<WorkspaceTasksPageResult> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  return fetchWorkspaceTasksPageWithClient(service ?? userScoped, params);
}

export async function fetchWorkspaceTaskByIdWithClient(
  client: SupabaseClient,
  id: string,
): Promise<WorkspaceTaskRow | null> {
  const { data, error } = await client
    .from("rex_tasks")
    .select(TASK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapTaskRow(data as unknown as Record<string, unknown>);
}
