import { NextResponse } from "next/server";
import {
  parseCreateMatchTransactionBody,
} from "@/lib/api/workspace-entity-bodies";
import { readJsonObject } from "@/lib/api/workspace-post-parse";
import { sanitizeWorkspaceListSearch } from "@/lib/data/workspace-search-sanitize";
import {
  getWorkspaceMatchesPage,
  WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT,
  WORKSPACE_MATCHES_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-matches-page";
import { supabaseErrorSummary } from "@/lib/data/supabase-error-guards";
import {
  fetchWorkspaceMatchById,
  getWorkspaceWriteClient,
  insertWorkspaceMatchTransaction,
} from "@/lib/data/workspace-mutations";

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
    const result = await getWorkspaceMatchesPage({ search, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    const message = supabaseErrorSummary(e);
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/match-transactions:", e);
    }
    return NextResponse.json(
      {
        error: message || "Query failed",
        hint:
          message.includes("internal_comments") ||
          message.includes("internal_todos")
            ? "Apply Supabase migrations (e.g. 20260427160000_match_transactions_internal_workspace.sql) or run `supabase db push`."
            : undefined,
      },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const fields = parseCreateMatchTransactionBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const match = await fetchWorkspaceMatchById(client, fields.value.matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.stage !== "introduced") {
      return NextResponse.json(
        {
          error:
            "Pipeline deals can only be created for open introductions (Opportunities).",
        },
        { status: 422 },
      );
    }
    const row = await insertWorkspaceMatchTransaction(client, {
      match_id: fields.value.matchId,
      title: fields.value.title,
      context: fields.value.context,
      notes: fields.value.notes,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/workspace/match-transactions:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
