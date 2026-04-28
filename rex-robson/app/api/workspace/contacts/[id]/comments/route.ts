import { NextResponse } from "next/server";
import {
  isValidUuid,
  parseRequiredString,
  readJsonObject,
} from "@/lib/api/workspace-post-parse";
import { extractDbErrorMessage } from "@/lib/api/db-errors";
import {
  getWorkspaceWriteClient,
  insertWorkspaceContactComment,
  listWorkspaceContactComments,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const rows = await listWorkspaceContactComments(client, id);
    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    const message = extractDbErrorMessage(e, "Could not load comments.");
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] GET /api/workspace/contacts/[id]/comments:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const bodyField = parseRequiredString(parsed.body, "body", 8000);
  if (!bodyField.ok) {
    return NextResponse.json({ error: bodyField.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await insertWorkspaceContactComment(
      client,
      id,
      bodyField.value,
    );
    return NextResponse.json({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
    });
  } catch (e) {
    const message = extractDbErrorMessage(e, "Could not save comment.");
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] POST /api/workspace/contacts/[id]/comments:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
