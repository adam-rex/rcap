import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  fetchWorkspaceEmailDetail,
  setWorkspaceEmailArchived,
} from "@/lib/data/workspace-emails";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const row = await fetchWorkspaceEmailDetail(id);
    if (!row) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      receivedAt: row.receivedAt,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
      toAddresses: row.toAddresses,
      subject: row.subject,
      bodyText: row.bodyText,
      bodyHtml: row.bodyHtml,
      snippet: row.snippet,
      threadParticipantCount: row.threadParticipantCount,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        canDownload: Boolean(a.storageBucket && a.storagePath),
      })),
      extractions: row.extractions.map((x) => ({
        id: x.id,
        kind: x.kind,
        status: x.status,
        title: x.title,
        summary: x.summary,
        detail: x.detail,
        payload: x.payload,
        createdContactId: x.createdContactId,
        createdOrganisationId: x.createdOrganisationId,
        createdSuggestionId: x.createdSuggestionId,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/emails/[id]:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

function parseArchiveBody(
  body: Record<string, unknown>,
): { ok: true; archived: boolean } | { ok: false; error: string } {
  const v = body.archived;
  if (typeof v !== "boolean") {
    return { ok: false, error: "archived must be a boolean" };
  }
  return { ok: true, archived: v };
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
  const fields = parseArchiveBody(parsed.body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  try {
    const row = await setWorkspaceEmailArchived(id, fields.archived);
    if (!row) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: row.id,
      archivedAt: row.archivedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/emails/[id]:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "Ensure rex_inbound_emails.archived_at exists (migration 20260506120000_rex_inbound_emails_archived_at.sql) and RLS allows updates.",
      },
      { status: 503 },
    );
  }
}
