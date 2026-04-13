import { NextResponse } from "next/server";
import { parseDealUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceDealById,
  getWorkspaceWriteClient,
  insertDealStageHistory,
  listDealStageHistory,
  updateWorkspaceDeal,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await fetchWorkspaceDealById(client, id);
    if (!row) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    const stageHistory = await listDealStageHistory(client, id);
    return NextResponse.json({
      id: row.id,
      title: row.title,
      size: row.size,
      dealType: row.deal_type,
      dealStage: row.deal_stage,
      sector: row.sector,
      structure: row.structure,
      status: row.status,
      notes: row.notes,
      stageHistory,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/deals/[id]:", e);
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
  const fields = parseDealUpsertBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceDealById(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    const row = await updateWorkspaceDeal(client, id, {
      title: fields.value.title,
      size: fields.value.size,
      deal_type: fields.value.dealType,
      deal_stage: fields.value.dealStage,
      sector: fields.value.sector,
      structure: fields.value.structure,
      status: fields.value.status,
      notes: fields.value.notes,
    });
    if (!row) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (existing.deal_stage !== row.deal_stage) {
      await insertDealStageHistory(client, {
        deal_id: id,
        from_stage: existing.deal_stage,
        to_stage: row.deal_stage,
      });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/deals/[id]:", e);
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
