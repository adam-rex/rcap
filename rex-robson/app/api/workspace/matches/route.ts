import { NextResponse } from "next/server";
import { parseMatchUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { readJsonObject } from "@/lib/api/workspace-post-parse";
import { sanitizeWorkspaceListSearch } from "@/lib/data/workspace-search-sanitize";
import {
  WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT,
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-matches-page";
import { getWorkspaceMatchPairsPage } from "@/lib/data/workspace-opportunities-page";
import {
  getWorkspaceWriteClient,
  insertMatchStageHistory,
  insertWorkspaceMatch,
} from "@/lib/data/workspace-mutations";

export async function POST(req: Request) {
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
    const row = await insertWorkspaceMatch(client, {
      contact_a_id: fields.value.contactAId,
      contact_b_id: fields.value.contactBId,
      kind: fields.value.kind,
      stage: fields.value.stage,
      outcome: fields.value.outcome,
      context: fields.value.context,
      notes: fields.value.notes,
      introduction_at:
        fields.value.stage === "introduced"
          ? new Date().toISOString()
          : null,
      introduction_notes: null,
    });
    await insertMatchStageHistory(client, {
      match_id: row.id,
      from_stage: null,
      to_stage: row.stage,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/workspace/matches:", e);
    }
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        {
          error:
            "An open match for this pair already exists. Move it to Closed first.",
        },
        { status: 409 },
      );
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
    : WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT;

  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (
    !Number.isFinite(pageSize) ||
    pageSize < 1 ||
    pageSize > WORKSPACE_MATCHES_PAGE_SIZE_MAX
  ) {
    return NextResponse.json(
      { error: `pageSize must be 1–${WORKSPACE_MATCHES_PAGE_SIZE_MAX}` },
      { status: 400 },
    );
  }

  const search = sanitizeWorkspaceListSearch(qRaw);

  try {
    const result = await getWorkspaceMatchPairsPage({ search, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] /api/workspace/matches:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "If this mentions matches, apply the latest Supabase migration (20260422120000_create_matches_and_history.sql).",
      },
      { status: 503 },
    );
  }
}
