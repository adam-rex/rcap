import { NextResponse } from "next/server";
import { parseContactUpsertBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceContactById,
  getWorkspaceWriteClient,
  updateWorkspaceContact,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await fetchWorkspaceContactById(client, id);
    if (!row) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: row.id,
      name: row.name,
      contactType: row.contact_type,
      sector: row.sector,
      organisationId: row.organisation_id,
      role: row.role,
      geography: row.geography,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/contacts/[id]:", e);
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
  const fields = parseContactUpsertBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await updateWorkspaceContact(client, id, {
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
    if (!row) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/contacts/[id]:", e);
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
