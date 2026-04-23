import { NextResponse } from "next/server";
import { parseMatchUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceMatchById,
  getWorkspaceWriteClient,
  insertMatchStageHistory,
  listMatchStageHistory,
  updateWorkspaceMatch,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await fetchWorkspaceMatchById(client, id);
    if (!row) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const stageHistory = await listMatchStageHistory(client, id);
    return NextResponse.json({
      id: row.id,
      contactAId: row.contact_a_id,
      contactBId: row.contact_b_id,
      kind: row.kind,
      stage: row.stage,
      outcome: row.outcome,
      context: row.context,
      notes: row.notes,
      suggestionId: row.suggestion_id,
      stageHistory,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/matches/[id]:", e);
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
  const fields = parseMatchUpsertBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceMatchById(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const row = await updateWorkspaceMatch(client, id, {
      kind: fields.value.kind,
      stage: fields.value.stage,
      outcome: fields.value.outcome,
      context: fields.value.context,
      notes: fields.value.notes,
    });
    if (!row) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (existing.stage !== row.stage) {
      await insertMatchStageHistory(client, {
        match_id: id,
        from_stage: existing.stage,
        to_stage: row.stage,
      });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/matches/[id]:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "Ensure Supabase RLS allows updates (authenticated) or set SUPABASE_SERVICE_ROLE_KEY for local dev.",
      },
      { status: 503 },
    );
  }
}
