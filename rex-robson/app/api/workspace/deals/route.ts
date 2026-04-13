import { NextResponse } from "next/server";
import { parseDealUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { readJsonObject } from "@/lib/api/workspace-post-parse";
import { sanitizeWorkspaceListSearch } from "@/lib/data/workspace-search-sanitize";
import {
  getWorkspaceDealsPage,
  WORKSPACE_DEALS_PAGE_SIZE_DEFAULT,
  WORKSPACE_DEALS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-deals-page";
import {
  getWorkspaceWriteClient,
  insertDealStageHistory,
  insertWorkspaceDeal,
} from "@/lib/data/workspace-mutations";

export async function POST(req: Request) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const fields = parseDealUpsertBody(body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await insertWorkspaceDeal(client, {
      title: fields.value.title,
      size: fields.value.size,
      deal_type: fields.value.dealType,
      deal_stage: fields.value.dealStage,
      sector: fields.value.sector,
      structure: fields.value.structure,
      status: fields.value.status,
      notes: fields.value.notes,
    });
    await insertDealStageHistory(client, {
      deal_id: row.id,
      from_stage: null,
      to_stage: row.deal_stage,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/workspace/deals:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "Ensure Supabase RLS allows inserts (authenticated) or set SUPABASE_SERVICE_ROLE_KEY for local dev.",
      },
      { status: 503 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q") ?? url.searchParams.get("search") ?? "";
  const pageRaw = url.searchParams.get("page");
  const sizeRaw = url.searchParams.get("pageSize") ?? url.searchParams.get("limit");

  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const pageSize = sizeRaw
    ? Number.parseInt(sizeRaw, 10)
    : WORKSPACE_DEALS_PAGE_SIZE_DEFAULT;

  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (
    !Number.isFinite(pageSize) ||
    pageSize < 1 ||
    pageSize > WORKSPACE_DEALS_PAGE_SIZE_MAX
  ) {
    return NextResponse.json(
      { error: `pageSize must be 1–${WORKSPACE_DEALS_PAGE_SIZE_MAX}` },
      { status: 400 },
    );
  }

  const search = sanitizeWorkspaceListSearch(qRaw);

  try {
    const result = await getWorkspaceDealsPage({
      search,
      page,
      pageSize,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] /api/workspace/deals:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "If this mentions workspace_deals_page, apply the latest Supabase migration (20260413230000_deal_stages_and_history.sql).",
      },
      { status: 503 },
    );
  }
}
