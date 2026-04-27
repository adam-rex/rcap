import { NextResponse } from "next/server";
import { parseMatchTransactionPatchBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceMatchTransactionById,
  getWorkspaceWriteClient,
  updateWorkspaceMatchTransaction,
} from "@/lib/data/workspace-mutations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  normalizeInternalComments,
  normalizeInternalTodos,
} from "@/lib/data/workspace-matches-page";
import type { WorkspacePipelineTransactionRow } from "@/lib/data/workspace-matches-page.types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type RawTxnDetail = {
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

function shapeDetail(raw: RawTxnDetail): WorkspacePipelineTransactionRow | null {
  const m = raw.match;
  if (!m) return null;
  const st = raw.stage === "closed" ? "closed" : "active";
  const oc = raw.outcome;
  const outcome =
    oc === "won" || oc === "lost" || oc === "passed" ? oc : null;
  const kd = m.kind === "founder_lender" ? "founder_lender" : "founder_investor";
  return {
    id: String(raw.id),
    match_id: String(raw.match_id),
    contact_a_id: String(m.contact_a_id),
    contact_b_id: String(m.contact_b_id),
    contact_a_name: m.contact_a?.name ?? "(unknown)",
    contact_b_name: m.contact_b?.name ?? "(unknown)",
    kind: kd,
    stage: st,
    outcome: st === "closed" ? outcome : null,
    context: raw.context == null ? null : String(raw.context),
    notes: raw.notes == null ? null : String(raw.notes),
    title: raw.title == null ? null : String(raw.title),
    internal_comments: normalizeInternalComments(raw.internal_comments),
    internal_todos: normalizeInternalTodos(raw.internal_todos),
  };
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const service = tryCreateServiceRoleClient();
    const userScoped = await createServerSupabaseClient();
    const client = service ?? userScoped;

    const select =
      "id,match_id,title,stage,outcome,context,notes,internal_comments,internal_todos," +
      "match:matches!inner(contact_a_id,contact_b_id,kind," +
      "contact_a:contacts!matches_contact_a_id_fkey(name)," +
      "contact_b:contacts!matches_contact_b_id_fkey(name))";

    const { data, error } = await client
      .from("match_transactions")
      .select(select)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const row = data ? shapeDetail(data as unknown as RawTxnDetail) : null;
    if (!row) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ ...row, stageHistory: [] as unknown[] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/match-transactions/[id]:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const fields = parseMatchTransactionPatchBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceMatchTransactionById(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    const p = fields.value;
    const nextStage = p.stage !== undefined ? p.stage : existing.stage;
    const nextOutcome =
      nextStage === "closed"
        ? p.outcome !== undefined
          ? p.outcome
          : existing.outcome
        : null;
    if (nextStage === "closed" && nextOutcome == null) {
      return NextResponse.json(
        { error: "outcome is required when stage is closed." },
        { status: 400 },
      );
    }
    const row = await updateWorkspaceMatchTransaction(client, id, {
      title: p.title !== undefined ? p.title : existing.title,
      stage: nextStage,
      outcome: nextOutcome,
      context: p.context !== undefined ? p.context : existing.context,
      notes: p.notes !== undefined ? p.notes : existing.notes,
      internal_comments:
        p.internalComments !== undefined
          ? p.internalComments
          : existing.internal_comments,
      internal_todos:
        p.internalTodos !== undefined ? p.internalTodos : existing.internal_todos,
    });
    if (!row) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] PATCH /api/workspace/match-transactions/[id]:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
