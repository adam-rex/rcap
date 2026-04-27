import { NextResponse } from "next/server";
import {
  parseMatchTransactionUpsertBody,
} from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceMatchTransactionById,
  getWorkspaceWriteClient,
  updateWorkspaceMatchTransaction,
} from "@/lib/data/workspace-mutations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
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
      "id,match_id,title,stage,outcome,context,notes," +
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
  const fields = parseMatchTransactionUpsertBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }
  if (fields.value.stage === "closed" && fields.value.outcome == null) {
    return NextResponse.json(
      { error: "outcome is required when stage is closed." },
      { status: 400 },
    );
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceMatchTransactionById(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    const row = await updateWorkspaceMatchTransaction(client, id, {
      title: fields.value.title,
      stage: fields.value.stage,
      outcome: fields.value.outcome,
      context: fields.value.context,
      notes: fields.value.notes,
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
