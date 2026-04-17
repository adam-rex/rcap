import { NextResponse } from "next/server";
import { parseContactUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { readJsonObject } from "@/lib/api/workspace-post-parse";
import { sanitizeWorkspaceListSearch } from "@/lib/data/workspace-search-sanitize";
import {
  getWorkspaceContactsPage,
  WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT,
  WORKSPACE_CONTACTS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-contacts-page";
import {
  getWorkspaceWriteClient,
  insertWorkspaceContact,
} from "@/lib/data/workspace-mutations";

export async function POST(req: Request) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const fields = parseContactUpsertBody(body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await insertWorkspaceContact(client, {
      name: fields.value.name,
      contact_type: fields.value.contactType,
      sector: fields.value.sector,
      organisation_id: fields.value.organisationId,
      role: fields.value.role,
      geography: fields.value.geography,
      phone: fields.value.phone,
      email: fields.value.email,
      notes: fields.value.notes,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/workspace/contacts:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "If organisationId is set, it must exist. For local dev, set SUPABASE_SERVICE_ROLE_KEY or sign in.",
      },
      { status: 503 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q") ?? url.searchParams.get("search") ?? "";
  const roleRaw = url.searchParams.get("role") ?? "";
  const organisationTypeRaw =
    url.searchParams.get("organisationType") ??
    url.searchParams.get("orgType") ??
    "";
  const pageRaw = url.searchParams.get("page");
  const sizeRaw = url.searchParams.get("pageSize") ?? url.searchParams.get("limit");

  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const pageSize = sizeRaw
    ? Number.parseInt(sizeRaw, 10)
    : WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT;

  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (
    !Number.isFinite(pageSize) ||
    pageSize < 1 ||
    pageSize > WORKSPACE_CONTACTS_PAGE_SIZE_MAX
  ) {
    return NextResponse.json(
      { error: `pageSize must be 1–${WORKSPACE_CONTACTS_PAGE_SIZE_MAX}` },
      { status: 400 },
    );
  }

  const search = sanitizeWorkspaceListSearch(qRaw);
  const role = sanitizeWorkspaceListSearch(roleRaw);
  const organisationType = sanitizeWorkspaceListSearch(organisationTypeRaw);

  try {
    const result = await getWorkspaceContactsPage({
      search,
      page,
      pageSize,
      role,
      organisationType,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] /api/workspace/contacts:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "If this mentions workspace_contacts_page, apply the latest Supabase migration (20260413150000_workspace_contacts_page.sql).",
      },
      { status: 503 },
    );
  }
}
